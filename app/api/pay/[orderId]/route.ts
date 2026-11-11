import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { publicOrder } from '@/app/lib/circle-managed-payments'
import { syncMerchantOrderStatus } from '@/app/lib/merchant-orders'
import { isRouterOrder, routerPayload, syncRouterOrders, type RouterOrderView } from '@/app/lib/payment-router'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Public, no-auth lookup for the customer-facing QR page — the payer may not
// have a MironPay account (same posture as /api/invoices/[code]).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  if (!UUID_RE.test(orderId)) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const admin = createAdminSupabaseClient()
  const { data: foundOrder } = await admin.from('merchant_orders').select('*').eq('id', orderId).maybeSingle()
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
