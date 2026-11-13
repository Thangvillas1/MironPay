import { NextRequest, NextResponse } from 'next/server'
import { isAddress, getAddress, parseAbiItem, parseUnits, type Address } from 'viem'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { circleClient } from '@/app/lib/circle'
import { pinFailureHttp, verifyPin } from '@/app/lib/pin'
import { arcPublicClient, USDC_TOKEN } from '@/app/lib/arc-chain'
import { getTokenTransfers } from '@/app/lib/arc-explorer'
import {
  PAYMENT_ROUTER_ADDRESS,
  ROUTER_ABI,
  isRouterOrder,
  readRouterStatuses,
  refundCallData,
  requestSettle,
  routerOrderFromRow,
  routerOrderKey,
  unitsToDecimal,
  type MerchantOrderRow,
} from '@/app/lib/payment-router'

type Loaded = { order: MerchantOrderRow; walletId: string; walletAddress: string }

async function loadMerchantOrder(request: NextRequest, id: string): Promise<Loaded | NextResponse> {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data: order } = await admin
    .from('merchant_orders')
    .select('*')
    .eq('id', id)
    .eq('merchant_user_id', user.id)
    .maybeSingle()
  if (!order || !isRouterOrder(order)) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const { data: profile } = await admin
    .from('profiles')
    .select('circle_wallet_id, wallet_address')
    .eq('id', user.id)
    .maybeSingle()
  // refundExcess is merchant-only on chain: it must be signed by the exact
  // wallet bound into the order.
  if (!profile?.circle_wallet_id || profile.wallet_address?.toLowerCase() !== order.merchant_address.toLowerCase()) {
    return NextResponse.json({ error: 'This order belongs to a different wallet' }, { status: 403 })
  }
  return { order, walletId: profile.circle_wallet_id, walletAddress: profile.wallet_address }
}

async function excessHeld(order: MerchantOrderRow): Promise<bigint> {
  const key = routerOrderKey(routerOrderFromRow(order))
  const state = await arcPublicClient().readContract({
    address: PAYMENT_ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: 'orders',
    args: [key],
  }) as readonly [bigint, bigint, bigint, bigint, bigint, boolean]
  return state[1]
}

// Arc logs every USDC movement — native sends and ERC-20 transfer() alike —
// as a Transfer event from this system address, in 18-decimal native units
// (verified 2026-11-13 on a real external-wallet payment, which emits no
// 0x3600 log at all). Using only this source avoids double counting.
const ARC_NATIVE_TRANSFER_LOGGER = '0xfffffffffffffffffffffffffffffffffffffffe' as const
const NATIVE_SCALE = BigInt(10) ** BigInt(12)

// Senders are read straight from chain logs (fast) — USDC Transfer events
// into the deposit box, plus Paid events (pay() forwards from the router, so
// the real payer is in Paid). eth_getLogs is capped at 10,000 blocks per call
// (~1.4 h on Arc), so look back two windows; older orders fall back to the
// explorer, which answers in ~4 s.
const LOG_WINDOW = BigInt(9_999)
const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const PAID_EVENT = parseAbiItem('event Paid(bytes32 indexed orderKey, bytes32 indexed orderId, address indexed payer, uint256 units)')

type Sender = { address: string; isContract: boolean | null; total: bigint }

async function sendersFromChain(order: MerchantOrderRow): Promise<Map<string, Sender> | null> {
  const client = arcPublicClient()
  const box = getAddress(order.deposit_address)
  const head = await client.getBlockNumber()
  const createdAgoSec = (Date.now() - Date.parse(order.created_at)) / 1000
  // ~0.5 s blocks; older than the two windows → let the explorer answer.
  if (createdAgoSec > 2.5 * 60 * 60) return null
  const senders = new Map<string, Sender>()
  const router = PAYMENT_ROUTER_ADDRESS.toLowerCase()
  const key = routerOrderKey(routerOrderFromRow(order))
  for (let w = 0; w < 2; w++) {
    const toBlock = head - BigInt(w) * (LOG_WINDOW + BigInt(1))
    if (toBlock <= BigInt(0)) break
    const fromBlock = toBlock > LOG_WINDOW ? toBlock - LOG_WINDOW : BigInt(0)
    const [transfers, paid] = await Promise.all([
      client.getLogs({ address: ARC_NATIVE_TRANSFER_LOGGER, event: TRANSFER_EVENT, args: { to: box }, fromBlock, toBlock }),
      client.getLogs({ address: PAYMENT_ROUTER_ADDRESS, event: PAID_EVENT, args: { orderKey: key }, fromBlock, toBlock }),
    ])
    for (const l of transfers) {
      const from = String(l.args.from)
      if (from.toLowerCase() === router) continue // pay(): the payer comes from Paid
      const prev = senders.get(from.toLowerCase())
      senders.set(from.toLowerCase(), { address: from, isContract: null, total: (prev?.total ?? BigInt(0)) + (l.args.value ?? BigInt(0)) / NATIVE_SCALE })
    }
    for (const l of paid) {
      const payer = String(l.args.payer)
      const prev = senders.get(payer.toLowerCase())
      senders.set(payer.toLowerCase(), { address: payer, isContract: null, total: (prev?.total ?? BigInt(0)) + (l.args.units ?? BigInt(0)) })
    }
    if (fromBlock === BigInt(0)) break
  }
  // Contract wallets (often exchanges/smart accounts) get a warning in the app.
  await Promise.all([...senders.values()].map(async (s) => {
    try {
      const code = await client.getCode({ address: s.address as Address })
      s.isContract = !!code && code !== '0x'
    } catch {
      s.isContract = null
    }
  }))
  return senders
}

