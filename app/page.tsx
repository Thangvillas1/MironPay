'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, isSupabaseConfigured } from '@/app/lib/supabase'
import { isOnboardingComplete } from '@/app/lib/onboarding'

type GoogleState = 'idle' | 'busy' | 'done'

function IcGoogle({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 6.94L5.84 9.9C6.71 7.3 9.14 4.75 12 4.75Z" />
    </svg>
  )
}
function IcSpinner() {
  return (
    <span className="mp-spinner" style={{ width: 18, height: 18, borderRadius: '50%', border: '2.4px solid rgba(255,255,255,.35)', borderTopColor: '#fff', display: 'inline-block' }} />
  )
}
function IcCheckWhite({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function IcCheckSmall() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
function IcShield() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z" />
    </svg>
  )
}
function IcLock() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h16v10H4z" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

/**
 * Auth-flow login screen — glass card over the indigo/cyan radial
 * background, matching the "MironPay Auth Flow" design handoff.
 * Used for both the standalone (installed PWA) and browser entry points.
 */
function LoginScreen({ googleState, onSignIn, error }: { googleState: GoogleState; onSignIn: () => void; error?: string }) {
  const g = googleState
  return (
    <div
      style={{
        position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        overflow: 'hidden',
        background:
          'radial-gradient(760px 520px at 22% 8%, rgba(99,102,241,.34), transparent 62%),' +
          'radial-gradient(680px 520px at 84% 14%, rgba(34,198,224,.20), transparent 60%),' +
          'radial-gradient(900px 620px at 50% 108%, rgba(129,140,248,.16), transparent 62%),' +
          'var(--lp-bg)',
        color: 'var(--lp-text)',
      }}
    >
      {/* falling "Mi" coins banner — same asset as the old marketing hero */}
      <iframe
        src="/miron-banner.html"
        title=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', zIndex: 0, pointerEvents: 'none' }}
      />
      {/* scrim — dims the banner so the card reads clearly on top */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'var(--lp-bg)', opacity: 0.5 }} />

      <div
        style={{
          position: 'relative', zIndex: 2,
          width: '100%', maxWidth: 460, borderRadius: 22, padding: '38px 34px',
          background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 30px 80px rgba(3,8,20,.45), var(--glow-primary), inset 0 1px 0 var(--glass-hi)',
          textAlign: 'center',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="MironPay" style={{ width: 60, height: 60, borderRadius: 17, margin: '0 auto', display: 'block', boxShadow: 'var(--glow-primary)' }} />
        <h1 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '20px 0 0', fontSize: 24, fontWeight: 700, letterSpacing: '-.01em' }}>
          Welcome to MironPay <span>👋</span>
        </h1>
        <p style={{ margin: '8px auto 0', fontSize: 14, lineHeight: 1.55, color: 'var(--lp-muted)', maxWidth: 320 }}>
          Sign in to your wallet in one tap. No seed phrase, no password — just your Google account.
        </p>

        {error && (
          <p style={{ marginTop: 18, fontSize: 12.5, color: '#fb6f84', background: 'rgba(251,111,132,.10)', border: '1px solid rgba(251,111,132,.25)', borderRadius: 10, padding: '9px 12px' }}>
            {error}
          </p>
        )}

        <button
          onClick={onSignIn}
          disabled={g !== 'idle'}
          className="mp-btn-bounce"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11,
            width: '100%', height: 52, marginTop: 24, borderRadius: 13, border: 'none',
            fontSize: 15, fontWeight: 600, cursor: g === 'idle' ? 'pointer' : 'default',
            color: '#fff',
            background: g === 'done' ? 'linear-gradient(135deg,#2dd4bf,#0d9488)' : 'var(--grad-primary)',
            boxShadow: 'var(--glow-primary)',
          }}
        >
          {g === 'idle' && <><IcGoogle size={20} />Continue with Google</>}
          {g === 'busy' && <><IcSpinner />Connecting…</>}
          {g === 'done' && <><IcCheckWhite />Opening your wallet…</>}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 22, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--lp-muted)' }}>
            <span style={{ color: 'var(--lp-success)', display: 'flex' }}><IcCheckSmall /></span>No seed phrase
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--lp-muted)' }}>
            <span style={{ color: 'var(--lp-success)', display: 'flex' }}><IcShield /></span>Custodial (Circle)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--lp-muted)' }}>
            <span style={{ color: 'var(--lp-success)', display: 'flex' }}><IcLock /></span>PIN-protected
          </span>
        </div>

        <p style={{ margin: '24px auto 0', paddingTop: 18, borderTop: '1px solid var(--c-border)', fontSize: 11.5, lineHeight: 1.5, color: 'var(--lp-muted2)', maxWidth: 300 }}>
          By continuing you agree to MironPay&apos;s <span style={{ color: 'var(--c-primary-hover)', cursor: 'pointer' }}>Terms</span> &amp; <span style={{ color: 'var(--c-primary-hover)', cursor: 'pointer' }}>Privacy Policy</span>.
        </p>
      </div>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const [googleState, setGoogleState] = useState<GoogleState>('idle')
  const [googleError, setGoogleError] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)

  // Detect standalone (installed PWA) launch — matchMedia covers Android/
  // desktop installs, navigator.standalone covers iOS Safari's older API.
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true

    if (!isSupabaseConfigured) { setCheckingSession(false); return }

    supabase.auth.getSession().then(async ({ data }) => {
      const complete = data.session ? await isOnboardingComplete(data.session.user.id) : false
      // Standalone PWA keeps its old behavior: skip straight to the dashboard
      // for a returning, already-onboarded user — no extra tap needed.
      if (standalone && complete) {
        router.replace('/dashboard')
        return
      }
      setHasSession(!!data.session && complete)
      setCheckingSession(false)
    })
  }, [router])

  const handleSignIn = async () => {
    if (googleState !== 'idle') return
    setGoogleError('')

    if (!isSupabaseConfigured) {
      setGoogleError('Supabase is not configured.')
      return
    }

    setGoogleState('busy')

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      })

      if (error) { setGoogleState('idle'); setGoogleError(error.message); return }
      if (!data.url) { setGoogleState('idle'); setGoogleError('Could not get OAuth URL from Supabase.'); return }

      setGoogleState('done')
      window.location.href = data.url
    } catch (err) {
      setGoogleState('idle')
      setGoogleError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  // Existing, already-signed-in user: go straight into the app, no
  // OAuth round-trip needed. Everyone else (new visitor, or a logged-out
  // returning user) goes through the normal Google sign-in flow, which
  // doubles as sign-up — same handler MironPay has always used for both.
  const handleLaunch = () => {
    if (hasSession) {
      router.push('/dashboard')
      return
    }
    handleSignIn()
  }

  if (checkingSession) {
    return <div style={{ minHeight: '100vh', background: 'var(--lp-bg)' }} />
  }

  return <LoginScreen googleState={googleState} onSignIn={handleLaunch} error={googleError} />
}
