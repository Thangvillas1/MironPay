import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { circleClient } from '@/app/lib/circle'
import { sendInvoiceEmail } from '@/app/lib/email'
import { computeInvoiceTotal, invoiceContentHash, type InvoiceLineItem } from '@/app/lib/invoice-chain'
import type { Hex } from 'viem'
import { arcPublicClient } from '@/app/lib/arc-chain'

const MAX_LINE_ITEMS = 100
const MAX_DESCRIPTION_LENGTH = 500
const MAX_NOTES_LENGTH = 5_000
const MAX_DISPLAY_NAME_LENGTH = 200
const MAX_DUE_DAYS = 365
const MAX_INVOICE_AMOUNT = 1_000_000_000

function generateInvoiceCode() {
  // Public invoice URLs act as bearer links. Use 128 bits from the Web Crypto
  // CSPRNG so the code cannot be enumerated like the previous five-character
  // Math.random() suffix.
  return `INV-${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`
}

function parseLineItems(raw: unknown): InvoiceLineItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LINE_ITEMS) return null
  const items: InvoiceLineItem[] = []
  for (const row of raw) {
    const description = typeof row?.description === 'string' ? row.description.trim() : ''
    const quantity = parseFloat(row?.quantity)
    const unitPrice = parseFloat(row?.unitPrice)
    if (
      !description ||
      description.length > MAX_DESCRIPTION_LENGTH ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) return null
    items.push({ description, quantity, unitPrice })
  }
  return items
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { recipientEmail, recipientName, dueInDays, notes, issuerDisplayName, sendEmail } = body

  const email = typeof recipientEmail === 'string' ? recipientEmail.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid recipient email is required' }, { status: 400 })
  }

  const normalizedNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null
  const normalizedIssuerName = typeof issuerDisplayName === 'string' && issuerDisplayName.trim()
    ? issuerDisplayName.trim()
    : null
  const normalizedRecipientName = typeof recipientName === 'string' && recipientName.trim()
    ? recipientName.trim()
    : null
  if (
    (normalizedNotes?.length ?? 0) > MAX_NOTES_LENGTH ||
    (normalizedIssuerName?.length ?? 0) > MAX_DISPLAY_NAME_LENGTH ||
    (normalizedRecipientName?.length ?? 0) > MAX_DISPLAY_NAME_LENGTH
  ) {
    return NextResponse.json({ error: 'Invoice text fields exceed their allowed length' }, { status: 400 })
  }

  const lineItems = parseLineItems(body.lineItems)
  if (!lineItems) {
    return NextResponse.json({ error: 'At least one valid line item (description, quantity > 0, unitPrice >= 0) is required' }, { status: 400 })
  }
  const taxBps = Math.max(0, Math.min(10000, parseInt(body.taxBps, 10) || 0))
  const discountAmount = Math.max(0, parseFloat(body.discountAmount) || 0)
  const amountNum = computeInvoiceTotal(lineItems, taxBps, discountAmount)
  if (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > MAX_INVOICE_AMOUNT) {
    return NextResponse.json({ error: 'Invoice total is outside the allowed range' }, { status: 400 })
  }

  const days = parseInt(dueInDays, 10)
  const dueInDaysNum = Number.isFinite(days) && days > 0 ? Math.min(days, MAX_DUE_DAYS) : 7
  const dueDate = new Date(Date.now() + dueInDaysNum * 24 * 60 * 60 * 1000)

  const wallet = await resolveCircleWalletId(supabase, user.id)
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 400 })
  const createdBlock = await arcPublicClient().getBlockNumber()

  const nonce = crypto.randomUUID()
  const contentHash = invoiceContentHash({
    receiveAddress: wallet.walletAddress,
    lineItems,
    taxBps,
    discountAmount,
    dueDate: dueDate.toISOString(),
    notes: normalizedNotes,
    nonce,
  })

  // Issuer's own Circle-managed wallet signs the invoice content — this is
  // the "chữ ký để xác minh issuer" step. Nobody can forge this without
  // controlling the issuer's actual MironPay wallet (Circle developer-
  // controlled wallets never expose the key to the browser, so this call
  // itself IS the proof the authenticated user's own wallet signed it).
  let signature: Hex
  try {
    const signRes = await circleClient.signMessage({
      walletId: wallet.circleWalletId,
      message: contentHash,
      encodedByHex: true,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sig = (signRes.data as any)?.signature ?? (signRes.data as any)?.data?.signature
    if (!sig) throw new Error('Circle signMessage did not return a signature')
    signature = sig as Hex
  } catch (e) {
    return NextResponse.json({ error: `Failed to sign invoice: ${e instanceof Error ? e.message : 'unknown error'}` }, { status: 500 })
  }

  // invoice_code has a unique constraint — retry on the rare collision instead
  // of trusting randomness alone.
  let insertResult
  for (let attempt = 0; attempt < 5; attempt++) {
    const invoiceCode = generateInvoiceCode()
    insertResult = await supabase
      .from('invoices')
      .insert({
        issuer_user_id: user.id,
        receive_address: wallet.walletAddress,
        recipient_email: email,
        recipient_name: normalizedRecipientName,
        amount: amountNum,
        invoice_code: invoiceCode,
        due_date: dueDate.toISOString(),
        line_items: lineItems,
        tax_bps: taxBps,
        discount_amount: discountAmount,
        notes: normalizedNotes,
        issuer_display_name: normalizedIssuerName,
        issuer_address: wallet.walletAddress,
        content_hash: contentHash,
        signature,
        signed_at: new Date().toISOString(),
        created_block: createdBlock.toString(),
      })
      .select()
      .single()
    if (!insertResult.error || insertResult.error.code !== '23505') break
  }

  if (!insertResult || insertResult.error) {
    return NextResponse.json({ error: insertResult?.error?.message ?? 'Failed to create invoice' }, { status: 500 })
  }

  const invoice = insertResult.data

  // Email is optional — the issuer may instead just copy the public link and
  // share it themselves (both delivery paths land on the same signed page).
  if (sendEmail) {
    const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle()
    await sendInvoiceEmail({
      to: email,
      amount: amountNum,
      invoiceCode: invoice.invoice_code,
      issuerName: normalizedIssuerName || profile?.username || null,
      dueDate: invoice.due_date,
      receiveAddress: invoice.receive_address,
    }).catch(e => console.error('[invoice] email send failed:', e))
  }

  return NextResponse.json({ invoice })
}

export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('issuer_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invoices: data ?? [] })
}
