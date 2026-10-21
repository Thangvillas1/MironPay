import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { expirePaymentIntent } from '@/app/lib/circle-managed-payments'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // select('*') rather than naming the Circle-managed columns: until the
  // 20260815_circle_managed_payments migration is applied they don't exist,
  // and naming them made this query fail → every cancel returned 400.
  const { data: existing } = await supabase
    .from('merchant_orders')
    .select('*')
    .eq('id', id)
    .eq('merchant_user_id', user.id)
    .maybeSingle()
  if (!existing || existing.status !== 'pending') {
    return NextResponse.json({ error: 'Only a pending order you own can be cancelled' }, { status: 400 })
  }
  if (existing.payment_provider === 'circle_managed_payments' && existing.provider_payment_intent_id) {
    try {
      await expirePaymentIntent(existing.provider_payment_intent_id, crypto.randomUUID())
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Unable to expire Circle payment intent' },
        { status: 502 },
      )
    }
  }

  const { data, error } = await supabase
    .from('merchant_orders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('merchant_user_id', user.id)
    .eq('status', 'pending')
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: 'Only a pending order you own can be cancelled' }, { status: 400 })
  return NextResponse.json({ order: data })
}
