'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import PayrollSignModal from '@/app/components/PayrollSignModal'

interface DraftRow {
  row: number
  employee_id: string
  amount: number | null
  employee_name: string | null
  wallet_address: string | null
}

interface RunItem {
  id: string
  employee_id: string
  employee_name: string
  wallet_address: string
  amount: number
  status: 'pending' | 'sent' | 'confirmed' | 'failed'
  tx_hash: string | null
  error_message: string | null
}

interface Run {
  id: string
  period: string
  status: 'draft' | 'approved' | 'processing' | 'paid' | 'partially_paid' | 'cancelled'
  total_amount: number
  employee_count: number
}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
}

function shortAddr(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—'
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--c-muted2)',
  sent: 'var(--c-warning)',
  confirmed: '#2dd4bf',
  failed: '#fb6f84',
}

export default function PayrollRunDetailPage() {
  const { runId } = useParams<{ runId: string }>()
  const [run, setRun] = useState<Run | null>(null)
  const [items, setItems] = useState<(DraftRow | RunItem)[]>([])
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showSign, setShowSign] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [executeError, setExecuteError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/payroll/runs/${runId}`, { headers: await authHeader() })
    const data = await res.json()
    setRun(data.run)
    setItems(data.items ?? [])
    setErrors(data.errors ?? [])
    setLoading(false)
  }, [runId])

  useEffect(() => { load() }, [load])

  async function execute() {
    setExecuting(true)
    setExecuteError(null)
    const res = await fetch(`/api/payroll/runs/${runId}/execute`, { method: 'POST', headers: await authHeader() })
    const data = await res.json()
    setExecuting(false)
    if (!res.ok) { setExecuteError(data.error ?? 'Execute failed'); return }
    load()
  }

  async function retryFailed() {
    const failedIds = (items as RunItem[]).filter(i => i.status === 'failed').map(i => i.id)
    if (failedIds.length === 0) return
    setExecuting(true)
    setExecuteError(null)
    const res = await fetch(`/api/payroll/runs/${runId}/retry`, {
      method: 'POST',
      headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds: failedIds }),
    })
    const data = await res.json()
    setExecuting(false)
    if (!res.ok) { setExecuteError(data.error ?? 'Retry failed'); return }
    load()
  }

  if (loading || !run) return <div style={{ padding: 24, color: 'var(--c-muted)' }}>Loading…</div>

  const isDraft = run.status === 'draft'
  const isApproved = run.status === 'approved'
  const isLive = ['processing', 'paid', 'partially_paid'].includes(run.status)

  return (
    <div style={{ padding: 24, color: 'var(--c-text)', maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{run.period}</h1>
          <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[run.status] ?? 'var(--c-muted2)', textTransform: 'uppercase' }}>{run.status}</span>
        </div>
        {isDraft && (
          <button
            disabled={errors.length > 0}
            onClick={() => setShowSign(true)}
            style={{ height: 38, padding: '0 16px', borderRadius: 10, border: 'none', background: errors.length > 0 ? 'rgba(var(--c-fg-rgb),.14)' : 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', color: errors.length > 0 ? 'var(--c-muted2)' : '#fff', fontSize: 13, fontWeight: 600, cursor: errors.length > 0 ? 'not-allowed' : 'pointer' }}>
            Approve &amp; Sign
          </button>
        )}
        {isApproved && (
          <button onClick={execute} disabled={executing}
            style={{ height: 38, padding: '0 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: executing ? 0.6 : 1 }}>
            {executing ? 'Executing…' : 'Execute payroll'}
          </button>
        )}
        {run.status === 'partially_paid' && (
          <button onClick={retryFailed} disabled={executing}
            style={{ height: 38, padding: '0 16px', borderRadius: 10, border: '1px solid #fb6f84', background: 'transparent', color: '#fb6f84', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: executing ? 0.6 : 1 }}>
            {executing ? 'Retrying…' : 'Retry failed'}
          </button>
        )}
      </div>

      {executeError && <div style={{ fontSize: 12, color: '#fb6f84', marginBottom: 12 }}>{executeError}</div>}

      <div style={{ borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isLive ? '1fr 1.4fr 1.6fr auto auto' : '1fr 1.4fr 1.6fr auto', gap: 12, padding: '10px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-muted2)', borderBottom: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
          <span>ID</span><span>Name</span><span>Wallet</span><span style={{ textAlign: 'right' }}>Amount</span>{isLive && <span>Status</span>}
        </div>
        {(items as (DraftRow & Partial<RunItem>)[]).map((row, i) => (
          <div key={row.row ?? row.id ?? i} style={{ display: 'grid', gridTemplateColumns: isLive ? '1fr 1.4fr 1.6fr auto auto' : '1fr 1.4fr 1.6fr auto', gap: 12, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid rgba(var(--c-fg-rgb),.05)' }}>
            <span style={{ fontSize: 13, fontFamily: 'monospace' }}>{row.employee_id}</span>
            <span style={{ fontSize: 13 }}>{row.employee_name ?? '—'}</span>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--c-muted2)' }}>{shortAddr(row.wallet_address ?? '')}</span>
            <span style={{ fontSize: 13, fontFamily: 'monospace', textAlign: 'right' }}>{row.amount != null ? row.amount.toFixed(2) : '—'}</span>
            {isLive && (
              <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[row.status ?? 'pending'] }}>
                {row.status}
                {row.tx_hash && (
                  <a href={`https://testnet.arcscan.app/tx/${row.tx_hash}`} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 10, color: 'var(--c-indigo-light)', textDecoration: 'none' }}>
                    explorer ↗
                  </a>
                )}
              </span>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', fontSize: 13, fontWeight: 700 }}>
          <span>Total ({run.employee_count} employees)</span>
          <span style={{ fontFamily: 'monospace' }}>{run.total_amount.toFixed(2)} USDC</span>
        </div>
      </div>

      {showSign && (
        <PayrollSignModal
          runId={run.id}
          period={run.period}
          employeeCount={run.employee_count}
          totalAmount={run.total_amount}
          onClose={() => setShowSign(false)}
          onApproved={() => { setShowSign(false); load() }}
        />
      )}
    </div>
  )
}
