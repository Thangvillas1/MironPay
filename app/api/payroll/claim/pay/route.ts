import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { verifyPin } from '@/app/lib/pin'
import { circleClient } from '@/app/lib/circle'
import { sendPayrollClaimEmail } from '@/app/lib/email'
import {
  USDC,
  publicClient,
  payrollClaimContract,
  boxIdForClaim,
  withRpcRetry,
  PAYROLL_CLAIM_ABI,
} from '@/app/lib/payroll-claim-chain'

const MEMO_CONTRACT = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505' // same Memo contract used by app/api/wallet/transfer/route.ts

// approve() + payBatch() are two sequential on-chain waits — easily longer
// than Vercel's default 10s Hobby function timeout. 60s is the Hobby plan max.
export const maxDuration = 60

interface InputItem {
  email: string
  amount: number
  note?: string
}

const DEFAULT_EXPIRY_SECONDS = 10 * 24 * 60 * 60 // 10 days

async function waitForCircleTx(txId: string): Promise<string> {
  const confirmed = await circleClient.getTransaction({ id: txId, waitForState: 'COMPLETE', pollingInterval: 1500 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txHash = (confirmed.data as any)?.transaction?.txHash
  if (!txHash) throw new Error('Transaction did not reach a confirmed state')
  return txHash
}

/**
 * Beta 1.1.1 payroll: every recipient — new or returning MironPay user
 * alike — is paid via a precomputed Claim Box, no employee pre-registration.
 * Input is a plain email+amount list, matching a Circle-style payroll UX.
 */
export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const period = body?.period as string | undefined
  const items = body?.items as InputItem[] | undefined
  const expirySeconds: number = body?.expirySeconds ?? DEFAULT_EXPIRY_SECONDS
  const pin = body?.pin as string | undefined
  const idempotencyKey = body?.idempotencyKey as string | undefined

  // Checked before PIN verification: a duplicate submission (same key
  // already used) should hand back the original result, not prompt for
  // (or re-spend) anything a second time.
  if (idempotencyKey) {
    const { data: existingRun } = await supabase
      .from('payroll_claim_runs')
      .select('*')
      .eq('user_id', user.id)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existingRun) {
      return NextResponse.json({ run: existingRun, txHash: existingRun.tx_hash, deduplicated: true })
    }
  }

  const pinResult = await verifyPin(supabase, user.id, pin ?? '')
  if (!pinResult.ok) {
    return NextResponse.json({ error: pinResult.error }, { status: pinResult.error === 'Incorrect PIN' ? 401 : 400 })
  }

  if (!period || typeof period !== 'string') {
    return NextResponse.json({ error: 'Missing period' }, { status: 400 })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'No items provided' }, { status: 400 })
  }
  const seenEmails = new Set<string>()
  for (const item of items) {
    if (!item.email || typeof item.email !== 'string' || !item.email.includes('@')) {
      return NextResponse.json({ error: `Invalid email: ${item.email}` }, { status: 400 })
    }
    if (!(item.amount > 0)) {
      return NextResponse.json({ error: `Invalid amount for ${item.email}` }, { status: 400 })
    }
    // Two items with the same email in one run derive the same boxId
    // (boxIdForClaim is keyed on email + runId) — payBatch would silently
    // fund both amounts into a single shared box, and the DB would keep two
    // "paid" rows for one already-claimed box. Reject before it happens.
    const key = item.email.trim().toLowerCase()
    if (seenEmails.has(key)) {
      return NextResponse.json({ error: `Duplicate email in this run: ${key}` }, { status: 400 })
    }
    seenEmails.add(key)
  }
  if (!(expirySeconds > 0)) {
    return NextResponse.json({ error: 'expirySeconds must be > 0' }, { status: 400 })
  }

  const wallet = await resolveCircleWalletId(supabase, user.id)
  if (!wallet) return NextResponse.json({ error: 'Company wallet not found' }, { status: 400 })

  const contract = payrollClaimContract()

  const feeBps = await withRpcRetry(() =>
    publicClient.readContract({ address: contract, abi: PAYROLL_CLAIM_ABI, functionName: 'feeBps' })
  )

  const microAmounts = items.map((i) => BigInt(Math.round(i.amount * 1_000_000)))
  const totalMicro = microAmounts.reduce((a, b) => a + b, 0n)
  const feeMicro = (totalMicro * feeBps) / 10000n
  const approveMicro = totalMicro + feeMicro

  // ── Preflight: check company USDC balance before touching the DB ──
  try {
    const balanceRes = await circleClient.getWalletTokenBalance({ id: wallet.circleWalletId })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const balances = (balanceRes.data?.tokenBalances as any[]) ?? []
    const usdcBal = balances.find((b) => b.token?.symbol === 'USDC' && b.token?.tokenAddress)
    const available = usdcBal ? parseFloat(usdcBal.amount) : 0
    const needed = Number(approveMicro) / 1_000_000
    if (needed > available) {
      return NextResponse.json(
        { error: `Insufficient balance: need ${needed.toFixed(6)} USDC (payroll + 0.1% fee), have ${available.toFixed(6)} USDC` },
        { status: 400 }
      )
    }
  } catch {
    return NextResponse.json({ error: 'Preflight failed: could not verify company wallet balance' }, { status: 400 })
  }

  // A run stuck in 'draft' means a previous request crashed before it could
  // reach 'paid'/'failed' (server restart, uncaught exception). Auto-expire
  // anything older than 5 minutes so it doesn't permanently block this user
  // from starting a new run (see the one-draft-per-user unique index).
  await supabase
    .from('payroll_claim_runs')
    .update({ status: 'failed', error_message: 'Stale draft auto-expired' })
    .eq('user_id', user.id)
    .eq('status', 'draft')
    .lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

  // ── Create the DB run first — its id feeds into boxId derivation below,
  //    so the same recipient gets a fresh, distinct Claim Box every run
  //    instead of a single lifetime-only address (see boxIdForClaim doc).
  //    The unique partial index (user_id where status='draft') guarantees
  //    only one payroll run per company can be in flight at a time — two
  //    concurrent submissions would otherwise both pass the preflight
  //    balance check above and then race each other on-chain. ──
  const { data: run, error: runErr } = await supabase
    .from('payroll_claim_runs')
    .insert({
      user_id: user.id,
      period,
      status: 'draft',
      total_amount: Number(totalMicro) / 1_000_000,
      fee_amount: Number(feeMicro) / 1_000_000,
      expiry_seconds: expirySeconds,
      idempotency_key: idempotencyKey ?? null,
    })
    .select()
    .single()

  if (runErr || !run) {
    // Race: a concurrent request with the same idempotencyKey won the
    // insert first (unique violation, Postgres code 23505). Fetch and
    // return that run instead of erroring — same intent as the earlier
    // pre-check, just covering the window between check and insert.
    if (idempotencyKey && runErr?.code === '23505') {
      const { data: existingRun } = await supabase
        .from('payroll_claim_runs')
        .select('*')
        .eq('user_id', user.id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (existingRun) {
        return NextResponse.json({ run: existingRun, txHash: existingRun.tx_hash, deduplicated: true })
      }
    }
    if (runErr?.code === '23505' && runErr.message.includes('one_draft_per_user')) {
      return NextResponse.json(
        { error: 'Another payroll run is already in progress for this account — wait for it to finish before starting a new one.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: runErr?.message ?? 'Failed to create run' }, { status: 500 })
  }

  const boxIds = items.map((i) => boxIdForClaim(i.email, run.id))
  const boxAddresses = await Promise.all(
    boxIds.map((boxId) =>
      withRpcRetry(() =>
        publicClient.readContract({ address: contract, abi: PAYROLL_CLAIM_ABI, functionName: 'computeBoxAddress', args: [boxId] })
      )
    )
  )

  const { error: itemsErr } = await supabase.from('payroll_claim_items').insert(
    items.map((item, i) => ({
      run_id: run.id,
      user_id: user.id,
      email: item.email.trim().toLowerCase(),
      note: item.note ?? null,
      amount: item.amount,
      box_id: boxIds[i],
      box_address: boxAddresses[i],
      status: 'pending',
    }))
  )

  if (itemsErr) {
    await supabase.from('payroll_claim_runs').update({ status: 'failed', error_message: itemsErr.message }).eq('id', run.id)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  // ── Broadcast: approve() then payBatch() via the company's Circle wallet ──
  let approved = false
  try {
    const approveTx = await circleClient.createContractExecutionTransaction({
      walletId: wallet.circleWalletId,
      contractAddress: USDC,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [contract, approveMicro.toString()],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey: crypto.randomUUID(),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await waitForCircleTx((approveTx.data as any)?.id)
    approved = true

    const payTx = await circleClient.createContractExecutionTransaction({
      walletId: wallet.circleWalletId,
      contractAddress: contract,
      abiFunctionSignature: 'payBatch(bytes32[],uint256[],uint64)',
      abiParameters: [boxIds, microAmounts.map((a) => a.toString()), expirySeconds.toString()],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey: crypto.randomUUID(),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txHash = await waitForCircleTx((payTx.data as any)?.id)

    await supabase.from('payroll_claim_runs').update({ status: 'paid', tx_hash: txHash, paid_at: new Date().toISOString() }).eq('id', run.id)
    await supabase.from('payroll_claim_items').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('run_id', run.id)

    // Best-effort: write each recipient's note on-chain via the existing
    // Memo contract, attached to their own precomputed box address (the
    // funds already sitting there). Fire-and-forget, same pattern as
    // app/api/wallet/transfer/route.ts — a memo failing to attach must
    // never affect the payroll result the company already sees as paid.
    items.forEach((item, i) => {
      if (!item.note?.trim()) return
      void circleClient.createContractExecutionTransaction({
        walletId: wallet.circleWalletId,
        contractAddress: MEMO_CONTRACT,
        abiFunctionSignature: 'attachMemo(address,bytes,string)',
        abiParameters: [boxAddresses[i], '0x', item.note.trim()],
        fee: { type: 'level', config: { feeLevel: 'LOW' } },
        idempotencyKey: crypto.randomUUID(),
      }).catch((e) => console.error('[payroll memo] attachMemo failed:', e))
    })

    // Best-effort notification: recipients need to know money is waiting,
    // but a failed send must never affect the payroll result the company
    // already sees as paid — same fire-and-forget contract as the memo above.
    items.forEach((item) => {
      void sendPayrollClaimEmail({
        to: item.email.trim().toLowerCase(),
        amount: item.amount,
        period,
        note: item.note,
      }).catch((e) => console.error('[payroll email] sendPayrollClaimEmail failed:', item.email, e))
    })

    const { data: finalRun } = await supabase.from('payroll_claim_runs').select('*').eq('id', run.id).single()
    return NextResponse.json({ run: finalRun, txHash })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Batch payment failed'
    // approve() succeeded but payBatch() didn't reach the chain — revoke the
    // leftover allowance so it doesn't sit on the contract indefinitely.
    // Best-effort only: never let a revoke failure mask the real error above.
    if (approved) {
      try {
        const revokeTx = await circleClient.createContractExecutionTransaction({
          walletId: wallet.circleWalletId,
          contractAddress: USDC,
          abiFunctionSignature: 'approve(address,uint256)',
          abiParameters: [contract, '0'],
          fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
          idempotencyKey: crypto.randomUUID(),
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await waitForCircleTx((revokeTx.data as any)?.id)
      } catch {
        // Leftover allowance is not a security issue (only this contract can
        // ever spend it, and only via payBatch's own bookkeeping) — just a
        // cleanup nicety, so a failed revoke isn't worth surfacing.
      }
    }
    await supabase.from('payroll_claim_runs').update({ status: 'failed', error_message: message }).eq('id', run.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
