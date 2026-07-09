'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'

const NUMPAD: (string | null)[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [null, '0', '⌫'],
]

function PinDots({ filled }: { filled: number }) {
  return (
    <div className="flex gap-4 justify-center my-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`w-4 h-4 rounded-full border-2 transition-all ${
            i < filled ? 'bg-mp-primary border-mp-primary' : 'bg-transparent border-white/20'
          }`}
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      if (!username) router.replace('/onboarding/username')
    })
  }, [router, username])

  async function handlePinComplete(pin: string) {
    if (phase === 'entering') {
      firstPinRef.current = pin
      setCurrentPin('')
      setPhase('confirming')
      return
    }

    if (pin !== firstPinRef.current) {
      setError('PIN did not match. Try again.')
      firstPinRef.current = ''
      setCurrentPin('')
      setPhase('entering')
      return
    }

    setPhase('saving')
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
      setError(setPinError ?? 'Could not save PIN. Try again.')
      firstPinRef.current = ''
      setCurrentPin('')
      setPhase('entering')
      return
    }

    const walletRes = await fetch('/api/create-wallet', { method: 'POST' })
    if (!walletRes.ok) {
      const { error } = await walletRes.json()
      setError(error ?? 'Could not create wallet. Try again.')
      firstPinRef.current = ''
      setCurrentPin('')
      setPhase('entering')
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
      setError((walletDbError ?? walletRowError)!.message)
      firstPinRef.current = ''
      setCurrentPin('')
      setPhase('entering')
      return
    }

    router.replace('/dashboard')
  }

  function handleKey(key: string) {
    if (phase === 'saving') return
    if (key === '⌫') { setCurrentPin((p) => p.slice(0, -1)); setError(''); return }
    const next = currentPin + key
    setCurrentPin(next)
    if (next.length === 6) handlePinComplete(next)
  }

  const heading =
    phase === 'entering' ? 'Enter a 6-digit PIN' :
    phase === 'confirming' ? 'Confirm your PIN' :
    'Setting up...'

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="w-14 h-14 bg-mp-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-mp-text">{heading}</h1>
        <p className="text-mp-muted text-sm mt-1">
          {phase === 'entering' && 'This PIN protects your account'}
          {phase === 'confirming' && 'Enter it again to confirm'}
          {phase === 'saving' && 'Creating your wallet and saving your info...'}
        </p>
      </div>

      <div className="bg-mp-card border border-white/8 rounded-[12px] p-6 text-center">
        <PinDots filled={currentPin.length} />

        {error && <p className="text-xs text-mp-danger mb-4">{error}</p>}

        <div className="grid grid-cols-3 gap-3">
          {NUMPAD.flat().map((key, i) => {
            if (key === null) return <div key={i} />
            return (
              <button
                key={key + i}
                type="button"
                onClick={() => handleKey(key)}
                disabled={phase === 'saving'}
                className="h-14 rounded-[10px] text-lg font-medium bg-white/5 border border-white/8 text-mp-text hover:bg-white/10 active:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed select-none transition-colors"
              >
                {key}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function SetupPinPage() {
  return (
    <Suspense fallback={<p className="text-sm text-mp-muted">Loading...</p>}>
      <SetupPinContent />
    </Suspense>
  )
}
