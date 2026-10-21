'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'

export default function StoreSetupPage() {
  const router = useRouter()
  const [accessToken, setAccessToken] = useState('')
  const [storeName, setStoreName] = useState('')
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session
      if (!session) { router.replace('/'); return }
      setAccessToken(session.access_token)
      // Already set up — skip straight to the POS.
      const { data: profile } = await supabase
        .from('merchant_profiles')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (profile) { router.replace('/store'); return }
      setChecking(false)
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = storeName.trim()
    if (!name) { setError('Store name is required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/merchant/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ storeName: name }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Setup failed'); setSaving(false); return }
      router.replace('/store')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection error')
      setSaving(false)
    }
  }

  if (checking) {
    return <div style={{ padding: 24, color: 'var(--c-muted)', fontSize: 14 }}>Loading…</div>
  }

  return (
    <div style={{ padding: 24, maxWidth: 420, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: 'var(--c-text)' }}>Set up your Store</h1>
      <p style={{ fontSize: 13, color: 'var(--c-muted2)', margin: '0 0 24px' }}>
        Charge customers with a QR code — payments land in your MironPay wallet.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--c-muted2)' }}>
            Store name
          </label>
          <input
            value={storeName}
            onChange={e => setStoreName(e.target.value.slice(0, 30))}
            placeholder="e.g. Miron Coffee"
            autoFocus
            maxLength={30}
            style={{
              width: '100%', marginTop: 8, padding: '12px 14px', borderRadius: 12,
              background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)',
              color: 'var(--c-text)', fontSize: 15, outline: 'none',
            }}
          />
        </div>

        {error && <p style={{ fontSize: 12.5, color: 'var(--c-error, #fb6f84)', margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={saving || !storeName.trim()}
          style={{
            height: 50, borderRadius: 14, border: 'none', fontSize: 15, fontWeight: 600, color: '#fff',
            cursor: saving || !storeName.trim() ? 'not-allowed' : 'pointer',
            background: saving || !storeName.trim() ? 'rgba(var(--c-fg-rgb),.14)' : 'var(--grad-primary)',
            boxShadow: saving || !storeName.trim() ? 'none' : 'var(--glow-primary)',
          }}
        >
          {saving ? 'Setting up…' : 'Create Store'}
        </button>
      </form>
    </div>
  )
}
