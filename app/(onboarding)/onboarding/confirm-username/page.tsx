'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import AuthShell from '@/app/components/AuthShell'
import OnboardingProgress from '@/app/components/OnboardingProgress'
import VerifiedBadge from '@/app/components/VerifiedBadge'

function ConfirmUsernameContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const username = searchParams.get('username') ?? ''

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      if (!username) router.replace('/onboarding/username')
    })
  }, [router, username])

  if (!username) return null

  return (
    <AuthShell step="confirm" cardWidth={460} cardPadding={36}>
      <OnboardingProgress index={1} />

      <span
        className="inline-flex items-center justify-center"
        style={{
          width: 52,
          height: 52,
          borderRadius: 15,
          background: 'var(--grad-primary)',
          boxShadow: 'var(--glow-primary)',
          color: '#fff',
          marginTop: 26,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--lp-text)', marginTop: 18 }}>Confirm your username</h1>
      <p style={{ fontSize: 14, color: 'var(--lp-muted)', marginTop: 6 }}>
        Your username cannot be changed after this step.
      </p>

      <div
        className="flex flex-col items-center"
        style={{
          marginTop: 22,
          padding: '26px 20px',
          borderRadius: 18,
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'inset 0 1px 0 var(--glass-hi)',
        }}
      >
        <span
          className="flex items-center justify-center"
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--grad-primary)',
            color: '#fff',
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          {username.charAt(0).toUpperCase()}
        </span>
        <div className="flex items-center gap-2" style={{ marginTop: 14 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: 'var(--lp-text)' }}>
            @{username}
          </span>
          <VerifiedBadge size="md" />
        </div>
      </div>

      <div
        className="flex items-start gap-2.5"
        style={{
          marginTop: 20,
          padding: 12,
          borderRadius: 12,
          background: 'color-mix(in srgb, var(--c-warning) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--c-warning) 30%, transparent)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-warning)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ marginTop: 1 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p style={{ fontSize: 12.5, color: 'var(--c-warning)' }}>
          This username is permanent and cannot be changed later.
        </p>
      </div>

      <button
        type="button"
        onClick={() => router.push(`/onboarding/setup-pin?username=${encodeURIComponent(username)}`)}
        className="mp-btn w-full"
        style={{
          marginTop: 22,
          height: 52,
          borderRadius: 13,
          background: 'var(--grad-primary)',
          boxShadow: 'var(--glow-primary)',
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        Confirm username
      </button>

      <button
        type="button"
        onClick={() => router.push(`/onboarding/username?username=${encodeURIComponent(username)}`)}
        className="mp-btn-ghost w-full"
        style={{
          marginTop: 9,
          height: 46,
          borderRadius: 13,
          background: 'transparent',
          color: 'var(--lp-muted)',
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Go back
      </button>
    </AuthShell>
  )
}

export default function ConfirmUsernamePage() {
  return (
    <Suspense fallback={null}>
      <ConfirmUsernameContent />
    </Suspense>
  )
}
