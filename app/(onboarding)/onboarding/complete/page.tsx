'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import AuthShell from '@/app/components/AuthShell'

function truncate(address: string) {
  if (!address || address.length < 12) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function WalletRow({ kind, address }: { kind: 'main' | 'agent'; address: string }) {
  const isMain = kind === 'main'
  return (
    <div
      className="flex items-center"
      style={{ padding: '12px 14px', borderRadius: 13, background: 'var(--c-panel)', border: '1px solid var(--c-border)', gap: 12 }}
    >
      <span
        className="flex items-center justify-center shrink-0"
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: isMain ? 'linear-gradient(135deg,#60a5fa,#2563eb)' : 'linear-gradient(135deg,#a78bfa,#6d28d9)',
          color: '#fff',
        }}
      >
        {isMain ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12V7H5a2 2 0 010-4h14v4" />
            <path d="M3 5v14a2 2 0 002 2h16v-5" />
            <path d="M18 12a2 2 0 000 4h4v-4z" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="12" cy="5" r="2" />
            <path d="M12 7v4" />
            <line x1="8" y1="16" x2="8" y2="16" />
            <line x1="16" y1="16" x2="16" y2="16" />
          </svg>
        )}
      </span>
      <div className="flex-1 min-w-0 text-left">
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>{isMain ? 'Main Wallet' : 'Agent Wallet'}</p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--lp-muted2)' }}>{truncate(address)}</p>
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--lp-success)' }}>Created</span>
    </div>
  )
}

function CompleteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const username = searchParams.get('username') ?? ''
  const main = searchParams.get('main') ?? ''
  const agent = searchParams.get('agent') ?? ''
  const [pop, setPop] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/')
    })
    const t = setTimeout(() => setPop(true), 30)
    return () => clearTimeout(t)
  }, [router])

  if (!username) return null

  return (
    <AuthShell step="done" cardWidth={460} cardPadding={40}>
      <div className="text-center">
        <span
          className="inline-flex items-center justify-center rounded-full"
          style={{
            width: 64,
            height: 64,
            background: 'linear-gradient(135deg,#2bd4a4,#22c6e0)',
            color: '#fff',
            transform: pop ? 'scale(1)' : 'scale(.5)',
            opacity: pop ? 1 : 0,
            transition: 'transform 380ms cubic-bezier(.22,1,.36,1), opacity 300ms',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </span>

        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--lp-text)', marginTop: 20 }}>
          You&apos;re all set, @{username}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--lp-muted)', marginTop: 8 }}>
          Your PIN is saved and two on-chain wallets have been created.
        </p>

        <div className="flex flex-col" style={{ gap: 10, marginTop: 24 }}>
          <WalletRow kind="main" address={main} />
          <WalletRow kind="agent" address={agent} />
        </div>

        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="mp-btn w-full"
          style={{
            marginTop: 24,
            height: 52,
            borderRadius: 13,
            background: 'var(--grad-primary)',
            boxShadow: 'var(--glow-primary)',
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          Enter MironPay
        </button>
      </div>
    </AuthShell>
  )
}

export default function OnboardingCompletePage() {
  return (
    <Suspense fallback={null}>
      <CompleteContent />
    </Suspense>
  )
}
