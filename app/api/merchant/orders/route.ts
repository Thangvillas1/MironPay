import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import {
  CIRCLE_MANAGED_PROVIDER,
  circleManagedPaymentsEnabled,
  createTransientPaymentIntent,
  paymentIntentSnapshot,
  publicOrder,
} from '@/app/lib/circle-managed-payments'

const ORDER_WINDOW_SECONDS = 180

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('merchant_profiles').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Set up your store first' }, { status: 400 })

  const { amount } = await request.json()
  const amountNum = parseFloat(amount)
  if (isNaN(amountNum) || amountNum <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
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
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    query = query.gte('created_at', startOfDay.toISOString())
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const paidOrders = (data ?? []).filter((o) => o.status === 'paid')
  const totalToday = paidOrders.reduce((sum, o) => sum + parseFloat(o.paid_amount ?? o.amount), 0)

  return NextResponse.json({ orders: data ?? [], totalPaid: totalToday, paidCount: paidOrders.length })
}
