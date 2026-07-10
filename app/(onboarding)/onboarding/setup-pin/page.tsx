'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import AuthShell from '@/app/components/AuthShell'
import OnboardingProgress from '@/app/components/OnboardingProgress'

const NUMPAD: (string | null)[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [null, '0', '⌫'],
]

const SAVING_STEPS = [
  'Hashing your PIN…',
  'Creating your Main Wallet…',
  'Creating your Agent Wallet…',
  'Finalizing your account…',
]

function PinDots({ filled, shake }: { filled: number; shake: boolean }) {
  return (
    <div className={`flex gap-3 justify-center ${shake ? 'mp-shake' : ''}`}>
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            transition: 'all 160ms',
            background: i < filled ? 'var(--c-primary, #6366f1)' : 'var(--c-input)',
            border: i < filled ? 'none' : '1px solid var(--c-border-strong)',
            boxShadow: i < filled ? 'var(--glow-primary)' : 'none',
          }}
        />
      ))}
    </div>
  )
}

type Phase = 'entering' | 'confirming' | 'saving'

function SetupPinContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const username = searchParams.get('username') ?? ''

  const [phase, setPhase] = useState<Phase>('entering')
  const firstPinRef = useRef('')
  const [currentPin, setCurrentPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [savingIdx, setSavingIdx] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      if (!username) router.replace('/onboarding/username')
    })
  }, [router, username])

  useEffect(() => {
    if (phase !== 'saving') return
    if (savingIdx >= SAVING_STEPS.length - 1) return
    const t = setTimeout(() => setSavingIdx((i) => i + 1), 650)
    return () => clearTimeout(t)
  }, [phase, savingIdx])

  function resetToEntering(message: string) {
    setError(message)
    setShake(true)
    setTimeout(() => setShake(false), 420)
    firstPinRef.current = ''
    setCurrentPin('')
    setSavingIdx(0)
    setPhase('entering')
  }

  async function handlePinComplete(pin: string) {
    if (phase === 'entering') {
      firstPinRef.current = pin
      setCurrentPin('')
      setPhase('confirming')
      return
    }

    if (pin !== firstPinRef.current) {
      resetToEntering('PIN did not match. Try again.')
      return
    }

    setPhase('saving')
    setSavingIdx(0)
    setError('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/login'); return }

    const setPinRes = await fetch('/api/auth/pin/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ pin, username }),
    })

    if (!setPinRes.ok) {
      const { error: setPinError } = await setPinRes.json().catch(() => ({ error: 'Could not save PIN. Try again.' }))
      resetToEntering(setPinError ?? 'Could not save PIN. Try again.')
      return
    }

    const walletRes = await fetch('/api/create-wallet', { method: 'POST' })
    if (!walletRes.ok) {
      const { error } = await walletRes.json()
      resetToEntering(error ?? 'Could not create wallet. Try again.')
      return
    }

    const { address, walletId: circleWalletId, agentAddress, agentWalletId } = await walletRes.json()
    const [{ error: walletDbError }, { error: walletRowError }] = await Promise.all([
      supabase.from('profiles').update({
        wallet_address: address,
        circle_wallet_id: circleWalletId,
        agent_wallet_address: agentAddress,
        agent_wallet_id: agentWalletId,
      }).eq('id', session.user.id),
      supabase.from('wallets').insert({ user_id: session.user.id, balance: 0, currency: 'USD' }),
    ])

    if (walletDbError || walletRowError) {
      resetToEntering((walletDbError ?? walletRowError)!.message)
      return
    }

    const params = new URLSearchParams({ username, main: address, agent: agentAddress })
    router.replace(`/onboarding/complete?${params.toString()}`)
  }

  function handleKey(key: string) {
    if (phase === 'saving') return
    if (key === '⌫') { setCurrentPin((p) => p.slice(0, -1)); setError(''); return }
    const next = currentPin + key
    setCurrentPin(next)
    if (next.length === 6) handlePinComplete(next)
  }

  if (phase === 'saving') {
    const progressPct = ((savingIdx + 1) / SAVING_STEPS.length) * 100
    return (
      <AuthShell step="pin" cardWidth={420} cardPadding={36}>
        <div className="text-center">
          <OnboardingProgress index={2} />

          <div className="relative inline-flex items-center justify-center" style={{ width: 76, height: 76, marginTop: 24 }}>
            <span className="mp-spinner absolute inset-0 rounded-full" style={{ border: '3px solid var(--c-border)', borderTopColor: '#818cf8' }} />
            <span
              className="inline-flex items-center justify-center"
              style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)', color: '#fff' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </span>
          </div>

          <h1 style={{ fontSize: 21, fontWeight: 700, color: 'var(--lp-text)', marginTop: 20 }}>Setting up your wallet</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: 'var(--lp-muted2)', marginTop: 6 }}>
            On-chain · Arc testnet
          </p>

          <div style={{ marginTop: 26, height: 6, borderRadius: 999, background: 'var(--c-input)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, borderRadius: 999, background: 'var(--grad-primary)', transition: 'width 400ms ease-out' }} />
          </div>

          <p style={{ marginTop: 14, fontSize: 14, fontWeight: 600, color: 'var(--lp-text)' }}>{SAVING_STEPS[savingIdx]}</p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell step="pin" cardWidth={420} cardPadding={36}>
      <div className="text-center">
        <OnboardingProgress index={2} />

        <span
          className="inline-flex items-center justify-center"
          style={{ width: 52, height: 52, borderRadius: 15, background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)', color: '#fff', marginTop: 24 }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </span>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--lp-text)', marginTop: 18 }}>
          {phase === 'entering' ? 'Enter a 6-digit PIN' : 'Confirm your PIN'}
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--lp-muted)', marginTop: 6 }}>
          {phase === 'entering' ? "You'll use this to authorize transfers." : 'Re-enter the same 6 digits.'}
        </p>

        <div style={{ marginTop: 22 }}>
          <PinDots filled={currentPin.length} shake={shake} />
        </div>

        <div style={{ height: 20, marginTop: 10 }}>
          {error && <p style={{ fontSize: 12.5, color: 'var(--c-error, #fb6f84)' }}>{error}</p>}
        </div>

        <div className="grid grid-cols-3" style={{ gap: 10, marginTop: 6 }}>
          {NUMPAD.flat().map((key, i) => {
            if (key === null) return <div key={i} />
            if (key === '⌫') {
              return (
                <button
                  key={key + i}
                  type="button"
                  onClick={() => handleKey(key)}
                  className="flex items-center justify-center"
                  style={{ height: 50, borderRadius: 13, background: 'transparent', color: 'var(--lp-muted)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
                    <line x1="18" y1="9" x2="12" y2="15" />
                    <line x1="12" y1="9" x2="18" y2="15" />
                  </svg>
                </button>
              )
            }
            return (
              <button
                key={key + i}
                type="button"
                onClick={() => handleKey(key)}
                className="select-none"
                style={{
                  height: 50,
                  borderRadius: 13,
                  border: '1px solid var(--c-border)',
                  background: 'var(--c-input)',
                  color: 'var(--lp-text)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 20,
                  fontWeight: 600,
                }}
              >
                {key}
              </button>
            )
          })}
        </div>
      </div>
    </AuthShell>
  )
}

export default function SetupPinPage() {
  return (
    <Suspense fallback={null}>
      <SetupPinContent />
    </Suspense>
  )
}
