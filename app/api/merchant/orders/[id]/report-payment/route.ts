import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'

// Self-reported payment confirmation: the customer's own app calls this
// right after their own /api/wallet/transfer succeeds. There is no on-chain
// payment-detection webhook in this phase — flagged simplification, not a
// silently-faked "verified" status.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { amount, txHash } = await request.json()
  const amountNum = parseFloat(amount)
  if (isNaN(amountNum) || amountNum <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  }

  const wallet = await resolveCircleWalletId(supabase, user.id)
  const payerAddress = wallet?.walletAddress ?? null

  const admin = createAdminSupabaseClient()
  const { data: order } = await admin.from('merchant_orders').select('*').eq('id', id).maybeSingle()
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.payment_provider === 'circle_managed_payments') {
    return NextResponse.json(
      { error: 'Payment confirmation is handled by Circle webhooks for this order' },
      { status: 409 },
    )
  }
  if (order.status !== 'pending' && order.status !== 'underpaid') {
    return NextResponse.json({ error: `Order already ${order.status}` }, { status: 400 })
  }

  const newStatus = amountNum >= parseFloat(order.amount) ? 'paid' : 'underpaid'

  const { data: updated, error } = await admin
    .from('merchant_orders')
    .update({
      status: newStatus,
      payer_address: payerAddress,
      paid_amount: amountNum,
      tx_hash: txHash ?? null,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: updated })
}
