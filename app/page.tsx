'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, isSupabaseConfigured } from '@/app/lib/supabase'
import { isOnboardingComplete } from '@/app/lib/onboarding'
import DashboardPreviewBackground from '@/app/components/DashboardPreviewBackground'

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

/**
 * Standalone (installed PWA) login screen — full-bleed, no blurred backdrop
 * needed since it's already a focused single-purpose window.
 */
function StandaloneLoginScreen({ googleState, onSignIn, error }: { googleState: GoogleState; onSignIn: () => void; error?: string }) {
  const g = googleState
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', background: 'var(--lp-bg)', color: 'var(--lp-text)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" style={{ width: 72, height: 72, borderRadius: 20, boxShadow: 'var(--glow-primary)' }} />
      <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.01em', marginTop: 22 }}>Miron<span style={{ color: '#8487F5' }}>Pay</span></h1>
      <p style={{ fontSize: 14.5, color: 'var(--lp-muted)', marginTop: 8, maxWidth: 260, lineHeight: 1.55 }}>
        No seed phrase, no password. Just your Google account.
      </p>

      {error && (
        <p style={{ marginTop: 18, fontSize: 12.5, color: '#fb6f84', background: 'rgba(251,111,132,.10)', border: '1px solid rgba(251,111,132,.25)', borderRadius: 10, padding: '9px 12px', maxWidth: 300 }}>
          {error}
        </p>
      )}

      <button
        onClick={onSignIn}
        disabled={g !== 'idle'}
        className="mp-btn-bounce"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11,
          height: 54, width: '100%', maxWidth: 320, marginTop: 28, padding: '0 20px', borderRadius: 9999,
          border: g === 'idle' ? '1px solid rgba(0,0,0,.12)' : 'none',
          fontSize: 15.5, fontWeight: 600, cursor: g === 'idle' ? 'pointer' : 'default',
          color: g === 'idle' ? '#141221' : '#fff',
          background: g === 'idle' ? '#fff' : 'var(--grad-primary)',
          boxShadow: g === 'idle' ? '0 1px 3px rgba(0,0,0,.12)' : 'var(--glow-primary)',
        }}
      >
        {g === 'idle' && <><IcGoogle size={20} />Launch App</>}
        {g === 'busy' && <><IcSpinner />Connecting…</>}
        {g === 'done' && <><IcCheckWhite />Opening your wallet…</>}
      </button>

      <p style={{ fontSize: 11.5, color: 'var(--lp-muted2)', marginTop: 26, maxWidth: 280, lineHeight: 1.5 }}>
        By continuing you agree to MironPay&apos;s Terms & Privacy Policy.
      </p>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const [googleState, setGoogleState] = useState<GoogleState>('idle')
  const [googleError, setGoogleError] = useState('')
  const [isStandalone, setIsStandalone] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)

  // Detect standalone (installed PWA) launch — matchMedia covers Android/
  // desktop installs, navigator.standalone covers iOS Safari's older API.
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true
    setIsStandalone(standalone)

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

  if (isStandalone) {
    if (checkingSession) {
      return <div style={{ minHeight: '100vh', background: 'var(--lp-bg)' }} />
    }
    return <StandaloneLoginScreen googleState={googleState} onSignIn={handleSignIn} error={googleError} />
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden' }}>
      <div style={{ filter: 'blur(5.6px)', transform: 'scale(1.05)', pointerEvents: 'none', userSelect: 'none' }}>
        <DashboardPreviewBackground />
      </div>

      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 22, padding: 24, textAlign: 'center',
        background: 'radial-gradient(circle at 50% 45%, rgba(10,10,20,0.35), rgba(10,10,20,0.65))',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="MironPay" style={{ width: 84, height: 84, borderRadius: 22, boxShadow: 'var(--glow-primary)' }} />
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.01em', color: '#fff' }}>Miron<span style={{ color: '#8487F5' }}>Pay</span></h1>

        {googleError && (
          <p style={{ fontSize: 12.5, color: '#fb6f84', background: 'rgba(251,111,132,.10)', border: '1px solid rgba(251,111,132,.25)', borderRadius: 10, padding: '9px 12px', maxWidth: 300 }}>
            {googleError}
          </p>
        )}

        <button
          onClick={handleLaunch}
          disabled={!hasSession && googleState !== 'idle'}
          className="mp-btn-bounce"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11,
            height: 56, minWidth: 220, padding: '0 28px', borderRadius: 9999,
            border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer',
            color: '#fff', background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)',
          }}
        >
          {hasSession && <>Launch App</>}
          {!hasSession && googleState === 'idle' && <><IcGoogle size={20} />Launch App</>}
          {!hasSession && googleState === 'busy' && <><IcSpinner />Connecting…</>}
          {!hasSession && googleState === 'done' && <><IcCheckWhite />Opening your wallet…</>}
        </button>
      </div>
    </div>
  )
}
