'use client'

import { useState } from 'react'
import { startPinRecovery } from '@/app/lib/pin-recovery-client'

type Step = 'new' | 'confirm' | 'saving' | 'success'

export default function PinResetModal({
  accessToken,
  onClose,
  onComplete,
}: {
  accessToken: string
  onClose: () => void
  onComplete: () => void
}) {
  const [step, setStep] = useState<Step>('new')
  const [pin, setPin] = useState('')
  const [firstPin, setFirstPin] = useState('')
  const [error, setError] = useState('')
  const [reauthLoading, setReauthLoading] = useState(false)

  function press(key: string) {
    if (step === 'saving' || step === 'success') return
    setError('')
    setPin(current => key === 'backspace' ? current.slice(0, -1) : current.length < 6 ? current + key : current)
  }

  async function continueReset() {
    if (pin.length !== 6) return
    if (step === 'new') {
      setFirstPin(pin)
      setPin('')
      setStep('confirm')
      return
    }
    if (pin !== firstPin) {
      setError('PINs do not match. Enter a new PIN again.')
      setFirstPin('')
      setPin('')
      setStep('new')
      return
    }

    setStep('saving')
    try {
      const response = await fetch('/api/auth/pin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ pin }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error ?? 'Could not reset PIN. Please try again.')
        setPin('')
        setFirstPin('')
        setStep('new')
        return
      }
      setStep('success')
      onComplete()
    } catch {
      setError('Connection error. Please try again.')
      setPin('')
      setFirstPin('')
      setStep('new')
    }
  }

  async function verifyAgain() {
    setReauthLoading(true)
    setError('')
    try {
      await startPinRecovery()
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : 'Could not open Google verification.')
      setReauthLoading(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(6,4,16,.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: 380, minHeight: 520, borderRadius: 20, padding: 24, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.12)', color: 'var(--c-text)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 700 }}>{step === 'success' ? 'PIN reset complete' : 'Reset PIN'}</h2>
            <p style={{ marginTop: 4, fontSize: 12.5, color: 'var(--c-muted)' }}>
              {step === 'new' ? 'Create a new 6-digit PIN.' : step === 'confirm' ? 'Enter the new PIN again.' : step === 'saving' ? 'Saving your new PIN…' : 'Your new PIN is ready to use.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.1)', background: 'transparent', color: 'var(--c-muted)', cursor: 'pointer' }}>×</button>
        </div>

        {step === 'success' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'rgba(45,212,191,.12)', border: '1px solid rgba(45,212,191,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2dd4bf', fontSize: 34 }}>✓</div>
            <p style={{ marginTop: 18, fontSize: 13, color: 'var(--c-muted)' }}>Failed-attempt locks were cleared. Use your new PIN for Main Wallet transactions.</p>
            <button onClick={onClose} style={{ width: '100%', height: 48, marginTop: 24, border: 'none', borderRadius: 13, background: 'linear-gradient(135deg,#818cf8,#6366f1 52%,#4338ca)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '28px 0 10px' }}>
              {Array.from({ length: 6 }, (_, index) => (
                <span key={index} style={{ width: 14, height: 14, borderRadius: '50%', background: index < pin.length ? '#6366f1' : 'rgba(var(--c-fg-rgb),.05)', border: index < pin.length ? '1px solid #818cf8' : '1px solid rgba(var(--c-fg-rgb),.16)' }} />
              ))}
            </div>
            <div style={{ minHeight: 38, textAlign: 'center', fontSize: 12, color: '#fb6f84', padding: '6px 0' }}>{error}</div>
            <div style={{ position: 'relative', minHeight: 250 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, opacity: step === 'saving' ? .35 : 1, pointerEvents: step === 'saving' ? 'none' : 'auto' }}>
                {['1','2','3','4','5','6','7','8','9','','0','backspace'].map((key, index) => key === '' ? <span key={index} /> : (
                  <button key={key} onClick={() => press(key)} style={{ height: 52, borderRadius: 13, border: '1px solid rgba(var(--c-fg-rgb),.09)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: key === 'backspace' ? 18 : 21, fontWeight: 600, cursor: 'pointer' }}>
                    {key === 'backspace' ? '⌫' : key}
                  </button>
                ))}
              </div>
              {step === 'saving' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="mp-spinner" style={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid rgba(99,102,241,.25)', borderTopColor: '#818cf8' }} /></div>}
            </div>
            <button onClick={continueReset} disabled={pin.length !== 6 || step === 'saving'} style={{ width: '100%', height: 48, marginTop: 14, border: 'none', borderRadius: 13, background: pin.length === 6 ? 'linear-gradient(135deg,#818cf8,#6366f1 52%,#4338ca)' : 'rgba(var(--c-fg-rgb),.07)', color: pin.length === 6 ? '#fff' : 'var(--c-muted2)', fontWeight: 600, cursor: pin.length === 6 ? 'pointer' : 'not-allowed' }}>
              {step === 'confirm' ? 'Reset PIN' : 'Continue'}
            </button>
            {error.includes('Google') && <button onClick={verifyAgain} disabled={reauthLoading} style={{ marginTop: 10, border: 'none', background: 'transparent', color: '#818cf8', fontSize: 12.5, cursor: 'pointer' }}>{reauthLoading ? 'Opening Google…' : 'Verify with Google'}</button>}
          </>
        )}
      </div>
    </div>
  )
}
