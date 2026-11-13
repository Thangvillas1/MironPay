import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { arcPublicClient, USDC_TOKEN } from '@/app/lib/arc-chain'
import { syncRouterEvents } from '@/app/lib/router-index'
import { unitsToDecimal } from '@/app/lib/payment-router'

// The first request after deploy indexes every router event since the
// deploy block (~30 getLogs calls, ~15 s); later ones only the new blocks.
export const maxDuration = 60

const MAX_ROWS = 5000
const MAX_RANGE_MS = 400 * 24 * 60 * 60 * 1000
// Gas is paid in native USDC (18 dp); revenue figures are 6 dp.
const NATIVE_SCALE = BigInt(10) ** BigInt(12)

// GET /api/merchant/revenue?from=<ISO>&to=<ISO>
// Every settle/refund of the caller's Store wallet in [from, to), copied from
// the on-chain router events (indexed on demand), plus the wallet's current
// USDC balance read from the chain. The app aggregates by its own local
// day/hour, so the server never guesses the merchant's timezone.
export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const from = Date.parse(request.nextUrl.searchParams.get('from') ?? '')
  const to = Date.parse(request.nextUrl.searchParams.get('to') ?? '')
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > MAX_RANGE_MS) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  const { data: profile } = await supabase.from('profiles').select('wallet_address').eq('id', user.id).maybeSingle()
  const wallet = profile?.wallet_address?.toLowerCase()
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

  const admin = createAdminSupabaseClient()
  let indexedTo: string | null = null
  try {
    indexedTo = (await syncRouterEvents(admin)).toString()
  } catch (error) {
    // Serve what is already indexed; the app shows the figures as of then.
    console.error('[revenue] router index sync failed:', error)
  }

  const [{ data: events, error }, balanceWei] = await Promise.all([
    admin
      .from('router_events')
      .select('tx_hash, log_index, block_time, kind, router_order_id, token, credited_units, fee_units, net_units, excess_units, refund_units, refund_to, tx_from, gas_wei')
      .eq('merchant_address', wallet)
      .gte('block_time', new Date(from).toISOString())
      .lt('block_time', new Date(to).toISOString())
      .order('block_time', { ascending: true })
      .limit(MAX_ROWS),
    arcPublicClient().getBalance({ address: wallet as `0x${string}` }).catch(() => null),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Only real USDC settles count (anyone can make an order naming any token),
  // and gas only when this merchant's wallet sent the transaction.
  const rows = (events ?? []).filter((e) => e.kind === 'refunded' || e.token === USDC_TOKEN.toLowerCase())

  // Labels/ids of the merchant's own orders, for the list under the chart.
  const ids = [...new Set(rows.map((r) => r.router_order_id))]
  const orderBy = new Map<string, { id: string; label: string | null; amount: string }>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin
      .from('merchant_orders')
      .select('id, label, amount, router_order_id')
      .eq('merchant_user_id', user.id)
      .in('router_order_id', ids.slice(i, i + 200))
    for (const o of data ?? []) orderBy.set(o.router_order_id, { id: o.id, label: o.label, amount: String(o.amount) })
  }

  return NextResponse.json({
    wallet,
    balance: balanceWei == null ? null : unitsToDecimal(balanceWei / NATIVE_SCALE),
    indexedToBlock: indexedTo,
    truncated: (events?.length ?? 0) >= MAX_ROWS,
    events: rows.map((e) => {
      const gas = e.tx_from === wallet ? BigInt(e.gas_wei) : BigInt(0)
      const order = orderBy.get(e.router_order_id)
      return {
        time: e.block_time,
        kind: e.kind,
        txHash: e.tx_hash,
        orderId: order?.id ?? null,
        label: order?.label ?? null,
        orderAmount: order?.amount ?? null,
        credited: unitsToDecimal(BigInt(e.credited_units)),
        fee: unitsToDecimal(BigInt(e.fee_units)),
        net: unitsToDecimal(BigInt(e.net_units)),
        excess: unitsToDecimal(BigInt(e.excess_units)),
        refund: unitsToDecimal(BigInt(e.refund_units)),
        // 18-dp gas shown with 6 dp, rounded up so it is never understated.
        gas: unitsToDecimal((gas + NATIVE_SCALE - BigInt(1)) / NATIVE_SCALE),
      }
    }),
  })
}
