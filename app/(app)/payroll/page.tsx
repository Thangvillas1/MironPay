'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/app/lib/supabase'

export default function PayrollHomePage() {
  const [employeeCount, setEmployeeCount] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const res = await fetch('/api/payroll/employees', {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      })
      const json = await res.json()
      setEmployeeCount((json.employees ?? []).length)
    })
  }, [])

  return (
    <div style={{ padding: 24, color: 'var(--c-text)' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Payroll</h1>
      <p style={{ fontSize: 13, color: 'var(--c-muted2)', margin: '0 0 20px' }}>Batch USDC payroll on Arc — v0</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
        <Link href="/payroll/employees" style={{ textDecoration: 'none' }}>
          <div style={{ borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-muted2)' }}>Employees</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: 'var(--c-text)' }}>{employeeCount ?? '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>Manage list →</div>
          </div>
        </Link>

        <Link href="/payroll/new" style={{ textDecoration: 'none' }}>
          <div style={{ borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-muted2)' }}>New (legacy)</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8, color: 'var(--c-text)' }}>Wallet-based run</div>
            <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>Requires pre-registered wallets →</div>
          </div>
        </Link>

        <Link href="/payroll/history" style={{ textDecoration: 'none' }}>
          <div style={{ borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-muted2)' }}>History</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8, color: 'var(--c-text)' }}>Past runs</div>
            <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>View all →</div>
          </div>
        </Link>

        <Link href="/payroll/claim/new" style={{ textDecoration: 'none' }}>
          <div style={{ borderRadius: 16, background: 'linear-gradient(135deg,rgba(99,102,241,.16),transparent 70%),var(--c-panel)', border: '1px solid rgba(99,102,241,.3)', padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-muted2)' }}>New</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8, color: 'var(--c-text)' }}>+ New payroll run</div>
            <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>Just email + amount, no setup →</div>
          </div>
        </Link>

        <Link href="/payroll/claim/inbox" style={{ textDecoration: 'none' }}>
          <div style={{ borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-muted2)' }}>Inbox</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8, color: 'var(--c-text)' }}>Money waiting for you</div>
            <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>Claim payments sent to your email →</div>
          </div>
        </Link>
      </div>
    </div>
  )
}
