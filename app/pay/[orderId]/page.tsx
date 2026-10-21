'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface OrderData {
  id: string
  amount: string
  paid_amount: string | null
  status: string
  expires_at: string
  paymentAddress: string | null
  paymentProvider: string
}

interface MerchantData {
  storeName: string
  verified: boolean
  receiveAddress: string | null
}

export default function PayPage() {
  const params = useParams<{ orderId: string }>()
  const [order, setOrder] = useState<OrderData | null>(null)
  const [merchant, setMerchant] = useState<MerchantData | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedMemo, setCopiedMemo] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [txHashInput, setTxHashInput] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/pay/${params.orderId}`)
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Order not found'); return }
    setOrder(d.order)
    setMerchant(d.merchant)
  }, [params.orderId])

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void load() })
    const id = setInterval(load, 3000)
    return () => {
      cancelAnimationFrame(frame)
      clearInterval(id)
    }
  }, [load])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Circle-managed orders carry their own per-order deposit address; legacy
  // orders have none on the order row and are paid to the store's static
  // receive address (which /api/pay already resolves into merchant.receiveAddress).
  const payAddress = order?.paymentAddress ?? merchant?.receiveAddress ?? null

  async function copyAddress() {
    if (!payAddress) return
    await navigator.clipboard.writeText(payAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  async function copyMemo() {
    if (!order) return
    await navigator.clipboard.writeText(order.id)
    setCopiedMemo(true)
    setTimeout(() => setCopiedMemo(false), 1800)
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!order || verifying) return
    setVerifying(true); setVerifyError('')
    try {
      const res = await fetch(`/api/merchant/orders/${order.id}/report-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: txHashInput.trim() }),
      })
      const d = await res.json()
      if (!res.ok) { setVerifyError(d.error ?? 'Could not verify that transaction'); setVerifying(false); return }
      await load()
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : 'Connection error')
    }
    setVerifying(false)
  }

  if (error) {
    return (
      <div className="bg-mp-bg" style={pageStyle}>
        <p style={{ fontSize: 14, color: 'var(--c-error, #fb6f84)' }}>{error}</p>
      </div>
    )
  }
  if (!order) {
    return (
      <div className="bg-mp-bg" style={pageStyle}>
        <p style={{ fontSize: 14, color: 'var(--c-muted)' }}>Loading…</p>
      </div>
    )
  }

  const amount = parseFloat(order.paid_amount ?? order.amount)
  const secondsLeft = Math.max(0, Math.floor((new Date(order.expires_at).getTime() - now) / 1000))
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const isPending = order.status === 'pending'
  const isPaid = order.status === 'paid'
  const isLegacy = order.paymentProvider !== 'circle_managed_payments'

  return (
    <div className="bg-mp-bg" style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {merchant && (
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>{merchant.storeName}</span>
              {merchant.verified && (
                <svg width={15} height={15} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2f6bff" /><path d="M7.5 12.2l3 3 6-6.4" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--c-muted2)', margin: '2px 0 0' }}>via MironPay</p>
          </div>
        )}

        {isPaid && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 76, height: 76, margin: '0 auto 16px', borderRadius: '50%', background: 'rgba(34,197,94,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)', margin: '0 0 4px' }}>Payment received</h1>
            <p style={{ fontSize: 34, fontWeight: 700, color: 'var(--c-text)', margin: '8px 0 0', fontVariantNumeric: 'tabular-nums' }}>${amount.toFixed(2)}</p>
          </div>
        )}

        {!isPending && !isPaid && (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-muted)', margin: '0 0 4px' }}>
              {order.status === 'underpaid' ? 'Payment incomplete' : 'This charge is no longer active'}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--c-muted2)' }}>Ask the store to start a new charge.</p>
          </div>
        )}

        {isPending && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--c-muted2)' }}>Amount due</p>
            <p style={{ fontSize: 40, fontWeight: 700, color: 'var(--c-text)', margin: '4px 0 22px', fontVariantNumeric: 'tabular-nums' }}>${amount.toFixed(2)}</p>

            {payAddress && (
              <div style={{ borderRadius: 14, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', padding: '14px 16px', textAlign: 'left' }}>
                <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-muted2)', margin: '0 0 6px' }}>Pay to address</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ flex: 1, fontSize: 12.5, color: 'var(--c-text)', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>{payAddress}</code>
                  <button onClick={copyAddress} style={{ flexShrink: 0, border: 'none', background: 'rgba(var(--c-fg-rgb),.07)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--c-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {copied
                      ? <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                      : <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>}
                  </button>
                </div>
              </div>
            )}

            {isLegacy ? (
              <>
                <div style={{ borderRadius: 14, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', padding: '14px 16px', textAlign: 'left', marginTop: 10 }}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-muted2)', margin: '0 0 6px' }}>Memo (required)</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ flex: 1, fontSize: 12.5, color: 'var(--c-text)', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>{order.id}</code>
                    <button onClick={copyMemo} style={{ flexShrink: 0, border: 'none', background: 'rgba(var(--c-fg-rgb),.07)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--c-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {copiedMemo
                        ? <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                        : <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>}
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 16 }}>
                  Open MironPay → Send → paste the address above with this exact memo. Without the memo, the store cannot tell your payment apart from anyone else&apos;s.
                </p>

                <form onSubmit={handleVerify} style={{ marginTop: 18, textAlign: 'left' }}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-muted2)', margin: '0 0 6px' }}>Already sent it?</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={txHashInput}
                      onChange={e => setTxHashInput(e.target.value.trim())}
                      placeholder="Paste transaction hash (0x…)"
                      style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)', color: 'var(--c-text)', fontSize: 12.5, fontFamily: 'var(--font-mono)', outline: 'none' }}
                    />
                    <button
                      type="submit"
                      disabled={verifying || !/^0x[0-9a-fA-F]{64}$/.test(txHashInput)}
                      style={{
                        flexShrink: 0, padding: '0 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 600, color: '#fff',
                        cursor: verifying || !/^0x[0-9a-fA-F]{64}$/.test(txHashInput) ? 'not-allowed' : 'pointer',
                        background: verifying || !/^0x[0-9a-fA-F]{64}$/.test(txHashInput) ? 'rgba(var(--c-fg-rgb),.14)' : 'var(--grad-primary)',
                      }}
                    >
                      {verifying ? 'Checking…' : 'Confirm'}
                    </button>
                  </div>
                  {verifyError && <p style={{ fontSize: 12, color: 'var(--c-error, #fb6f84)', marginTop: 8 }}>{verifyError}</p>}
                </form>
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 16 }}>
                Open MironPay → Send → paste this address for the exact amount above.
              </p>
            )}

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, padding: '7px 14px', borderRadius: 999, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.1)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: secondsLeft <= 30 ? 'var(--c-error, #fb6f84)' : 'var(--c-warning)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 20px',
}
