'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { isOnboardingComplete } from '@/app/lib/onboarding'

interface Submission {
  id: string
  status: 'pending_review' | 'approved' | 'rejected'
  project_id: string
  name: string
  sym: string
  category: string
  tagline: string
  price: number
  target: number
  cap: number
  min_contribution: number
  start_at: string
  end_at: string
  listing_fee_usdc: number
  listing_fee_tx_hash: string | null
  admin_notes: string | null
  created_at: string
}

export default function AdminLaunchpadPage() {
  const router = useRouter()
  const [accessToken, setAccessToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load(token: string) {
    const res = await fetch('/api/admin/launchpad/submissions', { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 403) { setForbidden(true); setLoading(false); return }
    const d = await res.json()
    if (res.ok) setSubmissions(d.submissions ?? [])
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/'); return }
      if (!(await isOnboardingComplete(data.session.user.id))) { router.replace('/'); return }
      setAccessToken(data.session.access_token)
      load(data.session.access_token)
    })
  }, [router])

  async function approve(id: string) {
    setBusyId(id); setError('')
    const res = await fetch(`/api/admin/launchpad/submissions/${id}/approve`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } })
    const d = await res.json()
    if (!res.ok) setError(d.error ?? 'Approve failed')
    else await load(accessToken)
    setBusyId(null)
  }
  async function reject(id: string) {
    const notes = window.prompt('Reason for rejection (optional):') ?? ''
    setBusyId(id); setError('')
    const res = await fetch(`/api/admin/launchpad/submissions/${id}/reject`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ notes }),
    })
    const d = await res.json()
    if (!res.ok) setError(d.error ?? 'Reject failed')
    else await load(accessToken)
    setBusyId(null)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-page)' }}>
        <p style={{ fontSize: 14, color: 'var(--c-muted)' }}>Loading...</p>
      </div>
    )
  }
  if (forbidden) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--c-page)', color: 'var(--c-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--c-muted)' }}>Not authorized.</p>
      </div>
    )
  }

  const statusColor: Record<string, string> = { pending_review: '#f5b748', approved: '#2dd4bf', rejected: '#fb6f84' }
  const statusLabel: Record<string, string> = { pending_review: 'Pending review', approved: 'Approved', rejected: 'Rejected' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-page)', color: 'var(--c-text)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 34px 80px' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Launchpad — Review submissions</h1>
        {error && <p style={{ fontSize: 13, color: '#fb6f84', marginTop: 10 }}>{error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
          {submissions.length === 0 && <p style={{ fontSize: 13.5, color: 'var(--c-muted)' }}>No submissions yet.</p>}
          {submissions.map(s => (
            <div key={s.id} style={{ padding: 18, borderRadius: 14, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 700 }}>{s.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--c-muted)' }}>${s.sym}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--c-muted2)' }}>{s.category}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, background: `${statusColor[s.status]}22`, color: statusColor[s.status] }}>
                  {statusLabel[s.status]}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 8 }}>{s.tagline}</p>
              <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 12, color: 'var(--c-muted2)', flexWrap: 'wrap' }}>
                <span>Target: <strong style={{ color: 'var(--c-text)' }}>${s.target.toLocaleString()}</strong></span>
                <span>Price: <strong style={{ color: 'var(--c-text)' }}>${s.price}</strong></span>
                <span>Per-wallet: <strong style={{ color: 'var(--c-text)' }}>${s.min_contribution}–${s.cap}</strong></span>
                <span>Window: <strong style={{ color: 'var(--c-text)' }}>{new Date(s.start_at).toLocaleDateString()} → {new Date(s.end_at).toLocaleDateString()}</strong></span>
                {s.listing_fee_tx_hash && (
                  <a href={`https://testnet.arcscan.app/tx/${s.listing_fee_tx_hash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-indigo-light)' }}>
                    Fee tx ↗
                  </a>
                )}
              </div>
              {s.admin_notes && <p style={{ fontSize: 12, color: '#fb6f84', marginTop: 8 }}>Note: {s.admin_notes}</p>}
              {s.status === 'pending_review' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button onClick={() => approve(s.id)} disabled={busyId === s.id} style={{ height: 36, padding: '0 16px', borderRadius: 10, border: 'none', background: 'var(--grad-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {busyId === s.id ? 'Approving…' : 'Approve'}
                  </button>
                  <button onClick={() => reject(s.id)} disabled={busyId === s.id} style={{ height: 36, padding: '0 16px', borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
