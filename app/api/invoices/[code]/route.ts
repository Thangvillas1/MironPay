import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { verifyInvoiceSignature } from '@/app/lib/invoice-chain'
import type { Address, Hex } from 'viem'

// Public, no-auth lookup — the payer may not have a MironPay account at all.
// RLS on `invoices` already grants anon select scoped by knowing the code,
// but this route runs server-side with no user JWT to attach, so it uses
// the admin client directly (same posture as merchant orders/[id] fetching
// merchant_profiles display fields — only non-sensitive fields go out).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params
  const code = rawCode.toUpperCase()
  // Keep existing five-character links working while issuing only 128-bit
  // codes for newly created invoices.
  if (!/^INV-(?:[A-F0-9]{32}|[A-HJ-NP-Z2-9]{5})$/.test(code)) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }
  const admin = createAdminSupabaseClient()

  const { data: invoice } = await admin
    .from('invoices')
    .select('invoice_code, amount, status, receive_address, recipient_name, due_date, created_at, paid_at, tx_hash, issuer_user_id, line_items, tax_bps, discount_amount, notes, issuer_display_name, issuer_address, content_hash, signature')
    .eq('invoice_code', code)
    .maybeSingle()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const { data: issuerProfile } = await admin
    .from('profiles')
    .select('username')
    .eq('id', invoice.issuer_user_id)
    .maybeSingle()

  // Overdue is computed lazily on read (same pattern as merchant orders'
  // pending -> expired), not written by a background job for every read.
  const status = invoice.status === 'pending' && new Date(invoice.due_date).getTime() < Date.now()
    ? 'overdue'
    : invoice.status

  // Anyone loading this page can verify the issuer's own wallet actually
  // signed this exact content — recomputed server-side on every read so a
  // tampered row (or a bug that let one field change without re-signing)
  // shows as unverified instead of silently trusting the stored signature.
  let signatureValid = false
  if (invoice.content_hash && invoice.signature && invoice.issuer_address) {
    signatureValid = await verifyInvoiceSignature(
      invoice.content_hash as Hex,
      invoice.signature as Hex,
      invoice.issuer_address as Address
    )
  }

  return NextResponse.json({
    invoice: {
      invoiceCode: invoice.invoice_code,
      amount: invoice.amount,
      status,
      receiveAddress: invoice.receive_address,
      recipientName: invoice.recipient_name,
      dueDate: invoice.due_date,
      createdAt: invoice.created_at,
      paidAt: invoice.paid_at,
      txHash: invoice.tx_hash,
      issuerName: invoice.issuer_display_name ?? issuerProfile?.username ?? null,
      lineItems: invoice.line_items ?? [],
      taxBps: invoice.tax_bps ?? 0,
      discountAmount: invoice.discount_amount ?? 0,
      notes: invoice.notes,
      issuerAddress: invoice.issuer_address,
      signature: invoice.signature,
      signatureValid,
    },
  })
}
