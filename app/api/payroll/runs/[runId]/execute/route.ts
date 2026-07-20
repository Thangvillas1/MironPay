import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, encodeFunctionData, decodeEventLog, parseAbi, getAddress } from 'viem'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { circleClient } from '@/app/lib/circle'

const USDC = '0x3600000000000000000000000000000000000000'
const MULTICALL3_FROM = '0x522fAf9A91c41c443c66765030741e4AaCe147D0'
const EST_FEE_BUFFER_USDC = 0.5

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
])

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
}

const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })

interface RunItem {
  id: string
  employee_id: string
  wallet_address: string
  amount: number
  status: string
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', runId).single()
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (run.status !== 'approved') {
    return NextResponse.json({ error: 'Only an approved run can be executed (use retry for partially_paid runs)' }, { status: 400 })
  }

  const { data: pendingItems, error: itemsErr } = await supabase
    .from('payroll_run_items')
    .select('*')
    .eq('run_id', runId)
    .eq('status', 'pending')

  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  const items = (pendingItems ?? []) as RunItem[]
  if (items.length === 0) return NextResponse.json({ error: 'No pending items to execute' }, { status: 400 })

  // ── Preflight: broadcast NOTHING if any check fails ──────────────────────
  const wallet = await resolveCircleWalletId(supabase, user.id)
  if (!wallet) return NextResponse.json({ error: 'Company wallet not found' }, { status: 400 })

  let checksummedItems: (RunItem & { checksummed: `0x${string}` })[]
  try {
    checksummedItems = items.map((item) => ({ ...item, checksummed: getAddress(item.wallet_address) }))
  } catch {
    return NextResponse.json({ error: 'Preflight failed: one or more wallet addresses fail checksum validation' }, { status: 400 })
  }

  const totalPending = items.reduce((sum, i) => sum + i.amount, 0)
  try {
    const balanceRes = await circleClient.getWalletTokenBalance({ id: wallet.circleWalletId })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const balances = (balanceRes.data?.tokenBalances as any[]) ?? []
    const usdc = balances.find((b) => b.token?.symbol === 'USDC' && b.token?.tokenAddress)
    const available = usdc ? parseFloat(usdc.amount) : 0
    if (totalPending + EST_FEE_BUFFER_USDC > available) {
      return NextResponse.json({ error: `Preflight failed: total ${totalPending.toFixed(2)} USDC + est. fee exceeds balance (${available.toFixed(2)} USDC)` }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Preflight failed: could not verify company wallet balance' }, { status: 400 })
  }

  // ── All preflight checks passed — now we may broadcast ───────────────────
  await supabase.from('payroll_runs').update({ status: 'processing' }).eq('id', runId).eq('status', 'approved')

  const calls = checksummedItems.map((item) => ({
    target: USDC,
    allowFailure: true,
    callData: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [item.checksummed, BigInt(Math.round(item.amount * 1_000_000))],
    }),
  }))

  let txHash: string | null = null
  try {
    const tx = await circleClient.createContractExecutionTransaction({
      walletId: wallet.circleWalletId,
      contractAddress: MULTICALL3_FROM,
      abiFunctionSignature: 'aggregate3((address,bool,bytes)[])',
      abiParameters: [calls.map((c) => [c.target, c.allowFailure, c.callData])],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey: crypto.randomUUID(),
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txId = (tx.data as any)?.id
    const confirmed = await circleClient.getTransaction({ id: txId, waitForState: 'COMPLETE', pollingInterval: 1500 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txHash = (confirmed.data as any)?.transaction?.txHash ?? null
  } catch (err) {
    // Broadcast attempt failed after we flipped to processing — leave items
    // pending so a fresh execute attempt (not retry, since nothing succeeded)
    // can be made; revert status back to approved.
    await supabase.from('payroll_runs').update({ status: 'approved' }).eq('id', runId)
    return NextResponse.json({ error: `Batch execution failed: ${err instanceof Error ? err.message : 'unknown error'}` }, { status: 500 })
  }

  if (!txHash) {
    return NextResponse.json({ error: 'Transaction did not reach a confirmed state — check run status manually before retrying' }, { status: 500 })
  }

  // ── Per-item attribution ──────────────────────────────────────────────
  // Circle's transaction response doesn't surface aggregate3's per-call
  // Result[] directly, so we decode Transfer events from the receipt
  // instead. Items with no matching Transfer event are treated as failed
  // (their call reverted silently under allowFailure=true).
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` })
  const transferred = new Set<string>()

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== USDC.toLowerCase()) continue
    try {
      const decoded = decodeEventLog({ abi: ERC20_ABI, data: log.data, topics: log.topics, eventName: 'Transfer' })
      const to = (decoded.args as { to: string }).to.toLowerCase()
      const value = (decoded.args as { value: bigint }).value
      const matchKey = checksummedItems.find(
        (i) => i.checksummed.toLowerCase() === to && BigInt(Math.round(i.amount * 1_000_000)) === value && !transferred.has(i.id)
      )
      if (matchKey) transferred.add(matchKey.id)
    } catch {
      // not a Transfer log we recognize, skip
    }
  }

  for (const item of checksummedItems) {
    const confirmed = transferred.has(item.id)
    await supabase
      .from('payroll_run_items')
      .update({
        status: confirmed ? 'confirmed' : 'failed',
        tx_hash: txHash,
        error_message: confirmed ? null : 'Call did not emit a Transfer event — see batch tx for details',
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
  }

  const { data: allItems } = await supabase.from('payroll_run_items').select('status').eq('run_id', runId)
  const allConfirmed = (allItems ?? []).every((i) => i.status === 'confirmed')

  const { data: finalRun } = await supabase
    .from('payroll_runs')
    .update({
      status: allConfirmed ? 'paid' : 'partially_paid',
      paid_at: allConfirmed ? new Date().toISOString() : null,
    })
    .eq('id', runId)
    .select()
    .single()

  return NextResponse.json({ run: finalRun, txHash })
}
