'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { isOnboardingComplete } from '@/app/lib/onboarding'
import { useAuthStore } from '@/app/store/auth'
import { useWalletStore } from '@/app/store/wallet'

export default function SettingsPage() {
  const router = useRouter()
  const { user, setUser } = useAuthStore()
  const { setWallet, setTransactions, setTokenList, setWalletAddress, setLastFetched } = useWalletStore()
  const [hasPIN, setHasPIN] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [scoreLevel, setScoreLevel] = useState<string | null>(null)
  const [scoreValue, setScoreValue] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileIsDark, setMobileIsDark] = useState(true)

  useEffect(() => { setMobileIsDark(localStorage.getItem('theme') !== 'light') }, [])
  function toggleMobileTheme() {
    const newDark = !mobileIsDark
    setMobileIsDark(newDark)
    localStorage.setItem('theme', newDark ? 'dark' : 'light')
    document.documentElement.classList.toggle('light', !newDark)
  }

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/'); return }
      if (!(await isOnboardingComplete(session.user.id))) { router.replace('/'); return }
      if (!user) setUser(session.user)
      const { data: profile } = await supabase.from('profiles').select('pin_hash, username').eq('id', session.user.id).single()
      setHasPIN(!!profile?.pin_hash)
      setUsername(profile?.username ?? null)
      fetch('/api/score/me', { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then(r => r.json())
        .then(d => { setScoreLevel(d?.level ?? null); setScoreValue(d?.score ?? null) })
        .catch(() => {})
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setUser(null)
    setWallet(null)
    setTransactions([])
    setTokenList([])
    setWalletAddress(null)
    setLastFetched(0)
    router.replace('/')
  }

  const emailVerified = !!user?.email_confirmed_at
  const securityGood = hasPIN && emailVerified

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-page)' }}>
      <p style={{ fontSize: 14, color: 'var(--c-muted)' }}>Loading...</p>
    </div>
  )

  const securityCard = (
    <div style={{ padding: 18, borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
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
  )

  return (
    <>
      {/* ══════════════════════ MOBILE ══════════════════════ */}
      <div className="lg:hidden" style={{ minHeight: '100vh', background: 'var(--mpm-page)', color: 'var(--mpm-text)', padding: '18px', paddingTop: 'calc(env(safe-area-inset-top) + 20px)', paddingBottom: 90 }}>
        <h1 style={{ margin: '0 0 18px', fontSize: 20, fontWeight: 700, color: 'var(--mpm-text)' }}>Settings</h1>

        {/* Profile summary */}
        <div className="flex items-center gap-3" style={{ padding: 14, background: 'var(--mpm-panel)', border: '1px solid var(--mpm-border)', borderRadius: 14, marginBottom: 18 }}>
          <span className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--mpm-grad-primary)', color: '#fff', fontSize: 17, fontWeight: 700 }}>
            {(username ?? user?.email ?? 'U').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--mpm-text)' }}>{username ? `@${username}` : user?.email}</div>
            <div style={{ fontSize: 12.5, color: 'var(--mpm-muted)' }}>
              {scoreLevel ? `${scoreLevel} · Miron Score ${scoreValue?.toLocaleString() ?? 0}` : 'Miron Score unavailable'}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--mpm-panel)', border: '1px solid var(--mpm-border)', borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
          <SettingsRow
            label="Leaderboard"
            sub="Agent reputation trên ARC Testnet"
            icon={<path d="M3 12h4l2 6 4-13 2 7h6" />}
            onClick={() => router.push('/leaderboard')}
          />
          <SettingsRow
            label="Giao diện"
            sub={mobileIsDark ? 'Dark theme' : 'Light theme'}
            icon={mobileIsDark
              ? <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              : <><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></>}
            right={<span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mpm-purple-accent)' }}>Đổi</span>}
            onClick={toggleMobileTheme}
          />
        </div>

        <div style={{ marginBottom: 18 }}>{securityCard}</div>

        <div style={{ background: 'var(--mpm-panel)', border: '1px solid var(--mpm-border)', borderRadius: 14, overflow: 'hidden' }}>
          <SettingsRow
            label="Đăng xuất"
            danger
            icon={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>}
            onClick={handleSignOut}
          />
        </div>
      </div>

      {/* ══════════════════════ DESKTOP ══════════════════════ */}
      <div className="hidden lg:block" style={{ minHeight: '100vh', background: 'var(--c-page)', color: 'var(--c-text)', padding: 24 }}>
        <h1 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--c-text)' }}>Settings</h1>
        <div style={{ maxWidth: 420 }}>{securityCard}</div>
      </div>
    </>
  )
}

function SettingsRow({ icon, label, sub, right, danger, onClick }: {
  icon: React.ReactNode; label: string; sub?: string; right?: React.ReactNode; danger?: boolean; onClick?: () => void
}) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 text-left" style={{ padding: '13px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--mpm-border)' }}>
      <span className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center shrink-0" style={{ background: 'var(--mpm-input)', color: danger ? 'var(--mpm-error)' : 'var(--mpm-text)' }}>
        <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 14.5, fontWeight: 500, color: danger ? 'var(--mpm-error)' : 'var(--mpm-text)' }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--mpm-muted)' }}>{sub}</div>}
      </div>
      {right}
    </button>
  )
}
