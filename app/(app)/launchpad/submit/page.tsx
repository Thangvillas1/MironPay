'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { isOnboardingComplete } from '@/app/lib/onboarding'

const LISTING_FEE_USDC = 50

// No color picker — project accent is auto-assigned from this palette
// (deterministic by project name), so submitters never have to think about it.
const ACCENT_PALETTE = ['#6366f1', '#8b7cff', '#22c6e0', '#2dd4bf', '#f5b748', '#fb6f84', '#818cf8']
function hashAccent(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return ACCENT_PALETTE[h % ACCENT_PALETTE.length]
}

// Splits only on the first " - " so hyphens inside names or detail text
// (e.g. "Jean-Paul", "no lock-up period") don't get chopped up.
function splitOnceOnDash(line: string): [string, string] {
  const idx = line.indexOf(' - ')
  if (idx === -1) return [line.trim(), '']
  return [line.slice(0, idx).trim(), line.slice(idx + 3).trim()]
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11, color: 'var(--c-muted2)' }}>{hint}</p>}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingTop: 22, marginTop: 22, borderTop: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--c-muted2)' }}>{title}</div>
        {subtitle && <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 3 }}>{subtitle}</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)',
  background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 14, outline: 'none', width: '100%',
}
const textareaStyle: React.CSSProperties = { ...inputStyle, height: 80, padding: 12, resize: 'vertical' as const, fontFamily: 'inherit' }

