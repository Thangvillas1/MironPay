'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { useAuthStore } from '@/app/store/auth'
import AuthShell from '@/app/components/AuthShell'

// An account only "exists" once wallets are created (last onboarding step).
// If a user dropped off before that — even if they'd already picked a
// username — treat them as brand new and restart onboarding from scratch,
// rather than resuming mid-flow with a half-created profile.
async function resolvePostLoginRoute(userId: string): Promise<'/dashboard' | '/onboarding/username'> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, pin_hash, wallet_address')
    .eq('id', userId)
    .single()

  const isComplete = !!(profile?.username && profile?.pin_hash && profile?.wallet_address)
  return isComplete ? '/dashboard' : '/onboarding/username'
}

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setUser = useAuthStore((s) => s.setUser)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    async function handleCallback() {
      // OAuth errors arrive as ?error=...&error_description=...
      const errorParam = searchParams.get('error')
      if (errorParam) {
        const desc = searchParams.get('error_description') ?? errorParam
        setErrorMessage(desc.replace(/\+/g, ' '))
        return
      }

      const code = searchParams.get('code')

      if (!code) {
        // No code — check if session already exists (e.g. user navigated here directly)
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          setUser(data.session.user)
          router.replace(await resolvePostLoginRoute(data.session.user.id))
        } else {
          setErrorMessage('No authorization code received. Please try signing in again.')
        }
        return
      }

      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setUser(data.session.user)
      router.replace(await resolvePostLoginRoute(data.session.user.id))
    }

    handleCallback()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (errorMessage) {
    return (
      <div className="text-center">
        <span
          className="inline-flex items-center justify-center"
          style={{
            width: 60,
            height: 60,
            borderRadius: 17,
            background: 'linear-gradient(135deg,#ff5d6c,#e11d48)',
            color: '#fff',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </span>
        <h1 style={{ fontSize: 21, fontWeight: 700, color: 'var(--lp-text)', marginTop: 20 }}>Sign-in failed</h1>
        <p style={{ fontSize: 13.5, color: 'var(--lp-muted)', marginTop: 10, lineHeight: 1.55 }}>
          We couldn&apos;t complete your Google sign-in. This is usually temporary — please try again.
        </p>
        <button
          type="button"
          onClick={() => router.replace('/')}
          className="mp-btn-ghost w-full"
          style={{
            marginTop: 22,
            height: 48,
            borderRadius: 13,
            border: '1px solid var(--c-border-strong)',
            background: 'var(--c-input)',
            color: 'var(--lp-text)',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Back to sign in
        </button>
      </div>
    )
  }

  return (
    <div className="text-center">
      <div className="relative inline-flex items-center justify-center" style={{ width: 76, height: 76 }}>
        <span
          className="mp-spinner absolute inset-0 rounded-full"
          style={{ border: '3px solid var(--c-border)', borderTopColor: '#818cf8' }}
        />
        <span
          className="inline-flex items-center justify-center"
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'var(--grad-primary)',
            boxShadow: 'var(--glow-primary)',
            color: '#fff',
            fontWeight: 800,
            fontSize: 22,
          }}
        >
          M
        </span>
      </div>
      <h1 style={{ fontSize: 21, fontWeight: 700, color: 'var(--lp-text)', marginTop: 22 }}>Signing you in…</h1>
      <p style={{ fontSize: 13.5, color: 'var(--lp-muted)', marginTop: 8 }}>
        Confirming your Google account and preparing your wallet.
      </p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <AuthShell step="callback" cardWidth={440} cardPadding={44}>
      <Suspense
        fallback={
          <div className="text-center" style={{ color: 'var(--lp-muted)', fontSize: 13.5 }}>
            Loading…
          </div>
        }
      >
        <CallbackHandler />
      </Suspense>
    </AuthShell>
  )
}
