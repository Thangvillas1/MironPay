'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { validateUsernameFormat } from '@/app/lib/username'
import AuthShell from '@/app/components/AuthShell'
import OnboardingProgress from '@/app/components/OnboardingProgress'

type ValidationStatus = 'idle' | 'validating' | 'invalid' | 'taken' | 'available'

function StatusIcon({ status }: { status: ValidationStatus }) {
  if (status === 'validating') {
    return <span className="mp-spinner" style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid var(--c-border)', borderTopColor: '#818cf8', display: 'inline-block' }} />
  }
  if (status === 'available') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--lp-success)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 13l4 4L19 7" />
      </svg>
    )
  }
  if (status === 'invalid' || status === 'taken') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-error, #fb6f84)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    )
  }
  return null
}

function UsernameContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [username, setUsername] = useState(() => (searchParams.get('username') ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))
  const [status, setStatus] = useState<ValidationStatus>('idle')
  const [reason, setReason] = useState('')

  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace('/'); return }
      setUserId(data.session.user.id)
    })
  }, [router])

  useEffect(() => {
    if (!username) { setStatus('idle'); setReason(''); return }

    const formatError = validateUsernameFormat(username)
    if (formatError) { setStatus('invalid'); setReason(formatError); return }

    setStatus('validating')
    const timer = setTimeout(async () => {
      // Exclude the current user's own row — restarting onboarding after a
      // failed wallet-creation attempt should let them re-pick the same handle.
      const { data } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle()
      setStatus(!data || data.id === userId ? 'available' : 'taken')
    }, 500)

    return () => clearTimeout(timer)
  }, [username, userId])

  function handleInput(value: string) {
    setUsername(value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))
  }

  function handleContinue() {
    if (status !== 'available') return
    router.push(`/onboarding/confirm-username?username=${encodeURIComponent(username)}`)
  }

  const borderColor =
    status === 'invalid' || status === 'taken' ? 'var(--c-error, #fb6f84)' :
    status === 'available' ? 'var(--lp-success)' :
    status === 'validating' ? '#818cf8' :
    'var(--c-border)'

  const helperText =
    status === 'validating' ? 'Checking…' :
    status === 'invalid' ? reason :
    status === 'taken' ? `@${username} is already taken` :
    status === 'available' ? `@${username} is available` :
    '3–20 characters: lowercase letters, numbers, underscores.'

  const helperColor =
    status === 'invalid' || status === 'taken' ? 'var(--c-error, #fb6f84)' :
    status === 'available' ? 'var(--lp-success)' :
    'var(--lp-muted)'

  return (
    <AuthShell step="username" cardWidth={460} cardPadding={36}>
      <OnboardingProgress index={0} />

      <span
        className="inline-flex items-center justify-center"
        style={{
          width: 52,
          height: 52,
          borderRadius: 15,
          background: 'var(--grad-primary)',
          boxShadow: 'var(--glow-primary)',
          marginTop: 26,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
        </svg>
      </span>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--lp-text)', marginTop: 18 }}>Choose your username</h1>
      <p style={{ fontSize: 14, color: 'var(--lp-muted)', marginTop: 6 }}>
        This is how friends find and pay you on MironPay.
      </p>

      <div
        className="flex items-center"
        style={{
          marginTop: 22,
          height: 54,
          borderRadius: 14,
          background: 'var(--c-input)',
          border: `1.5px solid ${borderColor}`,
          padding: '0 16px',
          transition: 'border-color 180ms',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 17, color: 'var(--lp-muted2)' }}>@</span>
        <input
          type="text"
          value={username}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="username"
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="flex-1 bg-transparent outline-none min-w-0"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 17, color: 'var(--lp-text)', padding: '0 8px' }}
        />
        <StatusIcon status={status} />
      </div>

      <div style={{ height: 20, marginTop: 8 }}>
        <p style={{ fontSize: 12.5, color: helperColor }}>{helperText}</p>
      </div>

      <button
        type="button"
        onClick={handleContinue}
        disabled={status !== 'available'}
        className="mp-btn w-full"
        style={{
          marginTop: 14,
          height: 52,
          borderRadius: 14,
          background: status === 'available' ? 'var(--grad-primary)' : 'var(--c-input)',
          boxShadow: status === 'available' ? 'var(--glow-primary)' : 'none',
          color: status === 'available' ? '#fff' : 'var(--lp-muted2)',
          fontSize: 15,
          fontWeight: 600,
          cursor: status === 'available' ? 'pointer' : 'not-allowed',
        }}
      >
        Continue
      </button>
    </AuthShell>
  )
}

export default function UsernamePage() {
  return (
    <Suspense fallback={null}>
      <UsernameContent />
    </Suspense>
  )
}
