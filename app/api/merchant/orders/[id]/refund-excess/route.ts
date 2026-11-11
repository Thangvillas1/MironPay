import { NextRequest, NextResponse } from 'next/server'
import { isAddress, getAddress, parseUnits, type Address } from 'viem'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { circleClient } from '@/app/lib/circle'
import { pinFailureHttp, verifyPin } from '@/app/lib/pin'
import { arcPublicClient, USDC_TOKEN } from '@/app/lib/arc-chain'
import { getAddressTransactions, getTokenTransfers } from '@/app/lib/arc-explorer'
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

// GET — refundable excess plus the addresses that sent money to this order's
// deposit address (read from the explorer), so the merchant can pick the payer.
// Exchange hot wallets show up here too, so the app warns before refunding.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loaded = await loadMerchantOrder(request, id)
  if (loaded instanceof NextResponse) return loaded
  const { order } = loaded

  const [view] = await readRouterStatuses([routerOrderFromRow(order)])
  const held = await excessHeld(order)

  const senders = new Map<string, { address: string; isContract: boolean; total: bigint }>()
  const ignore = new Set([PAYMENT_ROUTER_ADDRESS.toLowerCase(), String(order.deposit_address).toLowerCase()])
  try {
    const [transfers, txs] = await Promise.all([
      getTokenTransfers(order.deposit_address, null),
      getAddressTransactions(order.deposit_address),
    ])
    for (const t of transfers.items) {
      if (t.to.hash.toLowerCase() !== String(order.deposit_address).toLowerCase()) continue
      if (t.token.address_hash.toLowerCase() !== USDC_TOKEN.toLowerCase()) continue
      const from = t.from.hash.toLowerCase()
      if (ignore.has(from)) continue
      const prev = senders.get(from)
      senders.set(from, { address: t.from.hash, isContract: t.from.is_contract, total: (prev?.total ?? BigInt(0)) + BigInt(t.total.value) })
    }
    for (const t of txs.items) {
      const from = t.from.hash.toLowerCase()
      if (!ignore.has(from) && !senders.has(from) && t.status === 'ok') {
        senders.set(from, { address: t.from.hash, isContract: t.from.is_contract, total: BigInt(0) })
      }
    }
  } catch (error) {
    console.error('[refund-excess] explorer lookup failed:', error)
  }

  return NextResponse.json({
    excess: unitsToDecimal(view.excess),
    refundable: unitsToDecimal(held),
    needsSettle: view.excess > held,
    senders: [...senders.values()].map((s) => ({
      address: s.address,
      isContract: s.isContract,
      sent: s.total > BigInt(0) ? unitsToDecimal(s.total) : null,
    })),
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
