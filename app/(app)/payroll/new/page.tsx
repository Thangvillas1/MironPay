'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'

interface DraftRow {
  row: number
  employee_id: string
  amount: number | null
  note: string | null
  employee_name: string | null
  wallet_address: string | null
  resolved: boolean
}

interface DraftError {
  row: number
  field: string
  message: string
}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
}

function defaultPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function NewPayrollRunPage() {
  const router = useRouter()
  const [step, setStep] = useState<'upload' | 'review'>('upload')
  const [period, setPeriod] = useState(defaultPeriod())
  const [runId, setRunId] = useState<string | null>(null)
  const [rows, setRows] = useState<DraftRow[]>([])
  const [errors, setErrors] = useState<DraftError[]>([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleFile(file: File) {
    setBusy(true)
    setErrorMsg(null)

    let currentRunId = runId
    if (!currentRunId) {
      const res = await fetch('/api/payroll/runs', {
        method: 'POST',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 && data.existingRunId) {
          router.push(`/payroll/runs/${data.existingRunId}`)
          return
        }
        setErrorMsg(data.error ?? 'Failed to create run')
        setBusy(false)
        return
      }
      currentRunId = data.run.id
      setRunId(currentRunId)
    }

    const form = new FormData()
    form.append('file', file)

    const uploadRes = await fetch(`/api/payroll/runs/${currentRunId}/upload`, {
      method: 'POST',
      headers: await authHeader(),
      body: form,
    })
    const uploadData = await uploadRes.json()
    setBusy(false)

    if (!uploadRes.ok) {
      setErrorMsg(uploadData.error ?? 'Upload failed')
      return
    }

    setRows(uploadData.items ?? [])
    setErrors(uploadData.errors ?? [])
    setTotalAmount(uploadData.run?.total_amount ?? 0)
    setStep('review')
  }

  const errorRows = new Set(errors.filter(e => e.row > 0).map(e => e.row))
  const globalErrors = errors.filter(e => e.row === 0)
  const hasErrors = errors.length > 0

  return (
    <div style={{ padding: 24, color: 'var(--c-text)', maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>New payroll run</h1>
      <p style={{ fontSize: 13, color: 'var(--c-muted2)', margin: '0 0 20px' }}>
        {step === 'upload' ? "Upload this month's amounts." : 'Review before sending for approval.'}
      </p>

      {step === 'upload' && (
        <div style={{ borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', padding: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted2)' }}>Period</label>
          <input value={period} onChange={e => setPeriod(e.target.value)} placeholder="2026-07"
            style={{ display: 'block', marginTop: 4, marginBottom: 16, height: 36, width: 160, borderRadius: 8, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-text)', padding: '0 10px', fontSize: 13 }} />

          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted2)' }}>CSV file (employee_id, amount, note)</label>
          <input type="file" disabled={busy}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            style={{ display: 'block', marginTop: 6, fontSize: 13 }} />

          {busy && <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 12 }}>Parsing…</p>}
          {errorMsg && <p style={{ fontSize: 12, color: '#fb6f84', marginTop: 12 }}>{errorMsg}</p>}
        </div>
      )}

      {step === 'review' && (
        <>
          <div style={{ borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.6fr auto', gap: 12, padding: '10px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-muted2)', borderBottom: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
              <span>Employee ID</span><span>Name</span><span>Wallet</span><span style={{ textAlign: 'right' }}>Amount</span>
            </div>
            {rows.map(row => {
              const isErrorRow = errorRows.has(row.row)
              return (
                <div key={row.row} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.6fr auto', gap: 12, alignItems: 'center',
                  padding: '10px 16px', borderBottom: '1px solid rgba(var(--c-fg-rgb),.05)',
                  background: isErrorRow ? 'rgba(251,111,132,.08)' : 'transparent',
                }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: isErrorRow ? '#fb6f84' : 'var(--c-text)' }}>{row.employee_id}</span>
                  <span style={{ fontSize: 13 }}>{row.employee_name ?? '—'}</span>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--c-muted2)' }}>{row.wallet_address ?? '—'}</span>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', textAlign: 'right' }}>{row.amount != null ? row.amount.toFixed(2) : '—'}</span>
                  {errors.filter(e => e.row === row.row).map((e, i) => (
                    <div key={i} style={{ gridColumn: '1 / -1', fontSize: 11, color: '#fb6f84' }}>⚠ {e.message}</div>
                  ))}
                </div>
              )
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', fontSize: 13, fontWeight: 700 }}>
              <span>Total ({rows.length} rows)</span>
              <span style={{ fontFamily: 'monospace' }}>{totalAmount.toFixed(2)} USDC</span>
            </div>
          </div>

          {globalErrors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: '#fb6f84', marginBottom: 8 }}>⚠ {e.message}</div>
          ))}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep('upload')}
              style={{ height: 38, padding: '0 16px', borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-muted)', fontSize: 13, cursor: 'pointer' }}>
              Re-upload
            </button>
            <button
              disabled={hasErrors}
              onClick={() => router.push(`/payroll/runs/${runId}`)}
              style={{
                height: 38, padding: '0 16px', borderRadius: 10, border: 'none',
                background: hasErrors ? 'rgba(var(--c-fg-rgb),.14)' : 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)',
                color: hasErrors ? 'var(--c-muted2)' : '#fff', fontSize: 13, fontWeight: 600,
                cursor: hasErrors ? 'not-allowed' : 'pointer',
              }}>
              {hasErrors ? 'Fix errors to continue' : 'Continue to sign →'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
