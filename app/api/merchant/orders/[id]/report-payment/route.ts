import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { USDC_TOKEN } from '@/app/lib/arc-chain'
import { readArcTransactionMemo } from '@/app/lib/arc-transaction-memo'

const USDC_DECIMALS = 6

// Verified payment confirmation for the legacy (non-Circle-managed) path: every
// order on this path shares the merchant's one static receive_address, so the
// only thing that ties an on-chain transfer to *this* order is the Arc memo —
// this route requires that memo to equal the order id, matching the sender's
// transfer to the merchant's address and re-reading the paid amount from the
// chain itself. The client-declared amount from the old self-report flow is no
// longer trusted for anything (see arc-transaction-memo.ts for the on-chain read).
//
// No auth required — this endpoint is called from the public /pay page (the
// payer may not have a MironPay account), and it is trustless by construction:
// the only thing it does is confirm data that is already public on-chain, so
// there is nothing a caller identity could gate.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { txHash } = await request.json()
  if (typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: 'A valid transaction hash is required' }, { status: 400 })
  }

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

  const { data: merchant } = await admin
    .from('merchant_profiles')
    .select('receive_address')
    .eq('user_id', order.merchant_user_id)
    .maybeSingle()
  if (!merchant?.receive_address) return NextResponse.json({ error: 'Store has no receive address configured' }, { status: 400 })

  const memoMatch = await readArcTransactionMemo(txHash, merchant.receive_address)
  if (!memoMatch) {
    return NextResponse.json(
      { error: 'Could not find a memo-tagged USDC transfer to this store in that transaction' },
      { status: 400 },
    )
  }
  if (memoMatch.memo !== order.id) {
    return NextResponse.json({ error: 'That transaction is tagged for a different order' }, { status: 400 })
  }
  if (memoMatch.tokenAddress.toLowerCase() !== USDC_TOKEN.toLowerCase()) {
    return NextResponse.json({ error: 'Payment was not made in USDC' }, { status: 400 })
  }

  // Same tx replayed against an already-paid order (or a race between two
  // report-payment calls) must not double-apply — the pending/underpaid guard
  // above already narrows this, but also refuse a tx_hash already recorded.
  const { data: dupe } = await admin.from('merchant_orders').select('id').eq('tx_hash', txHash).maybeSingle()
  if (dupe) return NextResponse.json({ error: 'This transaction was already applied to an order' }, { status: 409 })

  const amountNum = Number(memoMatch.amountRaw) / 10 ** USDC_DECIMALS
  const newStatus = amountNum >= parseFloat(order.amount) ? 'paid' : 'underpaid'

  const { data: updated, error } = await admin
    .from('merchant_orders')
    .update({
      status: newStatus,
      payer_address: memoMatch.senderAddress,
      paid_amount: amountNum,
      tx_hash: txHash,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: updated })
}
