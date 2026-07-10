'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { isOnboardingComplete } from '@/app/lib/onboarding'
import VerifiedBadge from '@/app/components/VerifiedBadge'
import { STATUS_PILL, fmtUsd, fmtNum, fmtPrice, initials, teamAccent } from '@/app/lib/launchpad-data'

const WATCHLIST_KEY = 'mp_launchpad_watchlist'

interface ProjectDetail {
  id: string
  name: string; sym: string; mark: string; accent: string; category: string
  tagline: string; blurb: string; highlights: string[]
  team: { name: string; role: string }[]; backersList: string[]
  socialLinks: { website?: string; twitter?: string; discord?: string; docs?: string }
  tokenomics: { label: string; pct: number; color: string }[]
  vesting: { label: string; detail: string; last: boolean }[]
  price: number; target: number; cap: number; minContribution: number
  supply: string; audit: string | null
  startAt: string; endAt: string
  status: 'live' | 'soon' | 'ended'
  raised: number; backers: number
  myContribution: number
  onChainRegistered: boolean
}

function readWatchlist(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY) ?? '{}') } catch { return {} }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
    new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}
function progressPct(p: ProjectDetail): number {
  return p.target ? Math.min(100, Math.round((p.raised || 0) / p.target * 100)) : 0
}

function logoStyle(accent: string, size: number): React.CSSProperties {
  return {
    flexShrink: 0, width: size, height: size, borderRadius: Math.round(size * 0.32),
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: size * 0.42, color: '#fff',
    background: `linear-gradient(140deg, ${accent}, ${accent}bb)`,
    boxShadow: `0 6px 18px ${accent}55`,
  }
}

