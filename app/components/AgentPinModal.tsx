'use client'

import { useRef, useState } from 'react'
import { startPinRecovery } from '@/app/lib/pin-recovery-client'

export function AgentPinModal({ onSuccess, onCancel, title = 'Confirm PIN', description = 'Enter PIN to confirm transaction from Main Wallet' }: { onSuccess: (pin: string) => void; onCancel: () => void; title?: string; description?: string }) {
  const pinRef = useRef('')
  const submittedRef = useRef(false)
  const [dots, setDots] = useState(0)
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')

  function handleKey(key: string) {
    if (submittedRef.current || recoveryLoading) return
    if (key === '⌫') {
      pinRef.current = pinRef.current.slice(0, -1)
      setDots(pinRef.current.length)
      return
    }
    if (pinRef.current.length >= 6) return
    pinRef.current += key
    setDots(pinRef.current.length)
    if (pinRef.current.length === 6) {
      submittedRef.current = true
      const pin = pinRef.current
      pinRef.current = ''
      setDots(0)
      onSuccess(pin)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-mp-card border border-white/8 rounded-[16px] w-full max-w-xs p-6 flex flex-col items-center gap-4">
        <div className="w-10 h-10 bg-amber-400/15 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><rect x="3" y="11" width="18" height="11" rx="2"/><path strokeLinecap="round" d="M7 11V7a5 5 0 0110 0v4"/></svg>
        </div>
        <div className="text-center">
          <h2 className="text-base font-semibold text-mp-text">{title}</h2>
          <p className="text-xs text-mp-muted mt-1">{description}</p>
        </div>
        <div className="flex gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`w-3 h-3 rounded-full border-2 transition-all ${i < dots ? 'bg-amber-400 border-amber-400' : 'bg-transparent border-white/25'}`} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 w-full">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => k === '' ? (
            <div key={i} />
          ) : (
            <button key={k + i} onClick={() => handleKey(k)}
              className="h-13 py-3 rounded-[10px] text-base font-medium bg-white/5 border border-white/8 text-mp-text hover:bg-white/10 active:bg-white/15 transition-colors select-none">
              {k}
            </button>
          ))}
        </div>
        {recoveryError && <p className="text-xs text-red-400 text-center">{recoveryError}</p>}
        <button onClick={() => {
          setRecoveryLoading(true)
          setRecoveryError('')
          void startPinRecovery().catch(error => {
            setRecoveryError(error instanceof Error ? error.message : 'Could not open Google verification.')
            setRecoveryLoading(false)
          })
        }} disabled={recoveryLoading} className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
          {recoveryLoading ? 'Opening Google…' : 'Forgot PIN?'}
        </button>
        <button onClick={onCancel} className="text-sm text-mp-muted hover:text-mp-text transition-colors">Cancel</button>
      </div>
    </div>
  )
}
