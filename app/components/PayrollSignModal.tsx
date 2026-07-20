'use client'

import { useState } from 'react'
import { supabase } from '@/app/lib/supabase'
import { AgentPinModal } from '@/app/components/AgentPinModal'

type Step = 'confirm' | 'pin' | 'progress' | 'success' | 'error'

interface Props {
  runId: string
  period: string
  employeeCount: number
  totalAmount: number
  onClose: () => void
  onApproved: () => void
}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
}

export default function PayrollSignModal({ runId, period, employeeCount, totalAmount, onClose, onApproved }: Props) {
  const [step, setStep] = useState<Step>('confirm')
  const [showDetail, setShowDetail] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handlePin(pin: string) {
    setStep('progress')
    const res = await fetch(`/api/payroll/runs/${runId}/approve`, {
      method: 'POST',
      headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    const data = await res.json()
    if (!res.ok) {
      setErrorMsg(data.error ?? 'Approval failed')
      setStep('error')
      return
    }
    setStep('success')
  }

  if (step === 'pin') {
    return <AgentPinModal onSuccess={handlePin} onCancel={() => setStep('confirm')} />
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ width: 440, borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.1)', padding: 22, color: 'var(--c-text)' }}>
        {step === 'confirm' && (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Approve &amp; Sign — {period}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, marginBottom: 16 }}>
              <Row label="Employees" value={String(employeeCount)} />
              <Row label="Total amount" value={`${totalAmount.toFixed(2)} USDC`} />
              <Row label="Est. network fee" value="< 0.50 USDC" />
            </div>
            <button onClick={() => setShowDetail(v => !v)} style={{ fontSize: 12, color: 'var(--c-muted2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: showDetail ? 12 : 18 }}>
              {showDetail ? '▾ Hide details' : '▸ Show details'}
            </button>
            {showDetail && (
              <p style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 18 }}>
                Wallet addresses and amounts will be frozen the moment you sign. Later edits to an employee&apos;s wallet will not affect this run.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-muted)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => setStep('pin')} style={{ height: 36, padding: '0 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Approve &amp; Sign
              </button>
            </div>
          </>
        )}

        {step === 'progress' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 32, height: 32, margin: '0 auto 14px', borderRadius: '50%', border: '2px solid #6366f1', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: 13, color: 'var(--c-muted)' }}>Signing…</p>
          </div>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>✅ Run approved &amp; frozen</p>
            <button onClick={onApproved} style={{ height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Continue
            </button>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--c-muted2)' }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{value}</span>
    </div>
  )
}
