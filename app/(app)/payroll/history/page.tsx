'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/app/lib/supabase'

interface Run {
  id: string
  period: string
  status: string
  total_amount: number
  employee_count: number
  created_at: string
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'var(--c-muted2)',
  approved: 'var(--c-warning)',
  processing: 'var(--c-warning)',
  paid: '#2dd4bf',
  partially_paid: '#fb6f84',
  cancelled: 'var(--c-muted2)',
}

export default function PayrollHistoryPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const res = await fetch('/api/payroll/runs', {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      })
      const json = await res.json()
      setRuns(json.runs ?? [])
      setLoading(false)
    })
  }, [])

  return (
    <div style={{ padding: 24, color: 'var(--c-text)', maxWidth: 900 }}>
      <Link href="/payroll" style={{ fontSize: 12, color: 'var(--c-muted2)', textDecoration: 'none' }}>← Payroll</Link>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 20px' }}>Payroll history</h1>

      <div style={{ borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', gap: 12, padding: '10px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-muted2)', borderBottom: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
          <span>Period</span><span>Status</span><span>Employees</span><span style={{ textAlign: 'right' }}>Total</span><span></span>
        </div>
        {loading && <div style={{ padding: 20, fontSize: 13, color: 'var(--c-muted)' }}>Loading…</div>}
        {!loading && runs.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--c-muted)' }}>No payroll runs yet.</div>}
        {runs.map(run => (
          <Link key={run.id} href={`/payroll/runs/${run.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', gap: 12, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid rgba(var(--c-fg-rgb),.05)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{run.period}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[run.status] ?? 'var(--c-muted2)', textTransform: 'uppercase' }}>{run.status}</span>
              <span style={{ fontSize: 13 }}>{run.employee_count}</span>
              <span style={{ fontSize: 13, fontFamily: 'monospace', textAlign: 'right' }}>{run.total_amount.toFixed(2)}</span>
              <span style={{ fontSize: 12, color: 'var(--c-muted2)', textAlign: 'right' }}>{new Date(run.created_at).toLocaleDateString()}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
