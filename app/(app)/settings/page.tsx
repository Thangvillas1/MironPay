'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { useAuthStore } from '@/app/store/auth'

export default function SettingsPage() {
  const router = useRouter()
  const { user, setUser } = useAuthStore()
  const [hasPIN, setHasPIN] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/'); return }
      if (!user) setUser(session.user)
      const { data: profile } = await supabase.from('profiles').select('pin_hash').eq('id', session.user.id).single()
      setHasPIN(!!profile?.pin_hash)
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const emailVerified = !!user?.email_confirmed_at
  const securityGood = hasPIN && emailVerified

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-page)' }}>
      <p style={{ fontSize: 14, color: 'var(--c-muted)' }}>Loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-page)', color: 'var(--c-text)', padding: 24 }}>
      <h1 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--c-text)' }}>Settings</h1>

      {/* Wallet Security — moved here from the Wallet page. Real signals only:
          PIN + email verified are known facts; Passkey/2FA don't exist in this
          app yet (shown honestly, not faked); Backup is "Managed by Circle"
          because this is a Developer-Controlled Wallet — there's no user seed
          phrase to back up. */}
      <div style={{ maxWidth: 420, padding: 18, borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--c-muted2)' }}>Wallet security</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: securityGood ? '#2dd4bf' : 'var(--c-warning)', background: securityGood ? 'rgba(45,212,191,.12)' : 'rgba(245,183,72,.12)', padding: '3px 9px', borderRadius: 9999 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: securityGood ? '#2dd4bf' : 'var(--c-warning)' }} />
            {securityGood ? 'Good' : 'Needs attention'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>PIN</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: hasPIN ? '#2dd4bf' : 'var(--c-warning)' }}>{hasPIN ? 'Enabled' : 'Not set'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
          <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>Email verified</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: emailVerified ? '#2dd4bf' : 'var(--c-warning)' }}>{emailVerified ? 'Verified' : 'Unverified'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
          <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>Backup</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>Managed by Circle</span>
        </div>
        {/* TODO: no passkey system exists in this app yet. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
          <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>Passkey</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-muted2)' }}>Not available</span>
        </div>
        {/* TODO: no 2FA system exists in this app yet. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
          <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>2FA</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-muted2)' }}>Not available</span>
        </div>
      </div>
    </div>
  )
}
