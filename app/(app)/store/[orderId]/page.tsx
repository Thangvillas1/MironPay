'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '@/app/lib/supabase'

interface OrderData {
  id: string
  amount: string
  paid_amount: string | null
  status: string
  expires_at: string
  paymentProvider: string
}

export default function StoreOrderPage() {
  const params = useParams<{ orderId: string }>()
  const router = useRouter()
  const [accessToken, setAccessToken] = useState('')
  const [order, setOrder] = useState<OrderData | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [cancelling, setCancelling] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async (token: string) => {
    const res = await fetch(`/api/merchant/orders/${params.orderId}`, { headers: { Authorization: `Bearer ${token}` } })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Order not found'); return }
    setOrder(d.order)
  }, [params.orderId])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session
      if (!session) { router.replace('/'); return }
      setAccessToken(session.access_token)
      await load(session.access_token)
    })
  }, [router, load])

  // Poll while the sale is still open — stop once it reaches a final state.
  useEffect(() => {
    if (!accessToken) return
    const isFinal = order && order.status !== 'pending'
    if (isFinal) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(() => load(accessToken), 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [accessToken, order, load])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Cancel must actually close the charge server-side — just navigating away
  // left it pending, so the customer could still pay a sale the store had
  // abandoned. If the cancel is refused (e.g. it was paid in the meantime),
  // reload instead of leaving, so the real final state is shown.
  async function cancelSale() {
    if (!order || cancelling) return
    setCancelling(true)
    const res = await fetch(`/api/merchant/orders/${order.id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null)
    if (res?.ok) { router.push('/store'); return }
    setCancelling(false)
    await load(accessToken)
  }

  if (error) {
    return (
      <div style={{ padding: 24, maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--c-error, #fb6f84)' }}>{error}</p>
        <button onClick={() => router.push('/store')} style={{ marginTop: 16, height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: 'var(--grad-primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Back to Store
        </button>
      </div>
    )
  }

  if (!order) return <div style={{ padding: 24, color: 'var(--c-muted)', fontSize: 14 }}>Loading…</div>

  const displayAmount = parseFloat(order.paid_amount ?? order.amount)
  const secondsLeft = Math.max(0, Math.floor((new Date(order.expires_at).getTime() - now) / 1000))
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const payUrl = typeof window !== 'undefined' ? `${window.location.origin}/pay/${order.id}` : ''

  return (
    <div style={{ padding: 24, maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
      {order.status === 'paid' && (
        <div style={{ animation: 'srsStep .25s ease' }}>
          <div style={{
            width: 84, height: 84, margin: '20px auto', borderRadius: '50%', background: 'rgba(34,197,94,.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width={42} height={42} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text)', margin: '0 0 4px' }}>Paid</h1>
          <p style={{ fontSize: 34, fontWeight: 700, color: 'var(--c-text)', margin: '8px 0 24px', fontVariantNumeric: 'tabular-nums' }}>${displayAmount.toFixed(2)}</p>
          <button
            onClick={() => router.push('/store')}
            style={{ width: '100%', height: 54, borderRadius: 14, border: 'none', background: 'var(--grad-primary)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--glow-primary)' }}
          >
            New sale
          </button>
        </div>
      )}

      {(order.status === 'expired' || order.status === 'cancelled') && (
        <div>
          <div style={{
            width: 84, height: 84, margin: '20px auto', borderRadius: '50%', background: 'rgba(var(--c-fg-rgb),.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke="var(--c-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)', margin: '0 0 4px' }}>
            {order.status === 'expired' ? 'Charge expired' : 'Charge cancelled'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--c-muted)', margin: '0 0 24px' }}>No payment was received for ${parseFloat(order.amount).toFixed(2)}.</p>
          <button
            onClick={() => router.push('/store')}
            style={{ width: '100%', height: 54, borderRadius: 14, border: 'none', background: 'var(--grad-primary)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--glow-primary)' }}
          >
            Try again
          </button>
        </div>
      )}

      {order.status === 'underpaid' && (
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-warning)', margin: '20px 0 4px' }}>Underpaid</h1>
          <p style={{ fontSize: 13, color: 'var(--c-muted)', margin: '0 0 24px' }}>
            Received ${parseFloat(order.paid_amount ?? '0').toFixed(2)} of ${parseFloat(order.amount).toFixed(2)}.
          </p>
          <button
            onClick={() => router.push('/store')}
            style={{ width: '100%', height: 54, borderRadius: 14, border: 'none', background: 'var(--grad-primary)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--glow-primary)' }}
          >
            New sale
          </button>
        </div>
      )}

      {order.status === 'pending' && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--c-muted2)', marginTop: 8 }}>Amount due</p>
          <p style={{ fontSize: 44, fontWeight: 700, color: 'var(--c-text)', margin: '4px 0 20px', fontVariantNumeric: 'tabular-nums' }}>${parseFloat(order.amount).toFixed(2)}</p>

          <div style={{ display: 'inline-block', padding: 16, background: '#fff', borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,.12)' }}>
            {payUrl && <QRCodeSVG value={payUrl} size={200} bgColor="#ffffff" fgColor="#000000" level="M" />}
          </div>

          <p style={{ fontSize: 12.5, color: 'var(--c-muted)', marginTop: 14 }}>Scan to pay with MironPay</p>
          {order.paymentProvider !== 'circle_managed_payments' && (
            <p style={{ fontSize: 11.5, color: 'var(--c-muted2)', marginTop: 4 }}>The scanned page will ask the customer to include a required memo — remind them if they pay manually.</p>
          )}

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 18, padding: '7px 14px', borderRadius: 999, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.1)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: secondsLeft <= 30 ? 'var(--c-error, #fb6f84)' : 'var(--c-warning)', animation: 'srsScrim 1.6s ease infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</span>
          </div>

          <div style={{ marginTop: 24 }}>
            <button
              onClick={cancelSale}
              disabled={cancelling}
              style={{ background: 'none', border: 'none', color: 'var(--c-muted)', fontSize: 13, cursor: cancelling ? 'default' : 'pointer' }}
            >
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
