import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import {
  circleManagedPaymentsEnabled,
  getPaymentIntent,
  paymentIntentSnapshot,
  publicOrder,
} from '@/app/lib/circle-managed-payments'

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

  const staleSync = !order.provider_synced_at || Date.now() - new Date(order.provider_synced_at).getTime() > 5_000
  if (
    circleManagedPaymentsEnabled()
    && order.payment_provider === 'circle_managed_payments'
    && order.provider_payment_intent_id
    && order.status === 'pending'
    && (!order.provider_deposit_address || staleSync)
  ) {
    try {
      const intent = await getPaymentIntent(order.provider_payment_intent_id)
      const snapshot = paymentIntentSnapshot(intent)
      const update: Record<string, unknown> = {
        provider_status: snapshot.providerStatus,
        provider_deposit_address: snapshot.depositAddress ?? order.provider_deposit_address,
        provider_chain: snapshot.chain ?? order.provider_chain,
        provider_amount_paid: snapshot.amountPaid ?? order.provider_amount_paid,
        provider_synced_at: new Date().toISOString(),
      }
      if (snapshot.providerStatus === 'complete') {
        update.paid_amount = snapshot.amountPaid
        update.status = Number(snapshot.amountPaid ?? 0) >= Number(order.amount) ? 'paid' : 'underpaid'
        if (update.status === 'paid') update.paid_at = new Date().toISOString()
      } else if (snapshot.providerStatus === 'expired') update.status = 'expired'
      else if (snapshot.providerStatus === 'failed') update.status = 'cancelled'
      const { data: synced } = await admin.from('merchant_orders').update(update).eq('id', id).select().single()
      if (synced) order = synced
    } catch {
      // Webhooks remain the primary source. A temporary polling failure must
      // not turn a valid payment page into an error.
    }
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
