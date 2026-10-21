import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  circleManagedPaymentsEnabled,
  getPaymentIntent,
  paymentIntentSnapshot,
} from '@/app/lib/circle-managed-payments'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MerchantOrderRow = Record<string, any>

/**
 * Refreshes a merchant order against its Circle payment intent when the
 * cached row is stale. Shared by the merchant-authenticated order lookup and
 * the public /pay page (both need the same freshness, and a customer viewing
 * /pay without the merchant's tab open must not be stuck on a stale status).
 * Webhooks remain the primary source — this polling is a fallback only, so a
 * failure here must not turn a valid payment page into an error.
 */
export async function syncMerchantOrderStatus(
  admin: SupabaseClient,
  order: MerchantOrderRow
): Promise<MerchantOrderRow> {
  const staleSync = !order.provider_synced_at || Date.now() - new Date(order.provider_synced_at).getTime() > 5_000
  if (
    !circleManagedPaymentsEnabled()
    || order.payment_provider !== 'circle_managed_payments'
    || !order.provider_payment_intent_id
    || order.status !== 'pending'
    || (order.provider_deposit_address && !staleSync)
  ) {
    return order
  }

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
    const { data: synced } = await admin.from('merchant_orders').update(update).eq('id', order.id).select().single()
    if (synced) return synced
  } catch {
    // Keep serving the last known row — see note above.
  }
  return order
}
