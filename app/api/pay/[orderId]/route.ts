import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { publicOrder } from '@/app/lib/circle-managed-payments'
import { syncMerchantOrderStatus } from '@/app/lib/merchant-orders'

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

  order = await syncMerchantOrderStatus(admin, order)

  const { data: merchant } = await admin
    .from('merchant_profiles')
    .select('store_name, verification_status, receive_address')
    .eq('user_id', order.merchant_user_id)
    .maybeSingle()

  const now = Date.now()
  const status = order.status === 'pending' && new Date(order.expires_at).getTime() < now ? 'expired' : order.status

  return NextResponse.json({
    order: publicOrder({ ...order, status }),
    merchant: merchant
      ? {
          storeName: merchant.store_name,
          verified: merchant.verification_status === 'verified',
          receiveAddress: order.payment_provider === 'circle_managed_payments'
            ? order.provider_deposit_address
            : merchant.receive_address,
        }
      : null,
  })
}
