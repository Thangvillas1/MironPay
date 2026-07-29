'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/app/lib/supabase'

interface ClaimItem {
  id: string
  email: string
  amount: number
  note: string | null
  status: string
  created_at: string
}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
}

export default function PayrollClaimInboxPage() {
  const [items, setItems] = useState<ClaimItem[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [claimedTx, setClaimedTx] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    const res = await fetch('/api/payroll/claim/claim', { headers: await authHeader() })
    const data = await res.json()
    setItems(data.items ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function claim(item: ClaimItem) {
    setClaimingId(item.id)
    setErrors((prev) => ({ ...prev, [item.id]: '' }))
    try {
      const res = await fetch('/api/payroll/claim/claim', {
        method: 'POST',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [item.id]: data.error ?? 'Claim failed' }))
      } else {
        setClaimedTx((prev) => ({ ...prev, [item.id]: data.txHash }))
      }
    } catch {
      setErrors((prev) => ({ ...prev, [item.id]: 'Network error' }))
    }
    setClaimingId(null)
  }

  return (
    <div style={{ padding: 24, color: 'var(--c-text)', maxWidth: 640 }}>
      <Link href="/payroll" style={{ fontSize: 12, color: 'var(--c-muted2)', textDecoration: 'none' }}>← Payroll</Link>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 4px' }}>Money waiting for you</h1>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 20 }}>
        Payments sent to your account email. Claiming is free — you never pay any gas.
      </p>

      {loading && <p style={{ fontSize: 13, color: 'var(--c-muted)' }}>Loading…</p>}

      {!loading && items.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--c-muted)' }}>Nothing waiting right now.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item) => {
          const txHash = claimedTx[item.id]
          const claiming = claimingId === item.id
          const err = errors[item.id]
          return (
            <div key={item.id} style={{ borderRadius: 14, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.08)', padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace' }}>{item.amount.toFixed(6)} USDC</div>
                  {item.note && <div style={{ fontSize: 12, color: 'var(--c-muted2)', marginTop: 2 }}>{item.note}</div>}
                  {err && <div style={{ fontSize: 12, color: '#fb6f84', marginTop: 4 }}>{err}</div>}
                </div>
                {!txHash && (
                  <button
                    disabled={claiming}
                    onClick={() => claim(item)}
                    style={{
                      height: 36, padding: '0 18px', borderRadius: 8, border: 'none',
                      background: claiming ? 'rgba(129,140,248,.3)' : 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)',
                      color: '#fff', fontSize: 13, fontWeight: 600, cursor: claiming ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {claiming ? 'Claiming…' : 'Claim'}
                  </button>
                )}
              </div>
              {txHash && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(var(--c-fg-rgb),.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#34d399' }}>✅ Claimed</span>
                    <a
                      href={`https://testnet.arcscan.app/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: 'var(--c-muted2)', textDecoration: 'underline', fontFamily: 'monospace' }}
                    >
                      {txHash.slice(0, 10)}…{txHash.slice(-6)}
                    </a>
                  </div>
                  <Link
                    href="/wallet"
                    style={{
                      height: 32, padding: '0 14px', borderRadius: 8, display: 'flex', alignItems: 'center',
                      background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)',
                      color: '#fff', fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
                    }}
                  >
                    Go to Wallet →
                  </Link>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