export default function LaunchpadSubmitPage() {
  const router = useRouter()
  const [accessToken, setAccessToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [hasPIN, setHasPIN] = useState(false)

  // ── Project info ──────────────────────────────────────────────────────────
  const [name, setName] = useState('')
  const [sym, setSym] = useState('')
  const [mark, setMark] = useState('')
  const [category, setCategory] = useState('')
  const [tagline, setTagline] = useState('')
  const [blurb, setBlurb] = useState('')
  const [highlights, setHighlights] = useState('')

  // ── Tokenomics ────────────────────────────────────────────────────────────
  const [supply, setSupply] = useState('')
  const [tokenomicsText, setTokenomicsText] = useState('') // "Label, Percent" per line

  // ── Sale details ──────────────────────────────────────────────────────────
  const [price, setPrice] = useState('')
  const [target, setTarget] = useState('')
  const [cap, setCap] = useState('')
  const [minContribution, setMinContribution] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')

  // ── Additional info (optional) ────────────────────────────────────────────
  const [teamText, setTeamText] = useState('') // "Name - Role" per line
  const [backersText, setBackersText] = useState('') // comma separated
  const [vestingText, setVestingText] = useState('') // "Milestone - Detail" per line, last line = fully unlocked
  const [audit, setAudit] = useState('')
  const [website, setWebsite] = useState('')
  const [twitter, setTwitter] = useState('')
  const [discord, setDiscord] = useState('')
  const [docsUrl, setDocsUrl] = useState('')

  const [showPin, setShowPin] = useState(false)
  const [pin, setPin] = useState('')
  const pinRef = useRef('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ projectId: string; feeTxHash: string | null } | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/'); return }
      if (!(await isOnboardingComplete(session.user.id))) { router.replace('/'); return }
      setAccessToken(session.access_token)
      const { data: profile } = await supabase.from('profiles').select('pin_hash').eq('id', session.user.id).single()
      setHasPIN(!!profile?.pin_hash)
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-page)' }}>
        <p style={{ fontSize: 14, color: 'var(--c-muted)' }}>Loading...</p>
      </div>
    )
  }

  const accent = hashAccent(name || sym || 'default')
  const requiredOk = name && sym && mark && category && tagline && blurb && supply && price && target && cap && minContribution && startAt && endAt

  function openPinPad() {
    if (!requiredOk) { setError('Please fill in all required fields.'); return }
    if (!hasPIN) { setError('Set a PIN first from the Wallet page, then come back to submit.'); return }
    setError(''); setPin(''); pinRef.current = ''
    setShowPin(true)
  }

  async function submitWithPin(enteredPin: string) {
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/launchpad/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          pin: enteredPin, name, sym: sym.toUpperCase(), mark: mark.toUpperCase().slice(0, 2), accent, category, tagline, blurb,
          highlights: highlights.split('\n').map(s => s.trim()).filter(Boolean),
          team: teamText.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
            const [n, r] = splitOnceOnDash(l)
            return { name: n, role: r }
          }),
          backers: backersText.split(',').map(s => s.trim()).filter(Boolean),
          tokenomics: tokenomicsText.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
            const [tLabel, tPct] = l.split(',').map(s => s.trim())
            return { label: tLabel, pct: parseFloat(tPct) || 0, color: ACCENT_PALETTE[i % ACCENT_PALETTE.length] }
          }),
          vesting: (() => {
            const lines = vestingText.split('\n').map(l => l.trim()).filter(Boolean)
            return lines.map((l, i) => {
              const [vLabel, vDetail] = splitOnceOnDash(l)
              return { label: vLabel, detail: vDetail, last: i === lines.length - 1 }
            })
          })(),
          socialLinks: { website, twitter, discord, docs: docsUrl },
          price, target, cap, minContribution, supply, audit,
          startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(),
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error ?? 'Submission failed')
        setShowPin(false)
        setSubmitting(false)
        return
      }
      setDone({ projectId: d.projectId, feeTxHash: d.feeTxHash })
      setShowPin(false)
    } catch {
      setError('Connection error — try again')
      setShowPin(false)
    }
    setSubmitting(false)
  }

  function handlePinKey(k: string) {
    if (pinRef.current.length >= 6) return
    pinRef.current += k
    setPin(pinRef.current)
    if (pinRef.current.length === 6) {
      const p = pinRef.current
      setTimeout(() => submitWithPin(p), 200)
    }
  }
  function handlePinDel() {
    pinRef.current = pinRef.current.slice(0, -1)
    setPin(pinRef.current)
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--c-page)', color: 'var(--c-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, margin: '0 auto', borderRadius: '50%', background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="m20 6-11 11-5-5" /></svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 18 }}>Submission received</h1>
          <p style={{ fontSize: 13.5, color: 'var(--c-muted)', marginTop: 8, lineHeight: 1.6 }}>
            Your project (<code>{done.projectId}</code>) is now pending review. We&apos;ll email you once it&apos;s approved and live on the Launchpad.
          </p>
          {done.feeTxHash && (
            <a href={`https://testnet.arcscan.app/tx/${done.feeTxHash}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 14, fontSize: 12.5, color: 'var(--c-indigo-light)' }}>
              View listing fee payment ↗
            </a>
          )}
          <button onClick={() => router.push('/launchpad')} style={{ display: 'block', margin: '24px auto 0', height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Back to Launchpad
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-page)', color: 'var(--c-text)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 34px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, color: '#fff', background: `linear-gradient(140deg, ${accent}, ${accent}bb)`, boxShadow: `0 6px 18px ${accent}55` }}>
            {(mark || sym.slice(0, 2) || '?').toUpperCase()}
          </span>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>Submit your project</h1>
            <p style={{ marginTop: 2, fontSize: 12.5, color: 'var(--c-muted)' }}>Reviewed by the MironPay team. Listing fee ${LISTING_FEE_USDC} USDC, charged on submit.</p>
          </div>
        </div>

        <Section title="Project info">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            <Field label="Project name *"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Helios" /></Field>
            <Field label="Symbol *"><input style={inputStyle} value={sym} onChange={e => setSym(e.target.value)} placeholder="HELI" maxLength={8} /></Field>
            <Field label="Logo letters *"><input style={inputStyle} value={mark} onChange={e => setMark(e.target.value)} placeholder="H" maxLength={2} /></Field>
          </div>
          <Field label="Category *"><input style={inputStyle} value={category} onChange={e => setCategory(e.target.value)} placeholder="RWA · Yield" /></Field>
          <Field label="Tagline * (one sentence)"><input style={inputStyle} value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Tokenized treasury yields, settled instantly in USDC." /></Field>
          <Field label="Full description *"><textarea style={textareaStyle} value={blurb} onChange={e => setBlurb(e.target.value)} /></Field>
          <Field label="Highlights (one per line)"><textarea style={textareaStyle} value={highlights} onChange={e => setHighlights(e.target.value)} placeholder={'Backed 1:1 by T-bills\nYield streams every block'} /></Field>
        </Section>

        <Section title="Tokenomics">
          <Field label="Total token supply *"><input style={inputStyle} value={supply} onChange={e => setSupply(e.target.value)} placeholder="120M" /></Field>
          <Field label="Distribution (one per line: Label, Percent)" hint="Percentages should add up to 100.">
            <textarea style={textareaStyle} value={tokenomicsText} onChange={e => setTokenomicsText(e.target.value)} placeholder={'Public sale, 15\nEcosystem & rewards, 30\nTreasury, 22'} />
          </Field>
        </Section>

        <Section title="Sale details">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Token price (USD) *"><input style={inputStyle} value={price} onChange={e => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.085" /></Field>
            <Field label="Raise target (USD) *"><input style={inputStyle} value={target} onChange={e => setTarget(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="600000" /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Per-wallet min (USD) *"><input style={inputStyle} value={minContribution} onChange={e => setMinContribution(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="25" /></Field>
            <Field label="Per-wallet max (USD) *"><input style={inputStyle} value={cap} onChange={e => setCap(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="2500" /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Sale starts *"><input type="datetime-local" style={inputStyle} value={startAt} onChange={e => setStartAt(e.target.value)} /></Field>
            <Field label="Sale ends *"><input type="datetime-local" style={inputStyle} value={endAt} onChange={e => setEndAt(e.target.value)} /></Field>
          </div>
        </Section>

        <Section title="Additional info" subtitle="Optional — helps build trust, but not required to submit.">
          <Field label="Team (one per line: Name - Role)"><textarea style={textareaStyle} value={teamText} onChange={e => setTeamText(e.target.value)} placeholder={'Lena Park - Founder & CEO\nMarco Diaz - CTO'} /></Field>
          <Field label="Backed by (comma-separated)"><input style={inputStyle} value={backersText} onChange={e => setBackersText(e.target.value)} placeholder="Sapphire Ventures, ARC Labs" /></Field>
          <Field label="Vesting schedule (one per line: Milestone - Detail)" hint="Last line is treated as the fully-unlocked milestone.">
            <textarea style={textareaStyle} value={vestingText} onChange={e => setVestingText(e.target.value)} placeholder={'TGE unlock - 25% released at token listing\n1-month cliff - No further unlocks during cliff\nFully unlocked - about 7 months after TGE'} />
          </Field>
          <Field label="Auditor"><input style={inputStyle} value={audit} onChange={e => setAudit(e.target.value)} placeholder="OtterSec" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Website"><input style={inputStyle} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" /></Field>
            <Field label="X / Twitter"><input style={inputStyle} value={twitter} onChange={e => setTwitter(e.target.value)} placeholder="https://x.com/..." /></Field>
            <Field label="Discord"><input style={inputStyle} value={discord} onChange={e => setDiscord(e.target.value)} placeholder="https://discord.gg/..." /></Field>
            <Field label="Docs"><input style={inputStyle} value={docsUrl} onChange={e => setDocsUrl(e.target.value)} placeholder="https://docs...." /></Field>
          </div>
        </Section>

        {error && <p style={{ fontSize: 13, color: '#fb6f84', marginTop: 20 }}>{error}</p>}

        <button onClick={openPinPad} disabled={submitting} style={{ width: '100%', height: 50, marginTop: 24, borderRadius: 14, border: 'none', background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
          Pay ${LISTING_FEE_USDC} & Submit for review
        </button>
      </div>

      {showPin && (
        <>
          <div onClick={() => !submitting && setShowPin(false)} style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(5px)', zIndex: 60 }} />
          <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(360px,92vw)', zIndex: 61, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.14)', borderRadius: 22, boxShadow: '0 30px 80px rgba(3,8,20,.6)', padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Enter your PIN</div>
            <div style={{ fontSize: 12.5, color: 'var(--c-muted)', marginTop: 5 }}>Authorize the ${LISTING_FEE_USDC} USDC listing fee</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, margin: '22px 0 6px' }}>
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} style={{ width: 13, height: 13, borderRadius: '50%', ...(i < pin.length ? { background: '#6366f1', boxShadow: '0 0 10px rgba(99,102,241,.6)' } : { background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)' }) }} />
              ))}
            </div>
            {submitting ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2.5px solid rgba(99,102,241,.3)', borderTopColor: '#818cf8', animation: 'spin .8s linear infinite' }} />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, maxWidth: 260, margin: '20px auto 0' }}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
                  <button key={i} onClick={k === '⌫' ? handlePinDel : k === '' ? undefined : () => handlePinKey(k)} disabled={k === ''} style={{ height: 48, borderRadius: 12, border: '1px solid rgba(var(--c-fg-rgb),.07)', background: k === '' ? 'transparent' : 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono)', cursor: k === '' ? 'default' : 'pointer', opacity: k === '' ? 0 : 1 }}>
                    {k}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
