import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import {
  circleManagedPaymentsEnabled,
  paymentIntentSnapshot,
  type CirclePaymentIntent,
} from '@/app/lib/circle-managed-payments'
import { confirmSnsSubscription, type SnsEnvelope, verifySnsEnvelope } from '@/app/lib/circle-sns-webhook'

export const runtime = 'nodejs'

export function HEAD() {
  return new NextResponse(null, { status: 200 })
}

type CircleEvent = {
  notificationType?: string
  paymentIntent?: CirclePaymentIntent
  payment?: {
    id?: string
    paymentIntentId?: string
    status?: string
    amount?: { amount?: string }
    transactionHash?: string
    transaction?: { hash?: string }
    fromAddresses?: { addresses?: string[] }
    depositAddress?: { address?: string; chain?: string }
  }
}

export async function POST(request: NextRequest) {
  if (!circleManagedPaymentsEnabled()) return NextResponse.json({ ignored: true }, { status: 202 })

  let envelope: SnsEnvelope
  try {
    envelope = await request.json()
    if (!(await verifySnsEnvelope(envelope))) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid SNS message' }, { status: 400 })
  }

  if (envelope.Type === 'SubscriptionConfirmation') {
    if (!envelope.SubscribeURL) return NextResponse.json({ error: 'Missing SubscribeURL' }, { status: 400 })
    await confirmSnsSubscription(envelope.SubscribeURL)
    return NextResponse.json({ confirmed: true })
  }
  if (envelope.Type !== 'Notification') return NextResponse.json({ ignored: true }, { status: 202 })

  let event: CircleEvent
  try {
    event = JSON.parse(envelope.Message)
  } catch {
    return NextResponse.json({ error: 'Invalid Circle event payload' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { data: known } = await admin.from('circle_webhook_events').select('processed_at').eq('message_id', envelope.MessageId).maybeSingle()
  if (known?.processed_at) return NextResponse.json({ duplicate: true })

  await admin.from('circle_webhook_events').upsert({
    message_id: envelope.MessageId,
    topic_arn: envelope.TopicArn,
    notification_type: event.notificationType ?? null,
    payload: event,
  }, { onConflict: 'message_id', ignoreDuplicates: true })

  const intentId = event.paymentIntent?.id ?? event.payment?.paymentIntentId
  if (!intentId || !['paymentIntents', 'payments'].includes(event.notificationType ?? '')) {
    await markProcessed(admin, envelope.MessageId)
    return NextResponse.json({ ignored: true })
  }

  const { data: order } = await admin.from('merchant_orders').select('*').eq('provider_payment_intent_id', intentId).maybeSingle()
  if (!order) return NextResponse.json({ error: 'Payment intent is not linked yet' }, { status: 503 })

  const update: Record<string, unknown> = {}
  if (event.notificationType === 'paymentIntents' && event.paymentIntent) {
    const snapshot = paymentIntentSnapshot(event.paymentIntent)
    update.provider_status = snapshot.providerStatus
    update.provider_deposit_address = snapshot.depositAddress ?? order.provider_deposit_address
    update.provider_chain = snapshot.chain ?? order.provider_chain
    update.provider_amount_paid = snapshot.amountPaid ?? order.provider_amount_paid
    update.provider_synced_at = new Date().toISOString()
    const amountPaid = Number(snapshot.amountPaid ?? 0)
    if (snapshot.providerStatus === 'complete') {
      update.status = amountPaid >= Number(order.amount) ? 'paid' : 'underpaid'
      if (update.status === 'paid') update.paid_at = new Date().toISOString()
    } else if (snapshot.providerStatus === 'expired' && order.status === 'pending') update.status = 'expired'
    else if (snapshot.providerStatus === 'failed' && order.status === 'pending') update.status = 'cancelled'
  } else if (event.payment) {
    const payment = event.payment
    update.provider_payment_id = payment.id ?? order.provider_payment_id
    update.provider_status = payment.status ?? order.provider_status
    update.provider_synced_at = new Date().toISOString()
    update.tx_hash = payment.transactionHash ?? payment.transaction?.hash ?? order.tx_hash
    update.payer_address = payment.fromAddresses?.addresses?.[0] ?? order.payer_address
    update.provider_deposit_address = payment.depositAddress?.address ?? order.provider_deposit_address
    update.provider_chain = payment.depositAddress?.chain ?? order.provider_chain
    if (payment.amount?.amount != null) {
      update.provider_amount_paid = payment.amount.amount
      update.paid_amount = payment.amount.amount
    }
    if (payment.status === 'paid') {
      const paid = Number(payment.amount?.amount ?? 0)
      update.status = paid >= Number(order.amount) ? 'paid' : 'underpaid'
      if (update.status === 'paid') update.paid_at = new Date().toISOString()
    }
  }

  if (['paid', 'cancelled', 'expired'].includes(order.status) && update.status === 'pending') delete update.status
  const { error } = await admin.from('merchant_orders').update(update).eq('id', order.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await markProcessed(admin, envelope.MessageId)
  return NextResponse.json({ processed: true })
}

async function markProcessed(admin: ReturnType<typeof createAdminSupabaseClient>, messageId: string) {
  await admin.from('circle_webhook_events').update({ processed_at: new Date().toISOString() }).eq('message_id', messageId)
}
