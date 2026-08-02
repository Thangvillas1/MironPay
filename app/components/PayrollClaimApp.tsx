'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import { supabase } from '@/app/lib/supabase'
import { AgentPinModal } from '@/app/components/AgentPinModal'
import VerifiedBadge from '@/app/components/VerifiedBadge'
import PayrollClaimTabs, { PayrollClaimRole } from '@/app/components/PayrollClaimTabs'

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
}

function defaultPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Ticks once a second so any component reading it re-renders live — the
// single shared clock behind every countdown on this page (avoids each row
// starting its own setInterval).
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

// "2d 04:11:09" above 1 day, "04:11:09" under — ticks down to the second so
// a company/employee watching the screen sees it actually move, not just a
// stale "X days left" that only updates on refresh.
function formatCountdown(msRemaining: number): string {
  const clamped = Math.max(0, msRemaining)
  const totalSec = Math.floor(clamped / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return days > 0 ? `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}` : `${pad(hours)}:${pad(mins)}:${pad(secs)}`
}

// Same tinted-glass panel language as Wallet/Dashboard's cards — replaces
// the flat var(--c-panel) boxes this page used to have.
const PANEL_GLASS = {
  background: 'linear-gradient(165deg,rgba(99,102,241,.08),transparent 56%),color-mix(in srgb, var(--c-panel) 55%, transparent)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(var(--c-fg-rgb),.10)',
  boxShadow: '0 8px 26px rgba(99,102,241,.16),inset 0 1px 0 rgba(var(--c-fg-rgb),.06)',
} as const
const PANEL_GLASS_HEADER = { background: 'color-mix(in srgb, var(--c-panel) 65%, transparent)' } as const

// ════════════════════════════════════════════════════════════════
// Company · Run payroll
// ════════════════════════════════════════════════════════════════

interface Row {
  email: string
  amount: string
  note: string
  error?: string
}

interface RunItem {
  id: string
  email: string
  amount: number
  note: string | null
  status: 'pending' | 'paid' | 'claiming' | 'claimed' | 'reclaiming' | 'reclaimed' | 'failed'
  claim_tx_hash?: string | null
  reclaimed_at?: string | null
  reference_code?: string | null
}

interface RunRow {
  id: string
  period: string
  status: 'draft' | 'paid' | 'failed'
  total_amount: number
  fee_amount: number
  expiry_seconds: number
  tx_hash: string | null
  paid_at: string | null
}

interface RunListItem extends RunRow {
  recipientCount: number
  claimedCount: number
  reclaimedCount: number
}

const FEE_BPS = 10 // 0.1% — must match MironPayrollClaim.sol's default feeBps
const DEFAULT_EXPIRY_DAYS = 14

const PROCESSING_STAGES = [
  'Verifying your PIN',
  'Preparing a Claim Box per person',
  'Funding all boxes on-chain',
  'Emailing claim links',
]

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

const STATUS_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Pending', bg: 'rgba(156,152,194,.14)', fg: 'var(--c-muted)' },
  paid: { label: 'In Claim Box', bg: 'rgba(99,102,241,.16)', fg: '#a5b4fc' },
  claiming: { label: 'Claiming', bg: 'rgba(129,140,248,.22)', fg: '#818cf8' },
  claimed: { label: 'Claimed', bg: 'rgba(45,212,191,.16)', fg: '#2dd4bf' },
  reclaiming: { label: 'Reclaiming', bg: 'rgba(245,183,72,.16)', fg: '#f5b748' },
  reclaimed: { label: 'Reclaimed', bg: 'rgba(245,183,72,.16)', fg: '#f5b748' },
  failed: { label: 'Failed', bg: 'rgba(251,111,132,.16)', fg: '#fb6f84' },
}

