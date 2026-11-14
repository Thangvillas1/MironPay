import { NextRequest, NextResponse } from 'next/server'
import { decodeFunctionData, erc20Abi, getAddress, isAddress, isHex, formatUnits, type Hex } from 'viem'
import { USDC_TOKEN } from '@/app/lib/arc-chain'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { circleClient } from '@/app/lib/circle'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { pinFailureHttp, verifyPin } from '@/app/lib/pin'

// WalletConnect: sign or send what a connected dapp asked for, from the
// user's MAIN wallet (Circle developer-controlled EOA), after the app showed
// the decoded request and the user entered their PIN.
//
// The phone never holds a key: it relays the dapp's JSON-RPC request here,
// this route re-validates everything (chain, from-address, scam flag, size)
// and asks Circle to sign/send. Every answer — including refusals — is
// written to wc_requests.

export const maxDuration = 60

const ARC_CHAIN = 'eip155:5042002'
const ARC_CHAIN_ID = 5042002
// A single dapp transaction above this needs an explicit second confirmation
// in the app (confirmLarge) — a guard against a drained wallet from one
// mistaken tap. Value is the native USDC sent with the call.
const LARGE_TX_USDC = 100
const SUPPORTED = ['personal_sign', 'eth_signTypedData_v4', 'eth_sendTransaction'] as const
type Method = (typeof SUPPORTED)[number]

type Dapp = { name?: string; url?: string; verified?: string; isScam?: boolean }

