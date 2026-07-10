'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, isSupabaseConfigured } from '@/app/lib/supabase'
import { useAuthStore } from '@/app/store/auth'
import AuthShell from '@/app/components/AuthShell'

type GoogleState = 'idle' | 'busy' | 'done'

const TRUST_BADGES = [
  { label: 'No seed phrase' },
  { label: 'Non-custodial' },
  { label: 'PIN-protected' },
]

function ShieldIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--lp-success)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)
  const [google, setGoogle] = useState<GoogleState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUser(data.session.user)
        router.replace('/dashboard')
      }
    })
  }, [router, setUser])

  async function handleGoogleLogin() {
    if (!isSupabaseConfigured) {
      setErrorMessage('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local')
      return
    }

    setGoogle('busy')
    setErrorMessage('')

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      })

      if (error) { setGoogle('idle'); setErrorMessage(error.message); return }
      if (!data.url) { setGoogle('idle'); setErrorMessage('Could not get the OAuth URL from Supabase.'); return }

      setGoogle('done')
      setTimeout(() => { window.location.href = data.url }, 650)
    } catch (err) {
      setGoogle('idle')
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <AuthShell step="login" cardWidth={460} cardPadding={40}>
      <div className="text-center">
        <span
          className="inline-flex items-center justify-center"
          style={{
            width: 60,
            height: 60,
            borderRadius: 17,
            background: 'var(--grad-primary)',
            boxShadow: 'var(--glow-primary)',
            color: '#fff',
            fontWeight: 800,
            fontSize: 30,
          }}
        >
          M
        </span>

        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--lp-text)', marginTop: 20 }}>
          Welcome to MironPay 👋
        </h1>

        <p
          style={{
            fontSize: 14,
            color: 'var(--lp-muted)',
            lineHeight: 1.55,
            maxWidth: 320,
            margin: '10px auto 0',
          }}
        >
          Sign in to your wallet in one tap. No seed phrase, no password — just your Google account.
        </p>

        {errorMessage && (
          <p
            className="text-left"
            style={{
              marginTop: 18,
              fontSize: 13,
              color: 'var(--c-error, #fb6f84)',
              background: 'rgba(251,111,132,.10)',
              border: '1px solid rgba(251,111,132,.25)',
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            {errorMessage}
          </p>
        )}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={google !== 'idle'}
          className="mp-btn w-full flex items-center justify-center gap-2.5"
          style={{
            marginTop: 24,
            height: 52,
            borderRadius: 13,
            background: google === 'done' ? 'linear-gradient(135deg,#2dd4a4,#22c6e0)' : 'var(--grad-primary)',
            boxShadow: google === 'done' ? '0 8px 30px rgba(45,212,164,.42)' : 'var(--glow-primary)',
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            cursor: google === 'idle' ? 'pointer' : 'default',
          }}
        >
          {google === 'idle' && (
            <>
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </>
          )}
          {google === 'busy' && (
            <>
              <span className="mp-spinner" style={{ width: 16, height: 16, borderRadius: '50%', border: '2.2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', display: 'inline-block' }} />
              Connecting…
            </>
          )}
          {google === 'done' && (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
              Opening your wallet…
            </>
          )}
        </button>

        <div className="flex items-center justify-center flex-wrap" style={{ marginTop: 22, gap: 18 }}>
          {TRUST_BADGES.map((b) => (
            <div key={b.label} className="flex items-center gap-1.5">
              <ShieldIcon />
              <span style={{ fontSize: 11.5, color: 'var(--lp-muted)' }}>{b.label}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--c-border)' }}>
          <p style={{ fontSize: 11.5, color: 'var(--lp-muted2)' }}>
            By continuing you agree to MironPay&apos;s{' '}
            <a href="/terms" style={{ color: '#818cf8' }}>Terms</a> &{' '}
            <a href="/privacy" style={{ color: '#818cf8' }}>Privacy Policy</a>.
          </p>
        </div>
      </div>
    </AuthShell>
  )
}