async function sendersFromExplorer(order: MerchantOrderRow): Promise<Map<string, Sender>> {
  const senders = new Map<string, Sender>()
  const ignore = new Set([PAYMENT_ROUTER_ADDRESS.toLowerCase(), String(order.deposit_address).toLowerCase()])
  const transfers = await getTokenTransfers(order.deposit_address, null)
  for (const t of transfers.items) {
    if (t.to.hash.toLowerCase() !== String(order.deposit_address).toLowerCase()) continue
    if (t.token.address_hash.toLowerCase() !== USDC_TOKEN.toLowerCase()) continue
    const from = t.from.hash.toLowerCase()
    if (ignore.has(from)) continue
    const prev = senders.get(from)
    senders.set(from, { address: t.from.hash, isContract: t.from.is_contract, total: (prev?.total ?? BigInt(0)) + BigInt(t.total.value) })
  }
  return senders
}

// GET — refundable excess, straight from the chain (~0.3 s). If extra money
// sits in the box but isn't recorded yet (it arrived after the order was
// already settled — auto-settle skips excess-only funds on purpose), opening
// this screen means the merchant wants to deal with it, so record it now
// (settle from the merchant's wallet) and report `settling` until it lands.
// GET ?senders=1 — who sent money to the order, loaded separately so it
// never holds up the refund button.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loaded = await loadMerchantOrder(request, id)
  if (loaded instanceof NextResponse) return loaded
  const { order } = loaded

  if (request.nextUrl.searchParams.get('senders') === '1') {
    let senders: Map<string, Sender> | null = null
    try {
      senders = await sendersFromChain(order)
    } catch (error) {
      console.error('[refund-excess] chain sender lookup failed:', error)
    }
    if (!senders || senders.size === 0) {
      try {
        senders = await sendersFromExplorer(order)
      } catch (error) {
        console.error('[refund-excess] explorer lookup failed:', error)
      }
    }
    return NextResponse.json({
      senders: [...(senders?.values() ?? [])].map((s) => ({
        address: s.address,
        isContract: s.isContract === true,
        sent: s.total > BigInt(0) ? unitsToDecimal(s.total) : null,
      })),
    })
  }

  const [[view], held] = await Promise.all([
    readRouterStatuses([routerOrderFromRow(order)]),
    excessHeld(order),
  ])
  const needsSettle = view.excess > held
  let settling = false
  if (needsSettle) {
    try {
      await requestSettle(createAdminSupabaseClient(), order)
    } catch (error) {
      console.error('[refund-excess] settle failed:', error)
    }
    // Throttled or just sent — either way a settle is in flight.
    settling = true
  }

  return NextResponse.json({
    excess: unitsToDecimal(view.excess),
    refundable: unitsToDecimal(held),
    needsSettle,
    settling,
  })
}

// POST { to, amount?, pin } — refundExcess(order, to, amount) from the merchant's
// wallet. If the excess is still unsettled it is settled first (409 SETTLING,
// the app retries once the settle lands).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loaded = await loadMerchantOrder(request, id)
  if (loaded instanceof NextResponse) return loaded
  const { order, walletId } = loaded

  const body = await request.json()
  if (typeof body.to !== 'string' || !isAddress(body.to)) {
    return NextResponse.json({ error: 'Refund address is invalid', code: 'INVALID_ADDRESS' }, { status: 400 })
  }
  const to = getAddress(body.to) as Address
  if (to.toLowerCase() === String(order.deposit_address).toLowerCase() || to.toLowerCase() === PAYMENT_ROUTER_ADDRESS.toLowerCase()) {
    return NextResponse.json({ error: 'Refund address is invalid', code: 'INVALID_ADDRESS' }, { status: 400 })
  }

  const token = request.headers.get('Authorization')!.replace('Bearer ', '')
  const supabase = createServerSupabaseClient(token)
  const pinResult = await verifyPin(supabase, order.merchant_user_id, body.pin)
  if (!pinResult.ok) {
    return NextResponse.json({ error: pinResult.error, code: pinResult.code }, pinFailureHttp(pinResult))
  }

  const [view] = await readRouterStatuses([routerOrderFromRow(order)])
  const held = await excessHeld(order)
  if (held === BigInt(0)) {
    if (view.excess > BigInt(0)) {
      await requestSettle(createAdminSupabaseClient(), order).catch(() => null)
      return NextResponse.json({ error: 'Recording the extra payment first, try again in a few seconds', code: 'SETTLING' }, { status: 409 })
    }
    return NextResponse.json({ error: 'This order has no extra payment to refund', code: 'NO_EXCESS' }, { status: 400 })
  }

  let amount = held
  if (body.amount != null) {
    try {
      amount = parseUnits(String(body.amount), 6)
    } catch {
      return NextResponse.json({ error: 'Invalid amount', code: 'INVALID_AMOUNT' }, { status: 400 })
    }
    if (amount <= BigInt(0) || amount > held) {
      return NextResponse.json({ error: `You can refund at most ${unitsToDecimal(held)} USDC`, code: 'INVALID_AMOUNT' }, { status: 400 })
    }
  }

  const tx = await circleClient.createContractExecutionTransaction({
    walletId,
    contractAddress: PAYMENT_ROUTER_ADDRESS,
    callData: refundCallData(routerOrderFromRow(order), to, amount),
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: crypto.randomUUID(),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txId = (tx.data as any)?.id ?? null
  let txHash: string | null = null
  if (txId) {
    try {
      const sent = await circleClient.getTransaction({ id: txId, waitForState: 'SENT', pollingInterval: 1500 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      txHash = (sent.data as any)?.transaction?.txHash ?? null
    } catch {
      // Still return the Circle id; the order card re-reads the chain.
    }
  }
  return NextResponse.json({ transactionId: txId, txHash, amount: unitsToDecimal(amount), to })
}