function sameAddr(a: unknown, b: string) {
  return typeof a === 'string' && isAddress(a) && a.toLowerCase() === b.toLowerCase()
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const method = body?.method as Method
  const params = body?.params as unknown[]
  const dapp = (body?.dapp ?? {}) as Dapp
  if (!SUPPORTED.includes(method) || !Array.isArray(params)) {
    return NextResponse.json({ error: 'Unsupported request', code: 'UNSUPPORTED_METHOD' }, { status: 400 })
  }

  const wallet = await resolveCircleWalletId(supabase, user.id)
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
  const me = wallet.walletAddress

  const admin = createAdminSupabaseClient()
  const log = (status: 'signed' | 'sent' | 'refused' | 'failed', summary: Record<string, unknown>, extra: { result?: string; error?: string } = {}) =>
    admin.from('wc_requests').insert({
      user_id: user.id,
      wallet_address: me,
      dapp_name: dapp.name?.slice(0, 120) ?? null,
      dapp_url: dapp.url?.slice(0, 300) ?? null,
      dapp_verified: dapp.verified ?? null,
      method,
      summary,
      status,
      result: extra.result ?? null,
      error: extra.error ?? null,
    }).then(({ error }) => { if (error) console.error('[wc] audit insert failed:', error.message) })

  const refuse = async (message: string, code: string, summary: Record<string, unknown> = {}, status = 400) => {
    await log('refused', summary, { error: code })
    return NextResponse.json({ error: message, code }, { status })
  }

  if (body?.chainId !== ARC_CHAIN) return refuse('Only Arc Testnet is supported', 'WRONG_CHAIN', { chainId: body?.chainId })
  if (dapp.isScam) return refuse('This site is flagged as a scam', 'SCAM_DAPP')

  // ---- Validate the request shape and that it is for THIS wallet ----
  let summary: Record<string, unknown> = {}
  let message: string | undefined
  let typedData: string | undefined
  let tx: { to: string; data?: Hex; valueWei: bigint } | undefined

  if (method === 'personal_sign') {
    const [msg, addr] = params
    if (typeof msg !== 'string' || !sameAddr(addr, me)) return refuse('Request is not for this wallet', 'WRONG_ACCOUNT')
    message = msg
    summary = { length: msg.length, hex: isHex(msg) }
  } else if (method === 'eth_signTypedData_v4') {
    const [addr, data] = params
    if (!sameAddr(addr, me)) return refuse('Request is not for this wallet', 'WRONG_ACCOUNT')
    const raw = typeof data === 'string' ? data : JSON.stringify(data)
    let parsed: { domain?: { chainId?: number | string; verifyingContract?: string }; primaryType?: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return refuse('Typed data is not valid JSON', 'BAD_TYPED_DATA')
    }
    const domainChain = parsed.domain?.chainId
    if (domainChain != null && Number(domainChain) !== ARC_CHAIN_ID) {
      return refuse('Typed data is for another network', 'WRONG_CHAIN', { domainChainId: domainChain })
    }
    typedData = raw
    summary = { primaryType: parsed.primaryType, verifyingContract: parsed.domain?.verifyingContract }
  } else {
    const t = params[0] as { from?: string; to?: string; data?: string; value?: string }
    if (!t || !sameAddr(t.from, me)) return refuse('Request is not for this wallet', 'WRONG_ACCOUNT')
    if (!t.to || !isAddress(t.to)) return refuse('Contract deployment is not supported', 'NO_RECIPIENT')
    let valueWei = BigInt(0)
    try {
      valueWei = t.value ? BigInt(t.value) : BigInt(0)
    } catch {
      return refuse('Invalid value', 'BAD_VALUE')
    }
    if (valueWei < BigInt(0)) return refuse('Invalid value', 'BAD_VALUE')
    const data = t.data && t.data !== '0x' ? (t.data as Hex) : undefined
    if (data && !isHex(data)) return refuse('Invalid call data', 'BAD_DATA')
    tx = { to: getAddress(t.to), data, valueWei }
    // USDC moved by this tx: native value plus a USDC ERC-20 transfer() in
    // the call data (the same balance on Arc), so the limit can't be dodged
    // by using the token interface instead of value.
    let usdcOut = Number(formatUnits(valueWei, 18))
    let erc20: Record<string, string> | null = null
    if (data && tx.to.toLowerCase() === USDC_TOKEN.toLowerCase()) {
      try {
        const call = decodeFunctionData({ abi: erc20Abi, data })
        if (call.functionName === 'transfer' || call.functionName === 'transferFrom') {
          const amt = call.args[call.args.length - 1] as bigint
          usdcOut += Number(formatUnits(amt, 6))
          erc20 = { fn: call.functionName, amount: formatUnits(amt, 6) }
        } else if (call.functionName === 'approve') {
          erc20 = { fn: 'approve', spender: String(call.args[0]), amount: formatUnits(call.args[1] as bigint, 6) }
        }
      } catch { /* not an ERC-20 call */ }
    }
    summary = { to: tx.to, valueUsdc: formatUnits(valueWei, 18), selector: data?.slice(0, 10) ?? null, erc20 }
    if (usdcOut > LARGE_TX_USDC && body?.confirmLarge !== true) {
      return NextResponse.json({ error: `More than ${LARGE_TX_USDC} USDC — confirm again`, code: 'LARGE_TX', limit: LARGE_TX_USDC }, { status: 409 })
    }
  }

  // ---- PIN ----
  const pinResult = await verifyPin(supabase, user.id, body?.pin)
  if (!pinResult.ok) {
    await log('refused', summary, { error: pinResult.code })
    return NextResponse.json({ error: pinResult.error, code: pinResult.code }, pinFailureHttp(pinResult))
  }

  // ---- Sign / send through Circle ----
  try {
    if (message !== undefined) {
      const res = await circleClient.signMessage({
        walletId: wallet.circleWalletId,
        message,
        encodedByHex: isHex(message),
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signature = (res.data as any)?.signature as string | undefined
      if (!signature) throw new Error('Circle did not return a signature')
      await log('signed', summary, { result: signature.slice(0, 20) })
      return NextResponse.json({ result: signature })
    }

    if (typedData !== undefined) {
      const res = await circleClient.signTypedData({ walletId: wallet.circleWalletId, data: typedData })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signature = (res.data as any)?.signature as string | undefined
      if (!signature) throw new Error('Circle did not return a signature')
      await log('signed', summary, { result: signature.slice(0, 20) })
      return NextResponse.json({ result: signature })
    }

    // eth_sendTransaction
    const amount = tx!.valueWei > BigInt(0) ? formatUnits(tx!.valueWei, 18) : undefined
    let created
    if (tx!.data) {
      created = await circleClient.createContractExecutionTransaction({
        walletId: wallet.circleWalletId,
        contractAddress: tx!.to,
        callData: tx!.data,
        ...(amount ? { amount } : {}),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        idempotencyKey: crypto.randomUUID(),
      })
    } else {
      // Plain native USDC transfer: Circle needs the wallet's USDC token id.
      const balances = await circleClient.getWalletTokenBalance({ id: wallet.circleWalletId })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usdc = ((balances.data?.tokenBalances as any[]) ?? []).find((b) => b.token?.symbol === 'USDC')
      if (!usdc?.token?.id || !amount) throw new Error('Nothing to send')
      created = await circleClient.createTransaction({
        walletId: wallet.circleWalletId,
        tokenId: usdc.token.id,
        destinationAddress: tx!.to,
        amount: [amount],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        idempotencyKey: crypto.randomUUID(),
      })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txId = (created.data as any)?.id as string | undefined
    if (!txId) throw new Error('Circle did not accept the transaction')
    const sent = await circleClient.getTransaction({ id: txId, waitForState: 'SENT', pollingInterval: 1500 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txHash = (sent.data as any)?.transaction?.txHash as string | undefined
    if (!txHash) throw new Error('Transaction was not broadcast in time')
    await log('sent', { ...summary, circleTxId: txId }, { result: txHash })
    return NextResponse.json({ result: txHash })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Request failed'
    await log('failed', summary, { error: msg.slice(0, 300) })
    return NextResponse.json({ error: msg, code: 'CIRCLE_FAILED' }, { status: 502 })
  }
}