function CompanyRunPayroll({ tabs }: { tabs: React.ReactNode }) {
  const now = useNow()
  const [period, setPeriod] = useState(defaultPeriod())
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [expiryDays, setExpiryDays] = useState(DEFAULT_EXPIRY_DAYS)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [stageIdx, setStageIdx] = useState(0)
  const [run, setRun] = useState<RunRow | null>(null)
  const [items, setItems] = useState<RunItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reclaimingId, setReclaimingId] = useState<string | null>(null)
  const [history, setHistory] = useState<RunListItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
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
  // instant "Review & pay" is clicked — the confirm drawer and the final
  // API call both read from this, not the live inputs, so nothing (autofill,
  // a stray edit) can silently change what gets paid after that point.
  const [reviewSnapshot, setReviewSnapshot] = useState<Row[]>([])
  // Raw uploaded spreadsheet, held here until the company confirms which
  // column is which — see handleCsvUpload/applyColumnMapping above.
  const [csvData, setCsvData] = useState<string[][] | null>(null)
  const [csvHasHeader, setCsvHasHeader] = useState(true)
  const [colMap, setColMap] = useState<{ email: string; amount: string; note: string }>({ email: '', amount: '', note: '' })
  // Momentary red flash on the Amount field when a keystroke gets rejected
  // (anything that isn't a digit or a single decimal point) — purely visual,
  // the actual filtering happens in handleAmountChange below.
  const [amountFlash, setAmountFlash] = useState<number | null>(null)
  const amountFlashTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  function handleAmountChange(i: number, raw: string) {
    const digitsAndDot = raw.replace(/[^0-9.]/g, '')
    const firstDot = digitsAndDot.indexOf('.')
    const clean = firstDot === -1
      ? digitsAndDot
      : digitsAndDot.slice(0, firstDot + 1) + digitsAndDot.slice(firstDot + 1).replace(/\./g, '')
    if (clean !== raw) {
      setAmountFlash(i)
      clearTimeout(amountFlashTimers.current[i])
      amountFlashTimers.current[i] = setTimeout(() => setAmountFlash((cur) => (cur === i ? null : cur)), 350)
    }
    updateRow(i, { amount: clean })
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch, error: undefined } : r)))
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  // Keeps the first occurrence of each email, drops the rest — same intent
  // as the server-side duplicate rejection in pay/route.ts, just done ahead
  // of time so the company doesn't have to manually hunt down which rows clash.
  function dedupeRows() {
    setRows((prev) => {
      const seen = new Set<string>()
      return prev.filter((r) => {
        const key = r.email.trim().toLowerCase()
        if (!key) return true
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    })
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
        const emailGuess = guessCol(['email', 'mail'])
        const amountGuess = guessCol(['amount', 'usdc', 'salary', 'pay'])
        setColMap({
          email: emailGuess,
          amount: amountGuess,
          note: guessCol(['note', 'memo', 'desc']),
        })
        // "Has header" must be re-decided per upload, never carried over from
        // a previous file — otherwise unchecking it once (or importing a
        // headerless file earlier) silently applies to every later upload in
        // the same session, and the real header row gets imported as a fake
        // recipient. A header match on row 0 (e.g. literally "email") is
        // strong evidence that row is a header, not data; no match at all is
        // the opposite signal.
        setCsvHasHeader(Boolean(emailGuess || amountGuess))
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
    setStageIdx(0)
    setError(null)

    // The backend does the real work in one shot (no streamed progress),
    // so this timer only advances the checklist optimistically while the
    // request is in flight — it's clamped to stop at the 4th stage and
    // never allowed to "finish" before the actual response lands below.
    const stageTimer = setInterval(() => {
      setStageIdx((s) => (s < PROCESSING_STAGES.length - 1 ? s + 1 : s))
    }, 900)

    try {
      const res = await fetch('/api/payroll/claim/pay', {
        method: 'POST',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period,
          items: reviewSnapshot.map((r) => ({ email: r.email.trim(), amount: parseFloat(r.amount), note: r.note || undefined })),
          expirySeconds: expiryDays * 24 * 60 * 60,
          pin,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      })
      const data = await res.json()
      clearInterval(stageTimer)
      if (!res.ok) {
        setError(data.error ?? 'Payment failed')
        setShowPin(false)
        setSubmitting(false)
        submittedRef.current = false // allow retry after a failed attempt
        return
      }
      setStageIdx(PROCESSING_STAGES.length - 1)
      await loadRun(data.run.id)
      setRun(data.run)
      setShowPin(false)
    } catch {
      clearInterval(stageTimer)
      setError('Network error')
      setShowPin(false)
      submittedRef.current = false
    }
    setSubmitting(false)
  }

  async function loadRun(runId: string) {
    try {
      const res = await fetch(`/api/payroll/claim/runs/${runId}`, { headers: await authHeader() })
      const data = await res.json()
      if (res.ok) {
        setRun(data.run)
        setItems(data.items)
      }
    } catch {
      // Result view falls back to reviewSnapshot totals if this fails —
      // the payment itself already succeeded by the time we get here.
    }
  }

  async function reclaim(itemId: string) {
    setReclaimingId(itemId)
    try {
      const res = await fetch('/api/payroll/claim/reclaim', {
        method: 'POST',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      })
      const data = await res.json()
      if (res.ok && run) {
        await loadRun(run.id)
        await loadHistory()
      } else {
        setError(data.error ?? 'Reclaim failed')
      }
    } catch {
      setError('Network error while reclaiming')
    }
    setReclaimingId(null)
  }

  // Precise deadline (ms since epoch), not a rounded day count — the caller
  // does the rounding/formatting it needs (a live countdown needs seconds,
  // reclaim-eligibility just needs "has this passed").
  function deadlineMs(): number | null {
    if (!run?.paid_at) return null
    return new Date(run.paid_at).getTime() + run.expiry_seconds * 1000
  }

  async function loadHistory() {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/payroll/claim/runs', { headers: await authHeader() })
      const data = await res.json()
      if (res.ok) setHistory(data.runs ?? [])
    } catch {
      // History list is a convenience view — a failed refresh here shouldn't
      // block anything else on the page.
    }
    setHistoryLoading(false)
  }

  useEffect(() => { loadHistory() }, [])

  // ── Processing overlay — deliberately not a separate route/view ──
  if (submitting) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay, rgba(6,4,16,.74))', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <div style={{ width: 340, borderRadius: 20, background: 'var(--c-panel)', border: '1px solid rgba(255,255,255,.08)', padding: 28, color: 'var(--c-text)', textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, margin: '0 auto 16px', borderRadius: '50%', border: '3px solid #6366f1', borderTopColor: 'transparent', animation: 'mp-spin 0.8s linear infinite' }} />
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Paying {reviewSnapshot.length} people</p>
          <p style={{ fontSize: 12.5, color: 'var(--c-muted)', marginBottom: 18 }}>
            Keep this tab open — funding {reviewSnapshot.length} Claim Boxes in one transaction.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
            {PROCESSING_STAGES.map((stage, i) => (
              <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {i < stageIdx ? (
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#2dd4bf', color: '#06231f', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</span>
                ) : i === stageIdx ? (
                  <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #818cf8', borderTopColor: 'transparent', animation: 'mp-spin 0.7s linear infinite', flexShrink: 0 }} />
                ) : (
                  <span style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid rgba(255,255,255,.14)', flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 13, color: i <= stageIdx ? 'var(--c-text)' : 'var(--c-muted2)', fontWeight: i === stageIdx ? 600 : 400 }}>{stage}</span>
              </div>
            ))}
          </div>
          <style>{`@keyframes mp-spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    )
  }

  if (showPin) {
    return <AgentPinModal onSuccess={submit} onCancel={() => setShowPin(false)} />
  }

  // ── Confirm + PIN drawer entry: summary card first, PIN pad reused as-is ──
  if (showConfirm) {
    const snap = reviewSnapshot
    const snapTotal = snap.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)
    const snapFee = (snapTotal * FEE_BPS) / 10000
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay, rgba(6,4,16,.74))', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
        <div style={{ width: 404, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', borderRadius: 20, background: 'var(--c-panel)', border: '1px solid rgba(255,255,255,.08)', padding: 24, color: 'var(--c-text)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Confirm payroll run</h2>
          <p style={{ fontSize: 12.5, color: 'var(--c-muted)', marginBottom: 16 }}>
            Check every row carefully — this is exactly what will be sent to each Claim Box.
          </p>
          <div style={{ borderRadius: 12, background: 'var(--c-input, rgba(255,255,255,.05))', padding: 14, marginBottom: 18 }}>
            <SummaryRow label="Total" value={`${(snapTotal + snapFee).toFixed(6)} USDC`} bold />
            <SummaryRow label="Recipients" value={`${snap.length} Claim Box${snap.length === 1 ? '' : 'es'}`} />
            <SummaryRow label="Period" value={period} />
            <SummaryRow label="Claim window" value={`${expiryDays} days`} />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,.07)', marginBottom: 18 }}>
            {snap.map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '8px 12px', borderTop: i > 0 ? '1px solid rgba(255,255,255,.06)' : 'none', fontSize: 12.5 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.email}</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{row.amount} USDC</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowConfirm(false)}
              style={{ flex: 1, height: 42, borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: 'var(--c-muted)', fontSize: 14, cursor: 'pointer' }}
            >
              ← Edit
            </button>
            <button
              onClick={() => { setShowConfirm(false); setShowPin(true) }}
              style={{ flex: 1.4, height: 42, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Review & pay
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Run result: real statuses from the DB, live reclaim action ──
  if (run) {
    const claimedCount = items.filter((i) => i.status === 'claimed').length
    const waitingCount = items.filter((i) => i.status === 'paid' || i.status === 'claiming').length
    const expiredItems = items.filter((i) => i.status === 'reclaiming' || i.status === 'reclaimed')
    const reclaimedCount = items.filter((i) => i.status === 'reclaimed').length
    const deadline = deadlineMs()
    const msLeft = deadline !== null ? deadline - now : null

    return (
      <div>
        {tabs}
        <button
          onClick={() => { setRun(null); setItems([]) }}
          style={{ background: 'none', border: 'none', color: 'var(--c-muted2)', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
        >
          ← Payroll history
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 2px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Payroll {run.period}</h1>
          {run.status === 'paid' && (
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(45,212,191,.16)', color: '#2dd4bf' }}>Paid</span>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--c-muted2)', marginBottom: 20 }}>
          run_{run.id.slice(0, 8)} · {items.length} recipient{items.length === 1 ? '' : 's'} · Sent to Claim Box
          {run.tx_hash && (
            <> · <span style={{ fontFamily: 'monospace' }}>{run.tx_hash.slice(0, 10)}…{run.tx_hash.slice(-6)}</span></>
          )}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          <StatCard label="Sent to boxes" value={`${run.total_amount.toFixed(2)} USDC`} sub={`${items.length} recipients`} color="var(--c-text)" />
          <StatCard label="Claimed" value={String(claimedCount)} color="#2dd4bf" />
          <StatCard label="Waiting" value={String(waitingCount)} color="#a5b4fc" />
          <StatCard label="Expired" value={String(expiredItems.length)} sub={`${reclaimedCount} reclaimed`} color="#f5b748" />
        </div>

        <div style={{ borderRadius: 14, ...PANEL_GLASS, overflow: 'auto' }}>
          <div style={{ minWidth: 1000 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1.1fr 1fr 1.1fr 1.3fr 0.8fr', gap: 8, padding: '9px 14px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--c-muted2)', ...PANEL_GLASS_HEADER }}>
              <span>Recipient</span><span>Amount</span><span>Memo</span><span>Status</span><span>Reference</span><span>Transaction</span><span>Action</span>
            </div>
            {items.map((item) => {
              const style = STATUS_STYLE[item.status] ?? STATUS_STYLE.pending
              const reclaimable = item.status === 'paid' && msLeft !== null && msLeft <= 0
              return (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1.1fr 1fr 1.1fr 1.3fr 0.8fr', gap: 8, padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,.06)', fontSize: 13, alignItems: 'center' }}>
                  <div>
                    <div>{item.email}</div>
                    {item.status === 'paid' && msLeft !== null && (
                      <div style={{ fontSize: 11, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', color: msLeft <= 86400000 ? '#f5b748' : 'var(--c-muted2)' }}>
                        {msLeft > 0 ? `${formatCountdown(msLeft)} left to claim` : 'Claim window closed'}
                      </div>
                    )}
                  </div>
                  <span style={{ fontFamily: 'monospace' }}>{item.amount.toFixed(2)}</span>
                  <span style={{ color: 'var(--c-muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.note || '—'}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: style.bg, color: style.fg, width: 'fit-content' }}>{style.label}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--c-muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.reference_code ?? '—'}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--c-muted2)' }}>
                    {item.claim_tx_hash ? `${item.claim_tx_hash.slice(0, 8)}…${item.claim_tx_hash.slice(-6)}` : '—'}
                  </span>
                  <span>
                    {reclaimable && (
                      <button
                        onClick={() => reclaim(item.id)}
                        disabled={reclaimingId === item.id}
                        style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(245,183,72,.4)', background: 'rgba(245,183,72,.1)', color: '#f5b748', cursor: reclaimingId === item.id ? 'default' : 'pointer' }}
                      >
                        {reclaimingId === item.id ? 'Sending…' : 'Reclaim'}
                      </button>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {error && <p style={{ fontSize: 13, color: '#fb6f84', marginTop: 14 }}>{error}</p>}
      </div>
    )
  }

  return (
    <div>
      {tabs}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        {/* ── Left column ── */}
        <div style={{ flex: '1 1 480px', minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 4px' }}>New payroll run</h1>
          <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 18 }}>
            Pay your team by email. Each person gets their own Claim Box — funds move only when they claim with their own signature.
          </p>

          <div style={{ borderRadius: 16, ...PANEL_GLASS, padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--c-muted2)', marginBottom: 6 }}>Pay period</label>
              <input
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="2026-07"
                style={{ width: '100%', background: 'var(--c-input, rgba(255,255,255,.05))', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '8px 10px', color: 'var(--c-text)', fontSize: 13, fontFamily: 'monospace' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--c-muted2)', marginBottom: 6 }}>Claim window</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={1}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: '100%', background: 'var(--c-input, rgba(255,255,255,.05))', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '8px 10px', color: 'var(--c-text)', fontSize: 13 }}
                />
                <span style={{ fontSize: 13, color: 'var(--c-muted2)' }}>days</span>
              </div>
            </div>
            <p style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--c-muted2)', margin: 0 }}>
              After the claim window closes you can reclaim anything unclaimed. Default 14 days.
            </p>
          </div>

          <div style={{ borderRadius: 16, ...PANEL_GLASS, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{rows.length} recipient{rows.length === 1 ? '' : 's'}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', cursor: 'pointer' }}>
                  Upload CSV
                  <input type="file" accept=".csv" onChange={handleCsvUpload} style={{ display: 'none' }} />
                </label>
                <button
                  onClick={() => setRows((prev) => [...prev, emptyRow()])}
                  style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: 'var(--c-text)', cursor: 'pointer' }}
                >
                  + Add row
                </button>
              </div>
            </div>

            {csvData && (
              <div style={{ borderRadius: 12, border: '1px solid rgba(129,140,248,.35)', background: 'rgba(99,102,241,.06)', padding: 14, marginBottom: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Which column is which?</p>
                <p style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 10 }}>
                  {csvData.length} row{csvData.length > 1 ? 's' : ''} found. Pick the column letter for each field — nothing is imported until you confirm.
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--c-muted2)', marginBottom: 10 }}>
                  <input type="checkbox" checked={csvHasHeader} onChange={(e) => setCsvHasHeader(e.target.checked)} />
                  First row is a header (not a real recipient)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                  {(['email', 'amount', 'note'] as const).map((field) => (
                    <div key={field}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--c-muted2)', marginBottom: 4 }}>
                        {field === 'email' ? 'Email column' : field === 'amount' ? 'Amount column' : 'Note (optional)'}
                      </div>
                      <select
                        value={colMap[field]}
                        onChange={(e) => setColMap((prev) => ({ ...prev, [field]: e.target.value }))}
                        style={{ width: '100%', background: 'var(--c-panel)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 6, padding: '6px 8px', color: 'var(--c-text)', fontSize: 13 }}
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
                      height: 32, padding: '0 14px', borderRadius: 8, border: 'none', fontSize: 12.5, fontWeight: 600,
                      background: !colMap.email || !colMap.amount ? 'rgba(129,140,248,.3)' : 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)',
                      color: '#fff', cursor: !colMap.email || !colMap.amount ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Import {csvHasHeader ? csvData.length - 1 : csvData.length} row{(csvHasHeader ? csvData.length - 1 : csvData.length) !== 1 ? 's' : ''}
                  </button>
                  <button
                    onClick={() => setCsvData(null)}
                    style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: 'var(--c-muted)', fontSize: 12.5, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,.07)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1.5fr) 118px minmax(90px,1.1fr) 28px', gap: 8, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--c-muted2)', padding: '7px 10px', background: 'var(--c-input, rgba(255,255,255,.04))' }}>
                <span>Email</span><span>Amount</span><span>Memo (on-chain)</span><span />
              </div>
              {validated.map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1.5fr) 118px minmax(90px,1.1fr) 28px', gap: 8, padding: '7px 10px', borderTop: '1px solid rgba(255,255,255,.06)', alignItems: 'center' }}>
                  <input
                    value={row.email}
                    onChange={(e) => updateRow(i, { email: e.target.value })}
                    placeholder="employee@company.com"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    name={`payroll-email-${i}-noautofill`}
                    style={{ background: 'transparent', border: row.error && !row.email ? '1px solid #fb6f84' : '1px solid transparent', borderRadius: 6, padding: '4px 6px', color: 'var(--c-text)', fontSize: 13, minWidth: 0 }}
                  />
                  <div style={{ position: 'relative' }}>
                    <input
                      value={row.amount}
                      onChange={(e) => handleAmountChange(i, e.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                      autoComplete="off"
                      name={`payroll-amount-${i}-noautofill`}
                      style={{
                        width: '100%', background: 'transparent',
                        border: amountFlash === i ? '1px solid #fb6f84' : row.error && row.email ? '1px solid #fb6f84' : '1px solid transparent',
                        borderRadius: 6, padding: '4px 40px 4px 6px', color: 'var(--c-text)', fontSize: 13, fontFamily: 'monospace', textAlign: 'right', minWidth: 0,
                        transition: 'border-color .15s',
                      }}
                    />
                    <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, fontWeight: 600, color: 'var(--c-muted2)', pointerEvents: 'none' }}>
                      USDC
                    </span>
                  </div>
                  <input
                    value={row.note}
                    onChange={(e) => updateRow(i, { note: e.target.value })}
                    placeholder="optional — written on-chain"
                    autoComplete="off"
                    name={`payroll-note-${i}-noautofill`}
                    style={{ background: 'transparent', border: '1px solid transparent', borderRadius: 6, padding: '4px 6px', color: 'var(--c-text)', fontSize: 13, minWidth: 0 }}
                  />
                  <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: 'var(--c-muted2)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
              ))}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files?.[0]
                  if (file) handleCsvUpload({ target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>)
                }}
                style={{ borderTop: '1px dashed rgba(255,255,255,.14)', padding: '10px 12px', textAlign: 'center', fontSize: 11.5, color: 'var(--c-muted2)' }}
              >
                Drop a CSV here — columns: email, amount, note
              </div>
            </div>

            {validated.some((r) => r.error === 'Duplicate email in this run') && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
                <p style={{ fontSize: 12, color: '#fb6f84', margin: 0 }}>
                  Duplicate email in this run — each duplicate would pay into the same claim box.
                </p>
                <button
                  onClick={dedupeRows}
                  style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(251,111,132,.4)', background: 'rgba(251,111,132,.1)', color: '#fb6f84', cursor: 'pointer' }}
                >
                  Fix duplicates
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Right rail ── */}
        <div style={{ flex: '0 1 380px', minWidth: 300 }}>
          <div style={{ position: 'sticky', top: 20 }}>
            <div
              style={{
                borderRadius: 20,
                background: 'var(--glass-bg, rgba(28,24,58,.55))',
                border: '1px solid var(--glass-border, rgba(255,255,255,.1))',
                backdropFilter: 'blur(18px)',
                boxShadow: '0 8px 30px rgba(99,102,241,.2)',
                padding: 20,
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--c-muted2)', marginBottom: 6 }}>Total to fund</div>
              <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '-0.02em', marginBottom: 14 }}>{grandTotal.toFixed(2)} <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--c-muted)' }}>USDC</span></div>
              <SummaryRow label="Recipients" value={String(rows.length)} />
              <SummaryRow label="Pay period" value={period || '—'} />
              <SummaryRow label="Claim window" value={`${expiryDays} days`} />
              <SummaryRow label="Est. network fee" value="~0.42 USDC" />
              <SummaryRow label={`Platform fee (${FEE_BPS / 100}%)`} value={`${fee.toFixed(4)} USDC`} />

              {error && <p style={{ fontSize: 12.5, color: '#fb6f84', margin: '10px 0 0' }}>{error}</p>}

              <button
                disabled={hasErrors}
                onClick={() => {
                  // Freeze exactly what will be submitted at this instant — the
                  // confirm drawer and the actual API call both read from this
                  // snapshot, not the live inputs, so nothing (autofill, a stray
                  // edit) can silently change what gets paid after this point.
                  setReviewSnapshot(rows.map((r) => ({ ...r })))
                  setShowConfirm(true)
                }}
                style={{
                  width: '100%', height: 42, marginTop: 14, borderRadius: 10, border: 'none',
                  background: hasErrors ? 'rgba(129,140,248,.3)' : 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)',
                  color: '#fff', fontSize: 14, fontWeight: 600, cursor: hasErrors ? 'not-allowed' : 'pointer',
                }}
              >
                Review & pay
              </button>
              {hasErrors && (
                <p style={{ fontSize: 11.5, color: 'var(--c-muted2)', marginTop: 8, textAlign: 'center' }}>
                  Add at least one recipient with an email and amount.
                </p>
              )}
            </div>

            <div style={{ borderRadius: 16, ...PANEL_GLASS, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>How Claim Box works</div>
              {[
                'Each recipient gets a dedicated on-chain box, computed from their email — no address to type.',
                'Only their own signature can release the funds inside it.',
                'They need no wallet app, no MetaMask, and pay no gas to claim.',
                'Anything unclaimed after the window closes can be reclaimed by you.',
              ].map((bullet) => (
                <div key={bullet} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--c-muted)', marginBottom: 8, lineHeight: 1.4 }}>
                  <span style={{ color: '#818cf8', flexShrink: 0 }}>•</span>
                  <span>{bullet}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── History: every past run for this company, real status per run ── */}
      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--c-muted2)', marginBottom: 10 }}>
          Payroll history
        </div>
        {historyLoading && <p style={{ fontSize: 13, color: 'var(--c-muted)' }}>Loading…</p>}
        {!historyLoading && history.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--c-muted)' }}>No payroll runs yet.</p>
        )}
        {!historyLoading && history.length > 0 && (
          <div style={{ borderRadius: 14, ...PANEL_GLASS, overflow: 'auto' }}>
            <div style={{ minWidth: 760 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8, padding: '9px 14px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--c-muted2)', ...PANEL_GLASS_HEADER }}>
                <span>Period</span><span>Sent</span><span>Recipients</span><span>Status</span><span>Claimed</span>
              </div>
              {history.map((h) => {
                const runStatusStyle = h.status === 'paid'
                  ? { bg: 'rgba(45,212,191,.16)', fg: '#2dd4bf', label: 'Paid' }
                  : h.status === 'failed'
                    ? { bg: 'rgba(251,111,132,.16)', fg: '#fb6f84', label: 'Failed' }
                    : { bg: 'rgba(156,152,194,.14)', fg: 'var(--c-muted)', label: 'Draft' }
                return (
                  <button
                    key={h.id}
                    onClick={async () => { await loadRun(h.id) }}
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8, width: '100%',
                      padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,.06)', fontSize: 13,
                      alignItems: 'center', background: 'none', border: 'none', borderTopWidth: '1px', color: 'var(--c-text)',
                      textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ fontFamily: 'monospace' }}>{h.period}</span>
                    <span style={{ color: 'var(--c-muted2)' }}>{h.paid_at ? new Date(h.paid_at).toLocaleDateString() : '—'}</span>
                    <span>{h.recipientCount}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: runStatusStyle.bg, color: runStatusStyle.fg, width: 'fit-content' }}>
                      {runStatusStyle.label}
                    </span>
                    <span style={{ color: 'var(--c-muted2)' }}>{h.claimedCount}/{h.recipientCount}{h.reclaimedCount > 0 ? ` · ${h.reclaimedCount} reclaimed` : ''}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
      <span style={{ color: 'var(--c-muted2)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600, fontFamily: 'monospace' }}>{value}</span>
    </div>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ borderRadius: 14, background: 'var(--c-panel)', border: '1px solid rgba(255,255,255,.07)', padding: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--c-muted2)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--c-muted2)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Employee · Claim inbox
// ════════════════════════════════════════════════════════════════

interface ClaimItem {
  id: string
  email: string
  amount: number
  note: string | null
  status: 'paid' | 'claiming' | 'claimed' | 'reclaiming' | 'reclaimed'
  created_at: string
  period: string | null
  deadlineAt: number | null
  company: string
  companyVerified: boolean
  claim_tx_hash?: string | null
  reference_code?: string | null
}

function EmployeeClaimInbox({ tabs }: { tabs: React.ReactNode }) {
  const now = useNow()
  const [items, setItems] = useState<ClaimItem[]>([])
  const [loading, setLoading] = useState(true)
  const [signItem, setSignItem] = useState<ClaimItem | null>(null)
  const [signPhase, setSignPhase] = useState<'idle' | 'signing' | 'claiming' | 'done'>('idle')
  const [signTx, setSignTx] = useState<string | null>(null)
  const [signError, setSignError] = useState<string | null>(null)
  const [balanceBump, setBalanceBump] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/payroll/claim/claim', { headers: await authHeader() })
    const data = await res.json()
    setItems(data.items ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const ready = items.filter((i) => i.status === 'paid')
  const history = items.filter((i) => i.status === 'claimed' || i.status === 'reclaimed')
  const balance = ready.reduce((sum, i) => sum + i.amount, 0)

  function openSign(item: ClaimItem) {
    setSignItem(item)
    setSignPhase('idle')
    setSignTx(null)
    setSignError(null)
  }

  async function confirmClaim() {
    if (!signItem) return
    setSignPhase('signing')
    try {
      const res = await fetch('/api/payroll/claim/claim', {
        method: 'POST',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: signItem.id }),
      })
      // The API does the full sign+submit+confirm in one call — "signing"
      // then "claiming" here are just the two phases of that same wait,
      // shown in sequence so the copy stays accurate without a second call.
      setSignPhase('claiming')
      const data = await res.json()
      if (!res.ok) {
        setSignError(data.error ?? 'Claim failed')
        setSignPhase('idle')
        return
      }
      setSignTx(data.txHash)
      setSignPhase('done')
      setBalanceBump(true)
      setTimeout(() => setBalanceBump(false), 900)
      await load()
    } catch {
      setSignError('Network error')
      setSignPhase('idle')
    }
  }

  const totalClaimed = history.filter((i) => i.status === 'claimed').reduce((sum, i) => sum + i.amount, 0)
  const totalUnclaimed = balance
  const bySource = new Map<string, { amount: number; verified: boolean }>()
  for (const item of items) {
    if (item.status !== 'claimed' && item.status !== 'paid') continue
    const s = bySource.get(item.company) ?? { amount: 0, verified: item.companyVerified }
    s.amount += item.amount
    bySource.set(item.company, s)
  }
  const topSources = Array.from(bySource.entries())
    .map(([company, s]) => ({ company, ...s }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)

  return (
    <div>
      {tabs}

      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 2px' }}>Your pay</h1>
      <p style={{ fontSize: 12.5, color: 'var(--c-muted2)', marginBottom: 20 }}>
        Signed in as {items[0]?.email ?? '…'}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        {/* ── Left column ── */}
        <div style={{ flex: '1 1 460px', minWidth: 0 }}>
      {loading && <p style={{ fontSize: 13, color: 'var(--c-muted)' }}>Loading…</p>}

      {!loading && ready.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--c-muted2)', marginBottom: 10 }}>
            Ready to claim
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
            {ready.map((item) => (
              <div
                key={item.id}
                style={{
                  borderRadius: 16,
                  background: 'var(--glass-bg, rgba(28,24,58,.5))',
                  border: '1px solid var(--glass-border, rgba(255,255,255,.09))',
                  backdropFilter: 'blur(14px)',
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#818cf8,#4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {item.company.slice(0, 1).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{item.company}</span>
                  {item.companyVerified && <VerifiedBadge size="sm" />}
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '-0.02em', marginBottom: 4 }}>
                      {item.amount.toFixed(2)} <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-muted)' }}>USDC</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--c-muted2)', marginBottom: 8 }}>
                      Pay period {item.period ?? '—'}{item.note ? ` · ${item.note}` : ''}
                    </div>
                    {item.deadlineAt !== null && (() => {
                      const msLeft = item.deadlineAt! - now
                      const urgent = msLeft <= 24 * 60 * 60 * 1000
                      return (
                        <div
                          style={{
                            display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
                            fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums',
                            background: urgent ? 'rgba(245,183,72,.16)' : 'rgba(156,152,194,.14)',
                            color: urgent ? '#f5b748' : 'var(--c-muted)',
                          }}
                        >
                          {msLeft > 0 ? `${formatCountdown(msLeft)} left` : 'Window closing'}
                        </div>
                      )
                    })()}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <button
                      onClick={() => openSign(item)}
                      style={{
                        height: 38, padding: '0 22px', borderRadius: 10, border: 'none',
                        background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)',
                        color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      Claim
                    </button>
                    <p style={{ fontSize: 11, color: 'var(--c-muted2)', marginTop: 6 }}>
                      No fees · instant
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && history.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--c-muted2)', marginBottom: 10 }}>
            History
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
            {history.map((item) => (
              <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, borderRadius: 10, background: 'var(--c-panel)', padding: '10px 14px', fontSize: 12.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  {item.status === 'claimed' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#2dd4bf' }}>✓</span>
                      <span>Claimed {item.amount.toFixed(2)} USDC from <strong>{item.company}</strong></span>
                      {item.companyVerified && <VerifiedBadge size="sm" />}
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#f5b748' }}>⚠</span>
                      <span>Reclaimed — {item.company} took it back, window closed</span>
                    </span>
                  )}
                  {item.claim_tx_hash && (
                    <a
                      href={`https://testnet.arcscan.app/tx/${item.claim_tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--c-muted2)', fontFamily: 'monospace', textDecoration: 'underline', flexShrink: 0 }}
                    >
                      {item.claim_tx_hash.slice(0, 8)}…{item.claim_tx_hash.slice(-6)}
                    </a>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--c-muted2)', paddingLeft: 22 }}>
                  {item.period ? `Pay period ${item.period}` : null}
                  {item.note && ` · ${item.note}`}
                  {item.reference_code && (
                    <span style={{ fontFamily: 'monospace' }}> · {item.reference_code}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && ready.length === 0 && history.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--c-muted)' }}>Nothing waiting right now.</p>
      )}

      <p style={{ fontSize: 12, color: 'var(--c-muted2)', lineHeight: 1.5, borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: 16 }}>
        Your pay sits in a box only you can open — MironPay and your employer can&apos;t move it once it&apos;s sent.
        If you don&apos;t claim before the deadline, your employer can take it back and re-send it.
      </p>
        </div>

        {/* ── Right rail: claimed/unclaimed totals + top sources ── */}
        <div style={{ flex: '0 1 320px', minWidth: 260 }}>
          <div style={{ position: 'sticky', top: 20 }}>
            <div style={{ borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(255,255,255,.07)', padding: 18, marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--c-muted2)', marginBottom: 6 }}>Unclaimed</div>
              <div
                style={{
                  fontSize: 24, fontWeight: 700, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', marginBottom: 14,
                  color: balanceBump ? '#2dd4bf' : 'var(--c-text)', transition: 'color .4s ease',
                }}
              >
                {totalUnclaimed.toFixed(2)} <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-muted)' }}>USDC</span>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--c-muted2)', marginBottom: 6 }}>Total claimed</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                  {totalClaimed.toFixed(2)} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>USDC</span>
                </div>
              </div>
            </div>

            <div style={{ borderRadius: 16, background: 'var(--c-panel)', padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Top pay sources</div>
              {topSources.length === 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>No income yet.</p>
              )}
              {topSources.map((s, i) => (
                <div key={s.company} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i === topSources.length - 1 ? 0 : 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#818cf8,#4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {s.company.slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.company}
                      {s.verified && <VerifiedBadge size="sm" />}
                    </div>
                  </div>
                  <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>{s.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {signItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay, rgba(6,4,16,.74))', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ width: 390, maxWidth: '100%', borderRadius: 20, background: 'var(--c-panel)', border: '1px solid rgba(255,255,255,.08)', padding: 26, color: 'var(--c-text)', textAlign: 'center' }}>
            {signPhase === 'idle' && (
              <>
                <div style={{ width: 44, height: 44, margin: '0 auto 14px', borderRadius: '50%', background: 'rgba(99,102,241,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l7-7 3 3-7 7-3-3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path strokeLinecap="round" d="M2 2l7.5 7.5" /></svg>
                </div>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Confirm it&apos;s you</h2>
                <p style={{ fontSize: 12.5, color: 'var(--c-muted)', marginBottom: 16 }}>
                  One tap approves this claim. No password, no fees.
                </p>
                <div style={{ borderRadius: 12, background: 'var(--c-input, rgba(255,255,255,.05))', padding: 12, marginBottom: 18, fontSize: 12.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span style={{ color: 'var(--c-muted2)' }}>{signItem.company} · {signItem.period ?? '—'}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{signItem.amount.toFixed(2)} USDC</span>
                  </div>
                </div>
                {signError && <p style={{ fontSize: 12.5, color: '#fb6f84', marginBottom: 12 }}>{signError}</p>}
                <button
                  onClick={confirmClaim}
                  style={{ width: '100%', height: 44, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', color: '#fff', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}
                >
                  Confirm claim
                </button>
                <button onClick={() => setSignItem(null)} style={{ width: '100%', height: 36, borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--c-muted)', fontSize: 13, cursor: 'pointer' }}>
                  Not now
                </button>
              </>
            )}

            {(signPhase === 'signing' || signPhase === 'claiming') && (
              <div style={{ padding: '18px 0' }}>
                <div style={{ width: 40, height: 40, margin: '0 auto 16px', borderRadius: '50%', border: '3px solid #818cf8', borderTopColor: 'transparent', animation: 'mp-spin 0.7s linear infinite' }} />
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                  {signPhase === 'signing' ? 'Confirming…' : 'Sending to your wallet'}
                </h2>
                <p style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>
                  {signPhase === 'signing' ? 'Approving your claim securely.' : 'This takes a few seconds.'}
                </p>
                <style>{`@keyframes mp-spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}

            {signPhase === 'done' && (
              <div style={{ padding: '6px 0' }}>
                <div style={{ width: 52, height: 52, margin: '0 auto 16px', borderRadius: '50%', background: 'rgba(45,212,191,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'mp-pop .35s ease' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{signItem.amount.toFixed(2)} USDC received</h2>
                <p style={{ fontSize: 12.5, color: 'var(--c-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  From <strong style={{ color: 'var(--c-text)' }}>{signItem.company}</strong>
                  {signItem.companyVerified && <VerifiedBadge size="sm" />}
                </p>
                <p style={{ fontSize: 12.5, color: 'var(--c-muted)', marginBottom: 14 }}>It&apos;s in your wallet now.</p>
                {signTx && (
                  <a
                    href={`https://testnet.arcscan.app/tx/${signTx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'block', fontSize: 12, fontFamily: 'monospace', color: 'var(--c-muted2)', textDecoration: 'underline', marginBottom: 18 }}
                  >
                    {signTx.slice(0, 10)}…{signTx.slice(-6)}
                  </a>
                )}
                <button onClick={() => setSignItem(null)} style={{ width: '100%', height: 40, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                  Done
                </button>
                <style>{`@keyframes mp-pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}`}</style>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Settings · Verification
// ════════════════════════════════════════════════════════════════

interface CompanyProfile {
  legal_name?: string | null
  registration_number?: string | null
  email_domain?: string | null
  verification_status: 'none' | 'pending' | 'verified'
  submitted_at?: string | null
  verified_at?: string | null
}

function SettingsVerification({ tabs }: { tabs: React.ReactNode }) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [legalName, setLegalName] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [emailDomain, setEmailDomain] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Forces the editable form to render even when status is 'pending' or
  // 'verified' — those states normally show a read-only summary instead.
  const [editing, setEditing] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/company/verify', { headers: await authHeader() })
    const data = await res.json()
    setProfile(data.profile)
    setLegalName(data.profile?.legal_name ?? '')
    setRegistrationNumber(data.profile?.registration_number ?? '')
    setEmailDomain(data.profile?.email_domain ?? '')
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function submit() {
    setError(null)
    if (!legalName.trim()) return setError('Legal entity name is required')
    setSubmitting(true)
    try {
      const res = await fetch('/api/company/verify', {
        method: 'POST',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalName: legalName.trim(),
          registrationNumber: registrationNumber.trim(),
          emailDomain: emailDomain.trim() ? emailDomain.trim().replace(/^@/, '') : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Submission failed')
      } else {
        setProfile(data.profile)
        setEditing(false)
      }
    } catch {
      setError('Network error')
    }
    setSubmitting(false)
  }

  const status = profile?.verification_status ?? 'none'
  const previewName = legalName.trim() || 'Your Company'

  if (loading) {
    return (
      <div>
        {tabs}
        <div style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</div>
      </div>
    )
  }

  return (
    <div>
      {tabs}
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 4px' }}>Business verification</h1>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 20 }}>
        A one-time review that tells your team the payroll email really came from you.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,420px),1fr))', gap: 20 }}>
        {/* ── Left: form / status card ── */}
        <div style={{ borderRadius: 16, background: 'var(--c-panel)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Verification status</span>
            {status === 'pending' && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(156,152,194,.16)', color: 'var(--c-muted)' }}>Under review</span>
            )}
            {status === 'verified' && <VerifiedBadge size="md" />}
          </div>

          {(status === 'none' || editing) && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--c-muted2)', marginBottom: 6 }}>Legal entity name</label>
                <input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="MironPay Inc."
                  style={{ width: '100%', background: 'var(--c-input, rgba(255,255,255,.05))', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '9px 11px', color: 'var(--c-text)', fontSize: 13 }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--c-muted2)', marginBottom: 6 }}>Business registration / tax number (optional)</label>
                <input
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  placeholder="0312345678"
                  style={{
                    width: '100%', background: 'var(--c-input, rgba(255,255,255,.05))',
                    border: '1px solid rgba(255,255,255,.1)',
                    borderRadius: 8, padding: '9px 11px', color: 'var(--c-text)', fontSize: 13, fontFamily: 'monospace',
                  }}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--c-muted2)', marginBottom: 6 }}>Company email domain (optional)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--c-muted2)', fontSize: 13 }}>@</span>
                  <input
                    value={emailDomain}
                    onChange={(e) => setEmailDomain(e.target.value)}
                    placeholder="mironpay.xyz"
                    style={{ flex: 1, background: 'var(--c-input, rgba(255,255,255,.05))', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '9px 11px', color: 'var(--c-text)', fontSize: 13 }}
                  />
                </div>
              </div>
              {error && <p style={{ fontSize: 12.5, color: '#fb6f84', marginBottom: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                {editing && (
                  <button
                    onClick={() => {
                      setEditing(false)
                      setError(null)
                      setLegalName(profile?.legal_name ?? '')
                      setRegistrationNumber(profile?.registration_number ?? '')
                      setEmailDomain(profile?.email_domain ?? '')
                    }}
                    style={{ flex: 1, height: 42, borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: 'var(--c-muted)', fontSize: 14, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={submit}
                  disabled={submitting}
                  style={{
                    flex: editing ? 1.4 : 1, height: 42, borderRadius: 10, border: 'none',
                    background: submitting ? 'rgba(129,140,248,.4)' : 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)',
                    color: '#fff', fontSize: 14, fontWeight: 600, cursor: submitting ? 'default' : 'pointer',
                  }}
                >
                  {submitting ? 'Saving…' : editing ? 'Save changes' : 'Submit for verification'}
                </button>
              </div>
            </>
          )}

          {status === 'pending' && !editing && (
            <>
              <SummaryRow label="Legal entity" value={profile?.legal_name ?? '—'} />
              <SummaryRow label="Registration number" value={profile?.registration_number ?? '—'} />
              <SummaryRow label="Email domain" value={profile?.email_domain ? `@${profile.email_domain}` : '—'} />
              <SummaryRow label="Submitted" value={profile?.submitted_at ? new Date(profile.submitted_at).toLocaleDateString() : '—'} />
              <p style={{ fontSize: 12.5, color: 'var(--c-muted)', margin: '14px 0 18px', lineHeight: 1.5 }}>
                Reviewed by hand, usually within two business days. Nothing else needed from you right now.
              </p>
              <button onClick={() => setEditing(true)} style={{ width: '100%', height: 42, borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: 'var(--c-text)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Edit info
              </button>
            </>
          )}

          {status === 'verified' && !editing && (
            <>
              <div style={{ borderRadius: 12, background: 'rgba(45,212,191,.1)', border: '1px solid rgba(45,212,191,.25)', padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <VerifiedBadge size="sm" />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2dd4bf' }}>Verified business</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--c-muted)', margin: 0 }}>
                  Verified on {profile?.verified_at ? new Date(profile.verified_at).toLocaleDateString() : '—'}
                </p>
              </div>
              <SummaryRow label="Legal entity" value={profile?.legal_name ?? '—'} />
              <SummaryRow label="Registration number" value={profile?.registration_number ?? '—'} />
              <SummaryRow label="Email domain" value={profile?.email_domain ? `@${profile.email_domain}` : '—'} />
              <p style={{ fontSize: 12, color: 'var(--c-muted2)', margin: '14px 0 18px', lineHeight: 1.5 }}>
                The tick appears next to your name in every claim email your employees receive.
              </p>
              <button onClick={() => setEditing(true)} style={{ width: '100%', height: 42, borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: 'var(--c-text)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Edit info
              </button>
            </>
          )}
        </div>

        {/* ── Right: live email preview ── */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--c-muted2)', marginBottom: 10 }}>
            Claim email preview
          </div>
          <div style={{ borderRadius: 14, background: '#eef1f6', padding: 20 }}>
            <div style={{ maxWidth: 420, margin: '0 auto', background: '#ffffff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e3e7ef' }}>
              <div style={{ background: '#ffffff', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e3e7ef' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo/miron-logo-lockup-horizontal-light.png" alt="MironPay" style={{ height: 30, width: 'auto' }} />
                <span style={{ color: '#667085', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', background: '#f5f7fb', borderRadius: 999, padding: '4px 9px' }}>Payroll</span>
              </div>
              <div style={{ padding: '22px 20px 8px' }}>
                <p style={{ color: '#98a2b3', fontSize: 11, margin: '0 0 10px' }}>to employee@company.com</p>
                <p style={{ color: '#475467', fontSize: 13, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  You&rsquo;ve been paid by <strong style={{ color: '#0d1526' }}>{previewName}</strong>
                  {status === 'verified' && (
                    <span style={{ width: 13, height: 13, borderRadius: '50%', background: '#6366f1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>
                    </span>
                  )}
                </p>
                <p style={{ color: '#667085', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', margin: '0 0 6px' }}>Pay period: {defaultPeriod()}</p>
                <p style={{ color: '#0d1526', fontSize: 28, fontWeight: 700, margin: '0 0 6px' }}>0.00 USDC</p>
                <p style={{ color: '#98a2b3', fontSize: 11, margin: '0 0 16px' }}>
                  Payment reference: <span style={{ fontFamily: "'Courier New', monospace", color: '#667085', fontWeight: 700 }}>PAYROLLXXXXXXX</span>
                </p>
                <div style={{ background: '#6366f1', borderRadius: 10, textAlign: 'center', padding: '12px 0', marginBottom: 16 }}>
                  <span style={{ color: '#fff', fontSize: 13.5, fontWeight: 700 }}>Claim your pay</span>
                </div>
                <p style={{ color: '#98a2b3', fontSize: 10.5, borderTop: '1px solid #e3e7ef', paddingTop: 14, margin: 0 }}>
                  Claim window closes in 14 days.
                </p>
              </div>
            </div>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--c-muted2)', marginTop: 10, lineHeight: 1.5 }}>
            Not verified → the exact same email, no tick, and never any &ldquo;unverified&rdquo; label — employees never see a warning.
          </p>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Shell: one page, tab switching is client-side state only
// ════════════════════════════════════════════════════════════════

export default function PayrollClaimApp({ initialRole }: { initialRole: PayrollClaimRole }) {
  const [role, setRole] = useState<PayrollClaimRole>(initialRole)
  const tabs = <PayrollClaimTabs role={role} onChange={setRole} />

  return (
    <div style={{ padding: 24, color: 'var(--c-text)', maxWidth: 1160, margin: '0 auto' }}>
      <Link href="/payroll" style={{ fontSize: 12, color: 'var(--c-muted2)', textDecoration: 'none' }}>← Payroll</Link>
      <div style={{ marginTop: 10 }}>
        {role === 'company' && <CompanyRunPayroll tabs={tabs} />}
        {role === 'employee' && <EmployeeClaimInbox tabs={tabs} />}
        {role === 'settings' && <SettingsVerification tabs={tabs} />}
      </div>
    </div>
  )
}
