import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { sendInvoiceEmail } from '@/app/lib/email'

// Sweeps pending invoices past due_date, flips them to 'overdue', and sends
// a one-time reminder email. Overdue invoices stay payable indefinitely
// (invoice-index still matches them) — this only changes the status label
// and nudges the payer, it never cancels anything.
// Not wired to Vercel Cron yet — trigger manually:
//   curl -H "Authorization: Bearer $AGENT_INDEXER_CRON_SECRET" https://<host>/api/cron/invoice-overdue
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? process.env.AGENT_INDEXER_CRON_SECRET
  const auth = request.headers.get('Authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()

  const { data: dueInvoices, error } = await supabase
    .from('invoices')
    .select('id, invoice_code, recipient_email, amount, due_date, receive_address')
    .eq('status', 'pending')
    .lt('due_date', new Date().toISOString())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let flipped = 0
  for (const invoice of dueInvoices ?? []) {
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ status: 'overdue' })
      .eq('id', invoice.id)
      .eq('status', 'pending') // guard against a race with invoice-index marking it paid meanwhile

    if (updateError) continue
    flipped += 1

    await sendInvoiceEmail({
      to: invoice.recipient_email,
      amount: Number(invoice.amount),
      invoiceCode: invoice.invoice_code,
      dueDate: invoice.due_date,
      variant: 'reminder',
      receiveAddress: invoice.receive_address,
    }).catch(e => console.error('[invoice-overdue] reminder email failed:', e))
  }

  return NextResponse.json({ checked: dueInvoices?.length ?? 0, flippedToOverdue: flipped })
}
