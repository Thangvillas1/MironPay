'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/app/lib/supabase'

interface OrderSummary { id: string; amount: string; paid_amount: string | null; status: string; created_at: string }

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']

export default function StorePage() {
  const router = useRouter()
  const [accessToken, setAccessToken] = useState('')
  const [storeName, setStoreName] = useState('')
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [totalToday, setTotalToday] = useState(0)
  const [paidCountToday, setPaidCountToday] = useState(0)
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([])

  const loadSummary = useCallback(async (token: string) => {
    const res = await fetch('/api/merchant/orders?range=today', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const d = await res.json()
    setTotalToday(d.totalPaid ?? 0)
    setPaidCountToday(d.paidCount ?? 0)
    setRecentOrders((d.orders ?? []).slice(0, 5))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session
      if (!session) { router.replace('/'); return }
      const { data: profile } = await supabase
        .from('merchant_profiles')
        .select('store_name')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (!profile) { router.replace('/store/setup'); return }
      setStoreName(profile.store_name)
      setAccessToken(session.access_token)
      await loadSummary(session.access_token)
      setLoading(false)
    })
  }, [router, loadSummary])

  function pressKey(key: string) {
    setError('')
    if (key === '⌫') { setAmount(a => a.slice(0, -1)); return }
    if (key === '.' && amount.includes('.')) return
    if (amount.replace('.', '').length >= 9) return // sane cap, avoids a runaway display
    setAmount(a => a + key)
  }

  const amountNum = parseFloat(amount || '0')
  const canCharge = amountNum > 0

  async function handleCharge() {
    if (!canCharge || creating) return
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/merchant/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ amount: amountNum }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (res.status === 400 && /store/i.test(d.error ?? '')) { router.replace('/store/setup'); return }
        setError(d.error ?? 'Could not create charge')
        setCreating(false)
        return
      }
      router.push(`/store/${d.order.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection error')
      setCreating(false)
    }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--c-muted)', fontSize: 14 }}>Loading…</div>

  return (
    <div style={{ padding: 24, maxWidth: 420, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--c-text)' }}>{storeName}</h1>
          <p style={{ fontSize: 12.5, color: 'var(--c-muted2)', margin: '2px 0 0' }}>New sale</p>
        </div>
        <Link href="/store/setup" style={{ fontSize: 12, color: 'var(--c-muted)', textDecoration: 'none' }}>Edit store</Link>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
        <div style={{ flex: 1, borderRadius: 14, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', padding: '12px 14px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-muted2)' }}>Today</div>
          <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>${totalToday.toFixed(2)}</div>
        </div>
        <div style={{ flex: 1, borderRadius: 14, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', padding: '12px 14px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-muted2)' }}>Sales</div>
          <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>{paidCountToday}</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--c-muted2)', marginBottom: 10 }}>Amount</p>
        <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', minHeight: 62 }}>
          ${amount || '0'}
        </div>
        {error && <p style={{ fontSize: 12.5, color: 'var(--c-error, #fb6f84)', marginTop: 8 }}>{error}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
        {KEYS.map(k => (
          <button
            key={k}
            onClick={() => pressKey(k)}
            style={{
              height: 60, borderRadius: 14, border: '1px solid rgba(var(--c-fg-rgb),.07)',
              background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 22, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {k}
          </button>
        ))}
      </div>

      <button
        onClick={handleCharge}
        disabled={!canCharge || creating}
        style={{
          width: '100%', height: 54, borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 700, color: '#fff',
          cursor: !canCharge || creating ? 'not-allowed' : 'pointer',
          background: !canCharge || creating ? 'rgba(var(--c-fg-rgb),.14)' : 'var(--grad-primary)',
          boxShadow: !canCharge || creating ? 'none' : 'var(--glow-primary)',
        }}
      >
        {creating ? 'Creating charge…' : 'Charge'}
      </button>

      {recentOrders.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--c-muted2)', marginBottom: 10 }}>Recent</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentOrders.map(o => (
              <Link key={o.id} href={`/store/${o.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
                  <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>{new Date(o.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>${parseFloat(o.paid_amount ?? o.amount).toFixed(2)}</span>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999,
                    color: o.status === 'paid' ? '#22c55e' : o.status === 'pending' ? 'var(--c-warning)' : 'var(--c-muted2)',
                    background: o.status === 'paid' ? 'rgba(34,197,94,.12)' : o.status === 'pending' ? 'rgba(245,183,72,.12)' : 'rgba(var(--c-fg-rgb),.07)',
                  }}>{o.status}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
