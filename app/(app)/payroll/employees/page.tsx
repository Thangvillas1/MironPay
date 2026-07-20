'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/app/lib/supabase'

interface Employee {
  id: string
  employee_id: string
  name: string
  wallet_address: string
  is_active: boolean
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
}

export default function PayrollEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [walletChangeFor, setWalletChangeFor] = useState<Employee | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/payroll/employees', { headers: await authHeader() })
    const data = await res.json()
    setEmployees(data.employees ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function toggleActive(emp: Employee) {
    await fetch(`/api/payroll/employees/${emp.id}`, {
      method: 'PATCH',
      headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !emp.is_active }),
    })
    load()
  }

  return (
    <div style={{ padding: 24, color: 'var(--c-text)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <Link href="/payroll" style={{ fontSize: 12, color: 'var(--c-muted2)', textDecoration: 'none' }}>← Payroll</Link>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 0' }}>Employees</h1>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{ height: 36, padding: '0 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + Add employee
        </button>
      </div>

      <div style={{ borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.6fr auto auto', gap: 12, padding: '10px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-muted2)', borderBottom: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
          <span>ID</span><span>Name</span><span>Wallet</span><span>Status</span><span></span>
        </div>
        {loading && <div style={{ padding: 20, fontSize: 13, color: 'var(--c-muted)' }}>Loading…</div>}
        {!loading && employees.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--c-muted)' }}>No employees yet.</div>}
        {employees.map(emp => (
          <div key={emp.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.6fr auto auto', gap: 12, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid rgba(var(--c-fg-rgb),.05)', opacity: emp.is_active ? 1 : 0.5 }}>
            <span style={{ fontSize: 13, fontFamily: 'monospace' }}>{emp.employee_id}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{emp.name}</span>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--c-muted2)' }} title={emp.wallet_address}>{shortAddr(emp.wallet_address)}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: emp.is_active ? '#2dd4bf' : 'var(--c-muted2)' }}>
              {emp.is_active ? 'Active' : 'Inactive'}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setWalletChangeFor(emp)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 7, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-muted)', cursor: 'pointer' }}>
                Change wallet
              </button>
              <button onClick={() => toggleActive(emp)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 7, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-muted)', cursor: 'pointer' }}>
                {emp.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAdd && <AddEmployeeModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />}
      {walletChangeFor && <ChangeWalletModal employee={walletChangeFor} onClose={() => setWalletChangeFor(null)} onSaved={() => { setWalletChangeFor(null); load() }} />}
    </div>
  )
}

function AddEmployeeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [employeeId, setEmployeeId] = useState('')
  const [name, setName] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    setError(null)
    const res = await fetch('/api/payroll/employees', {
      method: 'POST',
      headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, name, walletAddress, confirmed }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ width: 420, borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.1)', padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: 'var(--c-text)' }}>Add employee</h2>

        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted2)' }}>Employee ID</label>
        <input value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="NV001"
          style={{ width: '100%', marginTop: 4, marginBottom: 12, height: 36, borderRadius: 8, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-text)', padding: '0 10px', fontSize: 13 }} />

        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted2)' }}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ width: '100%', marginTop: 4, marginBottom: 12, height: 36, borderRadius: 8, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-text)', padding: '0 10px', fontSize: 13 }} />

        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted2)' }}>Wallet address</label>
        <textarea value={walletAddress} onChange={e => { setWalletAddress(e.target.value); setConfirmed(false) }} placeholder="0x..."
          rows={2}
          style={{ width: '100%', marginTop: 4, marginBottom: 8, borderRadius: 8, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-text)', padding: '8px 10px', fontSize: 12, fontFamily: 'monospace', resize: 'none' }} />

        {walletAddress && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--c-muted)', marginBottom: 14 }}>
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
            I have checked this wallet address carefully. Payments here cannot be reversed if it is wrong.
          </label>
        )}

        {error && <div style={{ fontSize: 12, color: '#fb6f84', marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-muted)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={!employeeId || !name || !confirmed || saving}
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!employeeId || !name || !confirmed || saving) ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChangeWalletModal({ employee, onClose, onSaved }: { employee: Employee; onClose: () => void; onSaved: () => void }) {
  const [walletAddress, setWalletAddress] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/payroll/employees/${employee.id}`, {
      method: 'PATCH',
      headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, confirmed }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ width: 420, borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(251,111,132,.3)', padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--c-text)' }}>Change wallet for {employee.name}</h2>
        <p style={{ fontSize: 12, color: 'var(--c-muted2)', margin: '0 0 14px' }}>Current: <span style={{ fontFamily: 'monospace' }}>{employee.wallet_address}</span></p>

        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted2)' }}>New wallet address</label>
        <textarea value={walletAddress} onChange={e => { setWalletAddress(e.target.value); setConfirmed(false) }} placeholder="0x..."
          rows={2}
          style={{ width: '100%', marginTop: 4, marginBottom: 8, borderRadius: 8, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-text)', padding: '8px 10px', fontSize: 12, fontFamily: 'monospace', resize: 'none' }} />

        {walletAddress && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--c-muted)', marginBottom: 14 }}>
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
            I have verified this new address with the employee directly. This change is logged.
          </label>
        )}

        {error && <div style={{ fontSize: 12, color: '#fb6f84', marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-muted)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={!walletAddress || !confirmed || saving}
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: '#fb6f84', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!walletAddress || !confirmed || saving) ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Confirm change'}
          </button>
        </div>
      </div>
    </div>
  )
}
