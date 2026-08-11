'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'

interface LineItem {
  description: string
  quantity: number
  unitPrice: number
}

interface InvoiceData {
  invoiceCode: string
  amount: number
  status: string
  receiveAddress: string
  recipientName: string | null
  dueDate: string
  createdAt: string
  paidAt: string | null
  txHash: string | null
  issuerName: string | null
  lineItems: LineItem[]
  taxBps: number
  discountAmount: number
  notes: string | null
  issuerAddress: string | null
  signatureValid: boolean
}

// Bare-bones public test page — not the real UI. Just proves GET /api/invoices/[code]
// works with no auth, reflects live status, and shows the signature verify result.
export default function PublicInvoicePage() {
  const params = useParams<{ code: string }>()
  const [invoice, setInvoice] = useState<InvoiceData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/invoices/${params.code}`)
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Not found')
      return
    }
    setInvoice(data.invoice)
  }, [params.code])

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void load() })
    const interval = setInterval(load, 3000) // crude polling, real UI would use Supabase Realtime
    return () => {
      cancelAnimationFrame(frame)
      clearInterval(interval)
    }
  }, [load])

  if (error) return <div style={{ padding: 24 }}>Error: {error}</div>
  if (!invoice) return <div style={{ padding: 24 }}>Loading…</div>

  const statusColor = invoice.status === 'paid' ? '#22c55e' : invoice.status === 'overdue' ? '#fb6f84' : '#6366f1'
  const subtotal = invoice.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const tax = (subtotal * invoice.taxBps) / 10000

  return (
    <div style={{ padding: 24, maxWidth: 520, margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Invoice {invoice.invoiceCode}</h1>
          {invoice.issuerName && <p style={{ color: '#667085', margin: '2px 0 0' }}>From {invoice.issuerName}</p>}
        </div>
        <p style={{ padding: '4px 12px', borderRadius: 999, background: statusColor, color: '#fff', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>
          {invoice.status}
        </p>
      </div>

      <div style={{
        marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
        color: invoice.signatureValid ? '#12b76a' : '#b42318',
      }}>
        <span>{invoice.signatureValid ? '✓' : '✗'}</span>
        <span>{invoice.signatureValid
          ? `Signature verified — signed by issuer wallet ${invoice.issuerAddress?.slice(0, 6)}…${invoice.issuerAddress?.slice(-4)}`
          : 'Signature could not be verified — do not trust this invoice'}</span>
      </div>

      {invoice.lineItems.length > 0 && (
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 20 }}>
          <thead>
            <tr style={{ color: '#667085', textAlign: 'left' }}>
              <th style={{ paddingBottom: 6, borderBottom: '1px solid #e3e7ef' }}>Description</th>
              <th style={{ paddingBottom: 6, borderBottom: '1px solid #e3e7ef', textAlign: 'right' }}>Qty</th>
              <th style={{ paddingBottom: 6, borderBottom: '1px solid #e3e7ef', textAlign: 'right' }}>Price</th>
              <th style={{ paddingBottom: 6, borderBottom: '1px solid #e3e7ef', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((item, idx) => (
              <tr key={idx}>
                <td style={{ padding: '6px 0' }}>{item.description}</td>
                <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                <td style={{ textAlign: 'right' }}>{item.unitPrice.toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>{(item.quantity * item.unitPrice).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e3e7ef', fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{subtotal.toFixed(2)} USDC</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tax</span><span>{tax.toFixed(2)} USDC</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount</span><span>-{invoice.discountAmount.toFixed(2)} USDC</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 20, marginTop: 6 }}><span>Total</span><span>{invoice.amount.toFixed(2)} USDC</span></div>
      </div>

      {invoice.notes && <p style={{ fontSize: 13, color: '#475467', marginTop: 16 }}>{invoice.notes}</p>}

      {invoice.status !== 'paid' && (
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <div style={{ display: 'inline-block', padding: 12, background: '#ffffff', borderRadius: 12, border: '1px solid #e3e7ef' }}>
            <QRCodeSVG
              value={JSON.stringify({ address: invoice.receiveAddress, amount: invoice.amount, memo: invoice.invoiceCode })}
              size={188}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
            />
          </div>
          <p style={{ fontSize: 11, color: '#98a2b3', marginTop: 8 }}>Scan with any wallet that supports MironPay QR payments</p>
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 13, color: '#475467', lineHeight: 1.8 }}>
        <p>Pay to address: <code>{invoice.receiveAddress}</code></p>
        <p>Memo/reference: <code>{invoice.invoiceCode}</code></p>
        <p>Due: {new Date(invoice.dueDate).toLocaleDateString()}</p>
        {invoice.paidAt && <p>Paid at: {new Date(invoice.paidAt).toLocaleString()}</p>}
        {invoice.txHash && <p>Tx: <code style={{ wordBreak: 'break-all' }}>{invoice.txHash}</code></p>}
      </div>

      <p style={{ fontSize: 11, color: '#98a2b3', marginTop: 24 }}>
        Auto-refreshing every 3s — real UI would use Supabase Realtime instead of polling.
      </p>
    </div>
  )
}
