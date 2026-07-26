'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import { supabase } from '@/app/lib/supabase'
import { AgentPinModal } from '@/app/components/AgentPinModal'

interface Row {
  email: string
  amount: string
  note: string
  error?: string
}

const FEE_BPS = 10 // 0.1% — must match MironPayrollClaim.sol's default feeBps
const DEFAULT_EXPIRY_DAYS = 10

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
}

function emptyRow(): Row {
  return { email: '', amount: '', note: '' }
}

function colLetter(i: number): string {
  return String.fromCharCode(65 + i) // 0->A, 1->B, … (26+ columns aren't a realistic payroll sheet)
}

function validateRow(row: Row): string | undefined {
  if (!row.email.trim()) return 'Email required'
  if (!row.email.includes('@')) return 'Invalid email'
  const amt = parseFloat(row.amount)
  if (!row.amount || isNaN(amt) || amt <= 0) return 'Invalid amount'
  return undefined
}

export default function NewPayrollClaimPage() {
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [expiryDays, setExpiryDays] = useState(DEFAULT_EXPIRY_DAYS)
  const [showReview, setShowReview] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ txHash: string; runId: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Guards against a real transaction being submitted twice — e.g. if
  // AgentPinModal's onSuccess ever fires more than once for one PIN entry.
  // A ref (not state) so the check-and-set is synchronous, not subject to
  // React batching a second call in before the first re-render lands.
  const submittedRef = useRef(false)
  // Stable for the lifetime of this form instance — sent to the server so
  // it can recognize a duplicate submission (same key twice) and hand back
  // the original result instead of broadcasting a second real transaction.
  const idempotencyKeyRef = useRef(crypto.randomUUID())
  // Frozen snapshot of what will actually be submitted, captured the
  // instant "Approve & Sign" is clicked — the review screen and the final
  // API call both read from this, not the live inputs, so nothing (autofill,
  // a stray edit) can silently change what gets paid after that point.
  const [reviewSnapshot, setReviewSnapshot] = useState<Row[]>([])
  // Raw uploaded spreadsheet, held here until the company confirms which
  // column is which — see handleCsvUpload/applyColumnMapping above.
  const [csvData, setCsvData] = useState<string[][] | null>(null)
  const [csvHasHeader, setCsvHasHeader] = useState(true)
  const [colMap, setColMap] = useState<{ email: string; amount: string; note: string }>({ email: '', amount: '', note: '' })

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch, error: undefined } : r)))
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  // Raw, unopinionated spreadsheet import: a company's payroll export can
  // have any column order/names, so instead of requiring an exact
  // "email,amount,note" header, we read the file as plain columns and let
  // the company point at which one is which (by spreadsheet-style letter —
  // A, B, C…), the same way they'd already think about their own file.
  // No auto-detection beyond a plain case-insensitive header-text match
  // (not AI) used only as a starting guess — the company always sees and
  // can override the mapping before anything is imported.
  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (res) => {
        const data = (res.data as string[][]).filter((r) => r.some((c) => (c ?? '').toString().trim()))
        if (data.length === 0) return
        setCsvData(data)
        const firstRow = data[0].map((c) => (c ?? '').toString().trim().toLowerCase())
        const guessCol = (needles: string[]) => {
          const idx = firstRow.findIndex((h) => needles.some((n) => h.includes(n)))
          return idx >= 0 ? colLetter(idx) : ''
        }
        setColMap({
          email: guessCol(['email', 'mail']),
          amount: guessCol(['amount', 'usdc', 'salary', 'pay']),
          note: guessCol(['note', 'memo', 'desc']),
        })
      },
    })
    e.target.value = ''
  }

  function applyColumnMapping() {
    if (!csvData || !colMap.email || !colMap.amount) return
    const emailIdx = colMap.email.charCodeAt(0) - 65
    const amountIdx = colMap.amount.charCodeAt(0) - 65
    const noteIdx = colMap.note ? colMap.note.charCodeAt(0) - 65 : -1
    const dataRows = csvHasHeader ? csvData.slice(1) : csvData
    const imported: Row[] = dataRows
      .filter((r) => r.some((c) => (c ?? '').toString().trim()))
      .map((r) => ({
        email: (r[emailIdx] ?? '').toString().trim(),
        amount: (r[amountIdx] ?? '').toString().trim(),
        note: noteIdx >= 0 ? (r[noteIdx] ?? '').toString().trim() : '',
      }))
    setRows(imported.length > 0 ? imported : [emptyRow()])
    setCsvData(null)
  }

  const emailCounts = rows.reduce<Record<string, number>>((acc, r) => {
    const key = r.email.trim().toLowerCase()
    if (key) acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const validated = rows.map((r) => {
    const key = r.email.trim().toLowerCase()
    const error = validateRow(r) ?? (key && emailCounts[key] > 1 ? 'Duplicate email in this run' : undefined)
    return { ...r, error }
  })
  const hasErrors = validated.some((r) => r.error) || rows.length === 0
  const total = validated.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)
  const fee = (total * FEE_BPS) / 10000
  const grandTotal = total + fee

  async function submit(pin: string) {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/payroll/claim/pay', {
        method: 'POST',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: `run-${Date.now()}`,
          items: reviewSnapshot.map((r) => ({ email: r.email.trim(), amount: parseFloat(r.amount), note: r.note || undefined })),
          expirySeconds: expiryDays * 24 * 60 * 60,
          pin,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Payment failed')
        setShowPin(false)
        setSubmitting(false)
        submittedRef.current = false // allow retry after a failed attempt
        return
      }
      setResult({ txHash: data.txHash, runId: data.run.id })
      setShowPin(false)
    } catch {
      setError('Network error')
      setShowPin(false)
      submittedRef.current = false
    }
    setSubmitting(false)
  }

  // submitting takes priority over showPin — the instant a PIN is entered,
  // AgentPinModal must be unmounted (not just left sitting there) so it
  // can't be tapped again while the transaction is still confirming.
  if (submitting) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <div style={{ width: 320, borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.1)', padding: 28, color: 'var(--c-text)', textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, margin: '0 auto 14px', borderRadius: '50%', border: '2px solid #6366f1', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ fontSize: 13, color: 'var(--c-muted)' }}>Signing & broadcasting…</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    )
  }

  if (showPin) {
    return <AgentPinModal onSuccess={submit} onCancel={() => setShowPin(false)} />
  }

  if (showReview) {
    const snap = reviewSnapshot
    const snapTotal = snap.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)
    const snapFee = (snapTotal * FEE_BPS) / 10000
    return (
      <div style={{ padding: 24, color: 'var(--c-text)', maxWidth: 640 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Review before signing</h1>
        <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 16 }}>
          Check every row carefully — this is exactly what will be paid once you enter your PIN.
        </p>
        <div style={{ borderRadius: 12, border: '1px solid rgba(var(--c-fg-rgb),.08)', overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr', gap: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--c-muted2)', padding: '8px 12px', background: 'var(--c-panel)' }}>
            <span>Email</span><span>Amount (USDC)</span><span>Note</span>
          </div>
          {snap.map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr', gap: 8, padding: '8px 12px', borderTop: '1px solid rgba(var(--c-fg-rgb),.06)', fontSize: 13 }}>
              <span>{row.email}</span>
              <span style={{ fontFamily: 'monospace' }}>{row.amount}</span>
              <span style={{ color: 'var(--c-muted2)' }}>{row.note || '—'}</span>
            </div>
          ))}
        </div>
        <div style={{ borderRadius: 12, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', padding: 16, marginBottom: 20 }}>
          <Row label="Payroll total" value={`${snapTotal.toFixed(6)} USDC`} />
          <Row label={`Platform fee (${FEE_BPS / 100}%)`} value={`${snapFee.toFixed(6)} USDC`} />
          <div style={{ height: 1, background: 'rgba(var(--c-fg-rgb),.08)', margin: '8px 0' }} />
          <Row label="Required in your wallet" value={`${(snapTotal + snapFee).toFixed(6)} USDC`} bold />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowReview(false)}
            style={{ height: 40, padding: '0 18px', borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-muted)', fontSize: 14, cursor: 'pointer' }}
          >
            ← Edit
          </button>
          <button
            onClick={() => { setShowReview(false); setShowPin(true) }}
            style={{ height: 40, padding: '0 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Confirm & Sign
          </button>
        </div>
      </div>
    )
  }

  if (result) {
    const paidCount = reviewSnapshot.length || rows.length
    return (
      <div style={{ padding: 24, color: 'var(--c-text)', maxWidth: 560 }}>
        <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>✅ Payroll paid</p>
        <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 16 }}>
          {paidCount} recipient{paidCount > 1 ? 's' : ''} paid — {grandTotal.toFixed(6)} USDC total (incl. {fee.toFixed(6)} USDC fee).
          Anyone without a MironPay account yet has funds waiting in a Claim Box until they log in.
        </p>
        <p style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--c-muted2)', wordBreak: 'break-all', marginBottom: 20 }}>
          tx: {result.txHash}
        </p>
        <Link href="/payroll" style={{ fontSize: 13, color: '#818cf8' }}>← Back to Payroll</Link>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, color: 'var(--c-text)', maxWidth: 720 }}>
      <Link href="/payroll" style={{ fontSize: 12, color: 'var(--c-muted2)', textDecoration: 'none' }}>← Payroll</Link>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 4px' }}>New payroll run</h1>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 20 }}>
        Everyone is paid by email — no pre-registration needed. Recipients without a MironPay account claim later via a notification email.
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'inline-block', fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(var(--c-fg-rgb),.14)', cursor: 'pointer' }}>
          Upload spreadsheet (CSV, any column layout)
          <input type="file" accept=".csv" onChange={handleCsvUpload} style={{ display: 'none' }} />
        </label>
      </div>

      {csvData && (
        <div style={{ borderRadius: 12, border: '1px solid rgba(129,140,248,.35)', background: 'rgba(99,102,241,.06)', padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Which column is which?</p>
          <p style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 12 }}>
            {csvData.length} row{csvData.length > 1 ? 's' : ''} found. Pick the column letter for each field — nothing is imported until you confirm.
          </p>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--c-muted2)', marginBottom: 12 }}>
            <input type="checkbox" checked={csvHasHeader} onChange={(e) => setCsvHasHeader(e.target.checked)} />
            First row is a header (not a real recipient)
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
            {(['email', 'amount', 'note'] as const).map((field) => (
              <div key={field}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--c-muted2)', marginBottom: 4 }}>
                  {field === 'email' ? 'Email column' : field === 'amount' ? 'Amount column' : 'Note column (optional)'}
                </div>
                <select
                  value={colMap[field]}
                  onChange={(e) => setColMap((prev) => ({ ...prev, [field]: e.target.value }))}
                  style={{ width: '100%', background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.14)', borderRadius: 6, padding: '6px 8px', color: 'var(--c-text)', fontSize: 13 }}
                >
                  <option value="">{field === 'note' ? '— none —' : '— select —'}</option>
                  {csvData[0].map((_, i) => {
                    const sampleRow = csvHasHeader ? csvData[1] : csvData[0]
                    const sample = (sampleRow?.[i] ?? '').toString().trim()
                    return (
                      <option key={i} value={colLetter(i)}>
                        {colLetter(i)}{sample ? ` — ${sample.slice(0, 24)}` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={applyColumnMapping}
              disabled={!colMap.email || !colMap.amount}
              style={{
                height: 34, padding: '0 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                background: !colMap.email || !colMap.amount ? 'rgba(129,140,248,.3)' : 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)',
                color: '#fff', cursor: !colMap.email || !colMap.amount ? 'not-allowed' : 'pointer',
              }}
            >
              Import {csvHasHeader ? csvData.length - 1 : csvData.length} row{(csvHasHeader ? csvData.length - 1 : csvData.length) !== 1 ? 's' : ''}
            </button>
            <button
              onClick={() => setCsvData(null)}
              style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'transparent', color: 'var(--c-muted)', fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ borderRadius: 12, border: '1px solid rgba(var(--c-fg-rgb),.08)', overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr 32px', gap: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--c-muted2)', padding: '8px 12px', background: 'var(--c-panel)' }}>
          <span>Email</span><span>Amount (USDC)</span><span>Note</span><span />
        </div>
        {validated.map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr 32px', gap: 8, padding: '8px 12px', borderTop: '1px solid rgba(var(--c-fg-rgb),.06)', alignItems: 'center' }}>
            <input
              value={row.email}
              onChange={(e) => updateRow(i, { email: e.target.value })}
              placeholder="employee@company.com"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              name={`payroll-email-${i}-noautofill`}
              style={{ background: 'transparent', border: row.error && !row.email ? '1px solid #fb6f84' : '1px solid transparent', borderRadius: 6, padding: '4px 6px', color: 'var(--c-text)', fontSize: 13 }}
            />
            <input
              value={row.amount}
              onChange={(e) => updateRow(i, { amount: e.target.value })}
              placeholder="0.00"
              autoComplete="off"
              name={`payroll-amount-${i}-noautofill`}
              style={{ background: 'transparent', border: row.error && row.email ? '1px solid #fb6f84' : '1px solid transparent', borderRadius: 6, padding: '4px 6px', color: 'var(--c-text)', fontSize: 13, fontFamily: 'monospace' }}
            />
            <input
              value={row.note}
              onChange={(e) => updateRow(i, { note: e.target.value })}
              placeholder="optional"
              autoComplete="off"
              name={`payroll-note-${i}-noautofill`}
              style={{ background: 'transparent', border: '1px solid transparent', borderRadius: 6, padding: '4px 6px', color: 'var(--c-text)', fontSize: 13 }}
            />
            <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: 'var(--c-muted2)', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        ))}
      </div>

      {validated.some((r) => r.error === 'Duplicate email in this run') && (
        <p style={{ fontSize: 12, color: '#fb6f84', marginTop: -6, marginBottom: 14 }}>
          Duplicate email in this run — combine into one row instead (each duplicate would pay into the same claim box).
        </p>
      )}

      <button
        onClick={() => setRows((prev) => [...prev, emptyRow()])}
        style={{ fontSize: 12, color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 20 }}
      >
        + Add row
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 20 }}>
        <span style={{ color: 'var(--c-muted2)' }}>Unclaimed funds return to you after</span>
        <input
          type="number"
          min={1}
          value={expiryDays}
          onChange={(e) => setExpiryDays(Math.max(1, parseInt(e.target.value) || 1))}
          style={{ width: 56, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.14)', borderRadius: 6, padding: '4px 8px', color: 'var(--c-text)', fontSize: 13 }}
        />
        <span style={{ color: 'var(--c-muted2)' }}>days</span>
      </div>

      <div style={{ borderRadius: 12, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', padding: 16, marginBottom: 20 }}>
        <Row label="Payroll total" value={`${total.toFixed(6)} USDC`} />
        <Row label={`Platform fee (${FEE_BPS / 100}%)`} value={`${fee.toFixed(6)} USDC`} />
        <div style={{ height: 1, background: 'rgba(var(--c-fg-rgb),.08)', margin: '8px 0' }} />
        <Row label="Required in your wallet" value={`${grandTotal.toFixed(6)} USDC`} bold />
      </div>

      {error && <p style={{ fontSize: 13, color: '#fb6f84', marginBottom: 12 }}>{error}</p>}

      <button
        disabled={hasErrors || submitting}
        onClick={() => {
          // Freeze exactly what will be submitted at this instant — the
          // review screen and the actual API call both read from this
          // snapshot, not the live inputs, so nothing (autofill, a stray
          // edit) can silently change what gets paid after this point.
          setReviewSnapshot(rows.map((r) => ({ ...r })))
          setShowReview(true)
        }}
        style={{
          height: 40, padding: '0 20px', borderRadius: 10, border: 'none',
          background: hasErrors ? 'rgba(129,140,248,.3)' : 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)',
          color: '#fff', fontSize: 14, fontWeight: 600, cursor: hasErrors ? 'not-allowed' : 'pointer',
        }}
      >
        Approve & Sign
      </button>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
      <span style={{ color: 'var(--c-muted2)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600, fontFamily: 'monospace' }}>{value}</span>
    </div>
  )
}
