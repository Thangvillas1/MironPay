import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import {
  CIRCLE_MANAGED_PROVIDER,
  circleManagedPaymentsEnabled,
  createTransientPaymentIntent,
  paymentIntentSnapshot,
  publicOrder,
} from '@/app/lib/circle-managed-payments'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import {
  PAYMENT_ROUTER_ADDRESS,
  ROUTER_ORDER_WINDOW_SECONDS,
  isRouterOrder,
  ROUTER_PROVIDER,
  computeDepositAddress,
  newRouterOrderId,
  routerPayload,
  syncRouterOrders,
} from '@/app/lib/payment-router'
import { USDC_TOKEN } from '@/app/lib/arc-chain'
import { isAddress, parseUnits, type Address, type Hex } from 'viem'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// On-chain orders (MironPaymentRouter) are the default. PAYMENT_ROUTER_ENABLED=false
// falls back to the previous Circle-managed / legacy flows below.
function routerEnabled() {
  return process.env.PAYMENT_ROUTER_ENABLED !== 'false'
}

const ORDER_WINDOW_SECONDS = 180

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('merchant_profiles').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Set up your store first' }, { status: 400 })

  const body = await request.json()
  const { amount } = body
  const amountNum = parseFloat(amount)
  if (isNaN(amountNum) || amountNum <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  }

  if (routerEnabled()) {
    // Exact cents only: the order amount is committed into the deposit address,
    // so it must round-trip through the numeric(18,2) column unchanged.
    const amountStr = String(amount).trim()
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(amountStr)) {
      return NextResponse.json({ error: 'Amount must have at most 2 decimals' }, { status: 400 })
    }
    const amountUnits = parseUnits(amountStr, 6)
    const label = typeof body.label === 'string' ? body.label.trim().slice(0, 40) : ''

    // The merchant bound into the order is the merchant's own MironPay wallet:
    // settle() pays it, and only it can sign refundExcess().
    const { data: walletProfile } = await supabase
      .from('profiles')
      .select('wallet_address, circle_wallet_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!walletProfile?.wallet_address || !walletProfile.circle_wallet_id || !isAddress(walletProfile.wallet_address)) {
      return NextResponse.json({ error: 'Wallet not ready' }, { status: 400 })
    }

    // Instant QR: the merchant's app may build the order itself (row id,
    // random bytes32 orderId, expiry) and show the QR before this request
    // returns — the deposit address is pure CREATE2 math. We accept those
    // terms only within tight bounds, and always recompute the address here
    // with THIS user's own wallet as merchant, so a client can never register
    // an order that pays anyone else.
    const nowSec = Math.floor(Date.now() / 1000)
    const client = body.client && typeof body.client === 'object' ? body.client : null
    let rowId: string | undefined
    let orderId: Hex = newRouterOrderId()
    let expiryUnix = nowSec + ROUTER_ORDER_WINDOW_SECONDS
    if (client) {
      if (typeof client.id !== 'string' || !UUID_RE.test(client.id)) {
        return NextResponse.json({ error: 'Invalid order id', code: 'INVALID_CLIENT_ORDER' }, { status: 400 })
      }
      if (typeof client.orderId !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(client.orderId)) {
        return NextResponse.json({ error: 'Invalid order id', code: 'INVALID_CLIENT_ORDER' }, { status: 400 })
      }
      const exp = Number(client.expiry)
      // 15 min window, with 2 min of slack for the phone's clock and retries.
      if (!Number.isInteger(exp) || exp < nowSec + 60 || exp > nowSec + ROUTER_ORDER_WINDOW_SECONDS + 120) {
        return NextResponse.json({ error: 'Order expiry is out of range — check the phone clock', code: 'INVALID_CLIENT_ORDER' }, { status: 400 })
      }
      rowId = client.id
      orderId = client.orderId.toLowerCase() as Hex
      expiryUnix = exp
    }
    const routerExpiresAt = new Date(expiryUnix * 1000)
    const depositAddress = computeDepositAddress({
      orderId,
      merchant: walletProfile.wallet_address as Address,
      token: USDC_TOKEN,
      amount: amountUnits,
      expiry: BigInt(expiryUnix),
    })
    if (client && (typeof client.depositAddress !== 'string' || client.depositAddress.toLowerCase() !== depositAddress.toLowerCase())) {
      return NextResponse.json({ error: 'Payment address check failed', code: 'ADDRESS_MISMATCH' }, { status: 409 })
    }

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from('merchant_orders')
      .insert({
        ...(rowId ? { id: rowId } : {}),
        merchant_user_id: user.id,
        amount: amountStr,
        label: label || null,
        expires_at: routerExpiresAt.toISOString(),
        payment_provider: ROUTER_PROVIDER,
        router_address: PAYMENT_ROUTER_ADDRESS,
        router_order_id: orderId,
        merchant_address: walletProfile.wallet_address,
        amount_units: amountUnits.toString(),
        expiry_unix: expiryUnix,
        deposit_address: depositAddress,
      })
      .select()
      .single()
    if (error) {
      // A retry of a request that already went through (the app retries on
      // network errors): return the same order instead of failing.
      if (error.code === '23505' && rowId) {
        const { data: existing } = await admin
          .from('merchant_orders')
          .select('*')
          .eq('id', rowId)
          .eq('merchant_user_id', user.id)
          .eq('router_order_id', orderId)
          .maybeSingle()
        if (existing) {
          return NextResponse.json({ order: { ...publicOrder(existing), paymentAddress: existing.deposit_address, routerOrder: routerPayload(existing) } })
        }
        return NextResponse.json({ error: 'Order id already used', code: 'DUPLICATE_ORDER' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ order: { ...publicOrder(data), paymentAddress: depositAddress, routerOrder: routerPayload(data) } }, { status: 201 })
  }

  const expiresAt = new Date(Date.now() + ORDER_WINDOW_SECONDS * 1000)

  if (circleManagedPaymentsEnabled()) {
    const orderId = crypto.randomUUID()
    const idempotencyKey = crypto.randomUUID()
    const amountString = amountNum.toFixed(2)
    const { data: managedProfile } = await supabase
      .from('merchant_profiles')
      .select('circle_merchant_wallet_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const { data: provisional, error: insertError } = await supabase
      .from('merchant_orders')
      .insert({
        id: orderId,
        merchant_user_id: user.id,
        amount: amountString,
        expires_at: expiresAt.toISOString(),
        payment_provider: CIRCLE_MANAGED_PROVIDER,
        provider_status: 'provisioning',
        provider_idempotency_key: idempotencyKey,
      })
      .select()
      .single()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    try {
      const intent = await createTransientPaymentIntent({
        idempotencyKey,
        amount: amountString,
        expiresOn: expiresAt.toISOString(),
        customerExternalRef: orderId,
        merchantWalletId: managedProfile?.circle_merchant_wallet_id,
      })
      const snapshot = paymentIntentSnapshot(intent)
      const { data: updated, error: updateError } = await supabase
        .from('merchant_orders')
        .update({
          provider_payment_intent_id: intent.id,
          provider_status: snapshot.providerStatus,
          provider_deposit_address: snapshot.depositAddress,
          provider_chain: snapshot.chain,
          provider_amount_paid: snapshot.amountPaid,
          provider_synced_at: new Date().toISOString(),
          provider_error: null,
        })
        .eq('id', orderId)
        .select()
        .single()

      if (updateError) throw updateError
      return NextResponse.json({ order: publicOrder(updated) }, { status: 201 })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Circle payment intent creation failed'
      await supabase
        .from('merchant_orders')
        .update({ provider_status: 'failed', provider_error: message, status: 'cancelled' })
        .eq('id', orderId)
      return NextResponse.json({ error: message, orderId: provisional.id }, { status: 502 })
    }
  }

  const { data, error } = await supabase
    .from('merchant_orders')
    .insert({ merchant_user_id: user.id, amount: amountNum, expires_at: expiresAt.toISOString() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: publicOrder(data) })
}

export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const range = request.nextUrl.searchParams.get('range')
  let query = supabase
    .from('merchant_orders')
    .select('*')
    .eq('merchant_user_id', user.id)
    .order('created_at', { ascending: false })

  if (range === 'today') {
    // "Today" is the merchant's local day, not the server's: the function runs
    // in UTC, so a server-side midnight would start a Vietnam shop's day at
    // 07:00 and file its early-morning sales under yesterday. The client sends
    // its own local midnight as `since`; accept it only within the last ~day
    // (any timezone's midnight falls in that window), else fall back to UTC.
    const since = Date.parse(request.nextUrl.searchParams.get('since') ?? '')
    const now = Date.now()
    const startOfDay = Number.isFinite(since) && since <= now && now - since <= 50 * 60 * 60 * 1000
      ? new Date(since)
      : new Date(new Date().setUTCHours(0, 0, 0, 0))
    query = query.gte('created_at', startOfDay.toISOString())
  }

  // The Store order grid asks for the latest N orders across days.
  const limit = Number(request.nextUrl.searchParams.get('limit'))
  if (Number.isInteger(limit) && limit > 0) query = query.limit(Math.min(limit, 200))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Nothing flips a pending order to 'expired' once its window lapses, so the
  // list kept showing long-dead charges as PENDING. Report them as expired
  // (same rule /api/pay applies) and persist it, so the row stops lingering.
  // On-chain orders: refresh the open ones (and recently lapsed ones, which can
  // still receive a late payment) with one getOrderStatuses call. The chain
  // decides their status, so they skip the time-based expiry below.
  const now = Date.now()
  const rows = data ?? []
  const toSync = rows.filter((o) => isRouterOrder(o) && (
    ['pending', 'underpaid', 'overpaid'].includes(o.status)
    || (o.status === 'expired' && now - new Date(o.expires_at).getTime() < 24 * 60 * 60 * 1000)
    || o.pending_units && o.pending_units !== '0'
    // one-time backfill of the refunded total for orders settled before it was tracked
    || (o.status === 'paid' && o.refunded_units == null)
  )).slice(0, 50)
  const { rows: synced, views } = await syncRouterOrders(createAdminSupabaseClient(), toSync)
  const syncedById = new Map(synced.map((o) => [o.id, o]))

  const lapsedIds: string[] = []
  const orders = rows.map((row) => {
    const o = syncedById.get(row.id) ?? row
    if (isRouterOrder(o)) return { ...publicOrder(o), paymentAddress: o.deposit_address, routerOrder: routerPayload(o, views.get(o.id)) }
    if (o.status === 'pending' && new Date(o.expires_at).getTime() < now) {
      lapsedIds.push(o.id)
      return { ...o, status: 'expired' }
    }
    return o
  })
  if (lapsedIds.length > 0) {
    await supabase.from('merchant_orders').update({ status: 'expired' }).in('id', lapsedIds).eq('status', 'pending')
  }

  const paidOrders = orders.filter((o) => o.status === 'paid' || o.status === 'overpaid')
  const totalToday = paidOrders.reduce((sum, o) => sum + parseFloat(o.paid_amount ?? o.amount), 0)

  return NextResponse.json({ orders, totalPaid: totalToday, paidCount: paidOrders.length })
}
