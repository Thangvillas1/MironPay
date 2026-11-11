import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { isRouterOrder, readRouterStatuses, requestSettle, routerOrderFromRow } from '@/app/lib/payment-router'

// Merchant's manual "Nhận tiền" — settles whatever new funds sit in the order's
// deposit box (underpaid, late or excess-only included), from the merchant's
// own wallet. Auto-settle covers the common case; this is the fallback when
// the backend missed it. settle() itself is permissionless and only ever pays
// the merchant bound into the address, so no PIN is needed.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  const [view] = await readRouterStatuses([routerOrderFromRow(order)])
  if (view.pendingInBox === BigInt(0)) {
    return NextResponse.json({ error: 'Nothing new to collect for this order', code: 'NOTHING_TO_SETTLE' }, { status: 409 })
  }

  const txId = await requestSettle(admin, order)
  if (!txId) {
    return NextResponse.json({ error: 'A collection is already in progress, try again shortly', code: 'SETTLE_IN_PROGRESS' }, { status: 429 })
  }
  return NextResponse.json({ transactionId: txId })
}
