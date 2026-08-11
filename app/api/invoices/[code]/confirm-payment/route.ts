import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { arcPublicClient, USDC_TOKEN, USDC_TRANSFER_EVENT } from '@/app/lib/arc-chain'
import { sendInvoiceEmail } from '@/app/lib/email'

// How far back to look for the matching Transfer when the issuer clicks
// "I've been paid" — bounded scan (not full history) so this stays fast
// enough to run synchronously inside one request. ~5.76M blocks at Arc's
// block time comfortably covers the invoice's whole (multi-day) open
// window; if the real payment landed further back, the background
// invoice-index cron will have already caught it and this route short-
// circuits to the DB row instead of re-scanning.
const LOOKBACK_BLOCKS = 500_000n

// Issuer-triggered "I've been paid" — re-verifies on-chain at the moment of
// the click rather than trusting the click itself. This is the explicit
// confirmation step in the flow (as opposed to the silent background
// invoice-index cron): the issuer says "I believe I was paid", the backend
// checks the real chain before believing it, and only then fires the
// "payment completed" email to the payer.
export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params
  const code = rawCode.toUpperCase()
  if (!/^INV-(?:[A-F0-9]{32}|[A-HJ-NP-Z2-9]{5})$/.test(code)) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('invoice_code', code)
    .eq('issuer_user_id', user.id) // only the issuer can trigger this for their own invoice
    .maybeSingle()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  if (invoice.status === 'paid') {
    return NextResponse.json({ invoice, alreadyPaid: true })
  }
  if (invoice.status === 'cancelled') {
    return NextResponse.json({ error: 'Invoice is cancelled' }, { status: 400 })
  }

  const client = arcPublicClient()
  const tip = await client.getBlockNumber()
  const fromBlock = tip > LOOKBACK_BLOCKS ? tip - LOOKBACK_BLOCKS : 0n

  const logs = await client.getLogs({
    address: USDC_TOKEN,
    event: USDC_TRANSFER_EVENT,
    fromBlock,
    toBlock: tip,
    args: { to: invoice.receive_address as `0x${string}` },
  })

  const targetAmount = Number(invoice.amount)
  const match = logs.find(log => {
    const value = (log.args as { value?: bigint }).value
    if (value === undefined) return false
    const amount = Math.round(Number(value) / 10_000) / 100
    return amount === targetAmount
  })

  if (!match) {
    return NextResponse.json(
      { error: 'No matching on-chain payment found yet for this amount. Ask the payer to confirm the transfer landed, then try again.' },
      { status: 409 }
    )
  }

  const { data: updated, error: updateError } = await supabase
    .from('invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString(), tx_hash: match.transactionHash })
    .eq('id', invoice.id)
    .in('status', ['pending', 'overdue']) // guard against a race with the background watcher
    .select()
    .single()

  if (updateError || !updated) {
    // Someone else (the cron) already marked it paid between our check and
    // this write — not an error, just already done.
    return NextResponse.json({ invoice, alreadyPaid: true })
  }

  await sendInvoiceEmail({
    to: invoice.recipient_email,
    amount: targetAmount,
    invoiceCode: invoice.invoice_code,
    dueDate: invoice.due_date,
    variant: 'completed',
  }).catch(e => console.error('[invoice confirm-payment] completion email failed:', e))

  return NextResponse.json({ invoice: updated })
}
