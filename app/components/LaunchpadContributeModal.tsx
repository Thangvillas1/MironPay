'use client'

import { useState } from 'react'
import { supabase } from '@/app/lib/supabase'
import { AgentPinModal } from '@/app/components/AgentPinModal'

type Step = 'confirm' | 'pin' | 'progress' | 'success' | 'error'

interface Props {
  projectId: string
  projectName: string
  minContribution: number
  onClose: () => void
  onSuccess: (txHash: string | null) => void
}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
}

export default function LaunchpadContributeModal({ projectId, projectName, minContribution, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('confirm')
  const [amount, setAmount] = useState(String(minContribution || 10))
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  async function handlePin(pin: string) {
    setStep('progress')
    const res = await fetch(`/api/launchpad/sales/${projectId}/contribute`, {
      method: 'POST',
      headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, pin }),
    })
    const data = await res.json()
    if (!res.ok) {
      setErrorMsg(data.error ?? 'Contribution failed')
      setStep('error')
      return
    }
    setTxHash(data.txHash ?? null)
    setStep('success')
  }

  if (step === 'pin') {
    return <AgentPinModal onSuccess={handlePin} onCancel={() => setStep('confirm')} />
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ width: 400, borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.1)', padding: 22, color: 'var(--c-text)' }}>
        {step === 'confirm' && (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Contribute to {projectName}</h2>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted2)' }}>Amount (USDC)</label>
            <input
              value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              style={{ width: '100%', marginTop: 4, marginBottom: 16, height: 40, borderRadius: 8, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-text)', padding: '0 12px', fontSize: 15, fontFamily: 'monospace' }}
            />
            <p style={{ fontSize: 12, color: 'var(--c-muted2)', marginBottom: 18 }}>
              Paid from your Main Wallet. This sale is first-come-first-served, enforced on-chain — if it fills before your transaction confirms, the contribution reverts and nothing is charged.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-muted)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button
                disabled={!amount || parseFloat(amount) <= 0}
                onClick={() => setStep('pin')}
                style={{ height: 36, padding: '0 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Contribute
              </button>
            </div>
          </>
        )}

        {step === 'progress' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 32, height: 32, margin: '0 auto 14px', borderRadius: '50%', border: '2px solid #6366f1', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: 13, color: 'var(--c-muted)' }}>Contributing…</p>
          </div>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>✅ Contribution confirmed</p>
            {txHash && (
              <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--c-indigo-light)', textDecoration: 'none' }}>
                View on explorer ↗
              </a>
            )}
            <div style={{ marginTop: 16 }}>
              <button onClick={() => onSuccess(txHash)} style={{ height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Done
              </button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ fontSize: 13, color: '#fb6f84', marginBottom: 16 }}>{errorMsg}</p>
            <button onClick={onClose} style={{ height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-muted)', fontSize: 13, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