export default function LaunchpadProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [watched, setWatched] = useState(false)
  const [showAgentPrompt, setShowAgentPrompt] = useState(false)
  const [suggestAmount, setSuggestAmount] = useState('100')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/'); return }
      if (!(await isOnboardingComplete(session.user.id))) { router.replace('/'); return }
      const res = await fetch(`/api/launchpad/sales/${id}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok) setProject(await res.json())
      setWatched(!!readWatchlist()[id])
      setLoading(false)
    }
    init()
  }, [router, id])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-page)' }}>
        <p style={{ fontSize: 14, color: 'var(--c-muted)' }}>Loading...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--c-page)', color: 'var(--c-text)', padding: 34 }}>
        <p style={{ fontSize: 14, color: 'var(--c-muted)' }}>Project not found.</p>
        <button onClick={() => router.push('/launchpad')} style={{ marginTop: 12, fontSize: 13, color: 'var(--c-indigo-light)', background: 'none', border: 'none', cursor: 'pointer' }}>‹ All projects</button>
      </div>
    )
  }

  const pill = STATUS_PILL[project.status]
  const pct = progressPct(project)
  const hasBar = project.status === 'live' || project.status === 'ended'
  const isSoon = project.status === 'soon'
  const isLive = project.status === 'live'
  const scheduleLabel = project.status === 'ended' ? 'Closed' : isSoon ? 'Opens' : 'Sale ends'
  const scheduleVal = project.status === 'ended' ? fmtDate(project.endAt) : isSoon ? fmtDate(project.startAt) : fmtDate(project.endAt)

  function toggleWatch() {
    const wl = readWatchlist()
    const next = !watched
    wl[id] = next
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(wl))
    setWatched(next)
  }

  const suggestedCommand = `Contribute $${suggestAmount || '0'} to ${project.name}`
  function copyCommand() {
    navigator.clipboard.writeText(suggestedCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const S = {
    card: { padding: 22, borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)' } as React.CSSProperties,
    eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--c-muted2)' },
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-page)', color: 'var(--c-text)' }}>
      <style>{`
        .lp-link{transition:background .15s,border-color .15s,transform .15s,color .15s}
        .lp-link:hover{background:var(--c-panel-2)!important;border-color:rgba(var(--c-fg-rgb),.14)!important;transform:translateY(-1px)}
        .lp-back:hover{color:var(--c-text)!important;background:rgba(var(--c-fg-rgb),.05)!important}
        .lp-join:hover{transform:translateY(-1px);filter:brightness(1.06)}
        .lp-join:active{transform:scale(.98)}
      `}</style>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 34px 56px' }}>

        <button className="lp-back" onClick={() => router.push('/launchpad')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px 0 9px', borderRadius: 9, border: '1px solid rgba(var(--c-fg-rgb),.07)', background: 'transparent', color: 'var(--c-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background .15s,color .15s' }}>
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>All projects
        </button>

        {!project.onChainRegistered && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(245,183,72,.1)', border: '1px solid rgba(245,183,72,.25)', color: '#f5b748', fontSize: 12.5 }}>
            This sale hasn&apos;t been registered on-chain yet — contributions aren&apos;t possible until it is.
          </div>
        )}

        {/* header band */}
        <div style={{ position: 'relative', overflow: 'hidden', marginTop: 16, padding: '26px 28px', borderRadius: 20, background: `linear-gradient(150deg, ${project.accent}22, transparent 58%), var(--glass-bg)`, backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', border: '1px solid var(--glass-border)', boxShadow: 'inset 0 1px 0 var(--glass-hi)' }}>
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(420px 200px at 92% -30%, ${project.accent}33, transparent 60%)`, pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 16, minWidth: 0 }}>
              <span style={logoStyle(project.accent, 64)}>{project.mark}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-.01em' }}>{project.name}</span>
                  <VerifiedBadge size="md" />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--c-muted)', padding: '3px 8px', borderRadius: 7, background: 'rgba(var(--c-fg-rgb),.05)' }}>${project.sym}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700, background: pill.bg, color: pill.fg }}>{pill.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9, fontSize: 12.5, color: 'var(--c-muted2)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', height: 23, padding: '0 10px', borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)', color: 'var(--c-muted)', fontWeight: 600 }}>{project.category}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', height: 23, padding: '0 10px', borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)', color: 'var(--c-muted)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>ARC</span>
                </div>
                <div style={{ fontSize: 14, color: 'var(--c-muted)', marginTop: 13, maxWidth: 520, lineHeight: 1.55 }}>{project.tagline}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['website', 'twitter', 'discord', 'docs'] as const).filter(k => project.socialLinks?.[k]).map(k => (
                <a key={k} href={project.socialLinks[k]} target="_blank" rel="noopener noreferrer" className="lp-link" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 11, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)', color: 'var(--c-text)', textDecoration: 'none', fontSize: 11, fontWeight: 700 }}>
                  {k[0].toUpperCase()}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* two columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, marginTop: 20, alignItems: 'start' }}>

          {/* LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            <div style={S.card}>
              <div style={S.eyebrow}>About {project.name}</div>
              <div style={{ fontSize: 14, color: 'var(--c-text)', opacity: .86, lineHeight: 1.65, marginTop: 12 }}>{project.blurb}</div>
              {project.highlights.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
                  {project.highlights.map(h => (
                    <div key={h} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: 'var(--c-muted)' }}>
                      <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M20 6 9 17l-5-5" /></svg>{h}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {project.tokenomics.length > 0 && (
              <div style={S.card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={S.eyebrow}>Tokenomics</span>
                  <span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>Total supply <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--c-text)', fontWeight: 600 }}>{project.supply} {project.sym}</span></span>
                </div>
                <div style={{ display: 'flex', height: 11, borderRadius: 9999, overflow: 'hidden', margin: '16px 0 18px' }}>
                  {project.tokenomics.map(d => <span key={d.label} style={{ width: `${d.pct}%`, background: d.color }} />)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 24px' }}>
                  {project.tokenomics.map(d => (
                    <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 10, height: 10, flexShrink: 0, borderRadius: 3, background: d.color }} />
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--c-muted)' }}>{d.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{d.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {project.vesting.length > 0 && (
              <div style={S.card}>
                <div style={{ ...S.eyebrow, marginBottom: 16 }}>Vesting schedule</div>
                {project.vesting.map((v, i) => (
                  <div key={v.label} style={{ display: 'flex', gap: 14 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ width: 11, height: 11, borderRadius: '50%', flexShrink: 0, marginTop: 3, background: v.last ? '#2dd4bf' : '#6366f1', boxShadow: v.last ? '0 0 8px rgba(43,212,164,.6)' : '0 0 8px rgba(99,102,241,.5)' }} />
                      {!v.last && <span style={{ width: 2, flex: 1, background: 'rgba(var(--c-fg-rgb),.14)', marginTop: 3 }} />}
                    </div>
                    <div style={{ paddingBottom: i === project.vesting.length - 1 ? 0 : 16 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{v.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 2 }}>{v.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(project.team.length > 0 || project.backersList.length > 0) && (
              <div style={S.card}>
                {project.team.length > 0 && (
                  <>
                    <div style={S.eyebrow}>Team</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 14 }}>
                      {project.team.map((m, i) => (
                        <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 12, borderRadius: 13, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
                          <span style={logoStyle(teamAccent(i), 38)}>{initials(m.name)}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--c-muted2)', marginTop: 1 }}>{m.role}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {project.backersList.length > 0 && (
                  <>
                    <div style={{ ...S.eyebrow, marginTop: project.team.length > 0 ? 20 : 0 }}>Backed by</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                      {project.backersList.map((b, i) => (
                        <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 13px', borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: teamAccent(i) }} />{b}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: sale panel */}
          <aside style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: 20, borderRadius: 18, background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', border: '1px solid var(--glass-border)', boxShadow: 'var(--glow-primary), inset 0 1px 0 var(--glass-hi)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={S.eyebrow}>Public sale</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700, background: pill.bg, color: pill.fg }}>{pill.label}</span>
              </div>
              {hasBar && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, letterSpacing: '-.02em' }}>{fmtUsd(project.raised ?? 0)}</span>
                    <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.05)', marginTop: 11, overflow: 'hidden', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 9999, background: `linear-gradient(90deg, ${project.accent}, ${project.accent}cc)` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 12, color: 'var(--c-muted2)' }}>
                    <span>of {fmtUsd(project.target)} target</span><span>{fmtNum(project.backers)} backers</span>
                  </div>
                </div>
              )}
              {isSoon && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16, padding: '13px 14px', borderRadius: 12, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)', fontSize: 13, color: 'var(--c-muted)' }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--c-indigo-light)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                  Sale opens <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{fmtDate(project.startAt)}</span>
                </div>
              )}

              <div style={{ marginTop: 16, borderRadius: 14, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', fontSize: 13 }}><span style={{ color: 'var(--c-muted)' }}>Token price</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtPrice(project.price)}</span></div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderTop: '1px solid rgba(var(--c-fg-rgb),.07)', fontSize: 13 }}><span style={{ color: 'var(--c-muted)' }}>Allocation</span><span style={{ fontFamily: 'var(--font-mono)' }}>${fmtNum(project.minContribution)} – ${fmtNum(project.cap)}</span></div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderTop: '1px solid rgba(var(--c-fg-rgb),.07)', fontSize: 13 }}><span style={{ color: 'var(--c-muted)' }}>Accepted</span><span style={{ fontFamily: 'var(--font-mono)' }}>USDC</span></div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderTop: '1px solid rgba(var(--c-fg-rgb),.07)', fontSize: 13 }}><span style={{ color: 'var(--c-muted)' }}>{scheduleLabel}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{scheduleVal}</span></div>
                {project.myContribution > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderTop: '1px solid rgba(var(--c-fg-rgb),.07)', fontSize: 13 }}><span style={{ color: 'var(--c-muted)' }}>Your contribution</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#2dd4bf' }}>${fmtNum(project.myContribution)}</span></div>
                )}
              </div>

              {isLive && !showAgentPrompt && (
                <button className="lp-join" onClick={() => setShowAgentPrompt(true)} disabled={!project.onChainRegistered} style={{ width: '100%', height: 52, marginTop: 16, borderRadius: 14, border: 'none', fontSize: 15, fontWeight: 600, cursor: project.onChainRegistered ? 'pointer' : 'default', transition: 'transform .15s,filter .15s', background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)', color: '#fff', opacity: project.onChainRegistered ? 1 : .5 }}>
                  Join sale
                </button>
              )}
              {isLive && showAgentPrompt && (
                <div style={{ marginTop: 16, padding: 14, borderRadius: 14, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.1)' }}>
                  <p style={{ fontSize: 12.5, color: 'var(--c-muted)', lineHeight: 1.5, marginBottom: 10 }}>
                    Contributions in this sale are <strong style={{ color: 'var(--c-text)' }}>agent-only</strong> — first come, first served, enforced on-chain. Ask your Miron Agent to buy in:
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <span style={{ display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--c-muted)' }}>$</span>
                    <input value={suggestAmount} onChange={e => setSuggestAmount(e.target.value.replace(/[^0-9.]/g, ''))} style={{ width: 80, height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 13, outline: 'none' }} />
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--c-text)', marginBottom: 10 }}>
                    &quot;{suggestedCommand}&quot;
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={copyCommand} style={{ flex: 1, height: 38, borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                      {copied ? 'Copied ✓' : 'Copy command'}
                    </button>
                    <button onClick={() => router.push('/agent')} style={{ flex: 1, height: 38, borderRadius: 10, border: 'none', background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                      Open Agent chat
                    </button>
                  </div>
                </div>
              )}
              {isSoon && (
                <button disabled style={{ width: '100%', height: 52, marginTop: 16, borderRadius: 14, border: '1px solid rgba(var(--c-fg-rgb),.14)', fontSize: 15, fontWeight: 600, background: 'var(--c-panel-2)', color: 'var(--c-text)', cursor: 'default' }}>
                  Sale hasn&apos;t opened yet
                </button>
              )}
              {project.status === 'ended' && (
                <button disabled style={{ width: '100%', height: 52, marginTop: 16, borderRadius: 14, border: '1px solid rgba(var(--c-fg-rgb),.07)', fontSize: 15, fontWeight: 600, background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-muted2)', cursor: 'default' }}>
                  Sale ended
                </button>
              )}

              <button onClick={toggleWatch} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 44, marginTop: 10, borderRadius: 13, background: 'transparent', border: '1px solid rgba(var(--c-fg-rgb),.07)', color: watched ? '#f5b748' : 'var(--c-muted)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', transition: 'color .15s,border-color .15s' }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill={watched ? '#f5b748' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 15 9l7 .5-5.4 4.6L18.5 21 12 17l-6.5 4 1.9-6.9L2 9.5 9 9z" /></svg>
                {watched ? 'In your watchlist' : 'Add to watchlist'}
              </button>
              {project.audit && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 13, fontSize: 11.5, color: 'var(--c-muted2)' }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                  Audited by {project.audit} · enforced on-chain
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
