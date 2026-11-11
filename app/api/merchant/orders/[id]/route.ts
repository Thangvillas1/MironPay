import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { publicOrder } from '@/app/lib/circle-managed-payments'
import { syncMerchantOrderStatus } from '@/app/lib/merchant-orders'
import { isRouterOrder, routerPayload, syncRouterOrders, type RouterOrderView } from '@/app/lib/payment-router'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminSupabaseClient()

  const { data: foundOrder } = await supabase.from('merchant_orders').select('*').eq('id', id).maybeSingle()
  let order = foundOrder
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // On-chain orders: status comes from the router (and new funds trigger the
  // merchant's settle); the others keep the Circle-managed sync.
  let routerView: RouterOrderView | undefined
  if (isRouterOrder(order)) {
    const { rows, views } = await syncRouterOrders(admin, [order])
    order = rows[0]
    routerView = views.get(order.id)
  } else {
    order = await syncMerchantOrderStatus(admin, order)
  }

  // Merchant display info (store name, verified badge, receive address) is
  // needed by a customer who isn't the merchant themselves — merchant_profiles
  // RLS only lets the owner read their own row, so fetch it via the admin
  // client. This is safe: only non-sensitive, already-public-facing store
  // display fields are returned below, not the whole profile row.
  const { data: merchant } = await admin
    .from('merchant_profiles')
    .select('store_name, verification_status, receive_address')
    .eq('user_id', order.merchant_user_id)
    .maybeSingle()

  const now = Date.now()
  const status = !isRouterOrder(order) && order.status === 'pending' && new Date(order.expires_at).getTime() < now
    ? 'expired'
    : order.status

  return NextResponse.json({
    order: isRouterOrder(order)
      ? { ...publicOrder({ ...order, status }), paymentAddress: order.deposit_address, routerOrder: routerPayload(order, routerView) }
      : publicOrder({ ...order, status }),
    merchant: merchant
      ? {
          storeName: merchant.store_name,
          verified: merchant.verification_status === 'verified',
          receiveAddress: isRouterOrder(order)
            ? order.deposit_address
            : order.payment_provider === 'circle_managed_payments'
              ? order.provider_deposit_address
              : merchant.receive_address,
        }
      : null,
  })
}
