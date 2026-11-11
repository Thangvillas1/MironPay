import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { ROUTER_PROVIDER, syncRouterOrders } from '@/app/lib/payment-router'

// Daily safety net for on-chain Store orders: re-reads every order of the
// last 2 days that is not final and settles any box the apps didn't (merchant
// app closed, payer paid from an external wallet). Day-to-day settling
// happens when the merchant's or payer's app polls the order.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? process.env.AGENT_INDEXER_CRON_SECRET
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await admin
    .from('merchant_orders')
    .select('*')
    .eq('payment_provider', ROUTER_PROVIDER)
    .in('status', ['pending', 'underpaid', 'overpaid', 'expired'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let synced = 0
  const rows = data ?? []
  for (let i = 0; i < rows.length; i += 50) {
    const { views } = await syncRouterOrders(admin, rows.slice(i, i + 50))
    synced += views.size
  }
  return NextResponse.json({ checked: rows.length, synced })
}
