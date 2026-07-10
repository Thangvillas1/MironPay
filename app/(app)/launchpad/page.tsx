'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/app/lib/supabase'
import { isOnboardingComplete } from '@/app/lib/onboarding'
import { STATUS_PILL, CTA_LABEL, fmtUsd, fmtNum, fmtPrice, type ProjectStatus } from '@/app/lib/launchpad-data'

type Tab = ProjectStatus

interface Project {
  id: string
  name: string; sym: string; mark: string; accent: string; category: string; tagline: string
  price: number; target: number; cap: number; minContribution: number
  startAt: string; endAt: string; status: ProjectStatus
  raised: number; backers: number
}

function timeLeft(endAt: string): string {
  const ms = new Date(endAt).getTime() - Date.now()
  if (ms <= 0) return '0h'
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m`
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
    new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}
function progressPct(p: Project): number {
  return p.target ? Math.min(100, Math.round((p.raised || 0) / p.target * 100)) : 0
}

const STAT_ICONS: Record<string, React.ReactNode> = {
  'Total raised': <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  'Projects': <path d="M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7" />,
  'Backers': <path d="M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M22 19v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8" />,
}

function StatIcon({ label }: { label: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {STAT_ICONS[label]}
    </svg>
  )
}

function ProjectCard({ p, onClick }: { p: Project; onClick: () => void }) {
  const pill = STATUS_PILL[p.status]
  const pct = progressPct(p)
  const isSoon = p.status === 'soon'
  const hasBar = p.status === 'live' || p.status === 'ended'
  const ctaColor = p.status === 'live' ? 'var(--c-indigo-light)' : 'var(--c-muted)'
  return (
    <div
      onClick={onClick}
      className="lp-card"
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', padding: 18, borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', cursor: 'pointer', overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${p.accent}, ${p.accent}00)` }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 17, color: '#fff', background: `linear-gradient(140deg, ${p.accent}, ${p.accent}bb)`, boxShadow: `0 6px 18px ${p.accent}55` }}>{p.mark}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--c-text)' }}>{p.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-muted)' }}>${p.sym}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--c-muted2)', marginTop: 2 }}>{p.category}</div>
          </div>
        </div>
        <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700, background: pill.bg, color: pill.fg }}>{pill.label}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 13, lineHeight: 1.5, minHeight: 39 }}>{p.tagline}</div>
      {isSoon && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '11px 13px', borderRadius: 11, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)', fontSize: 12.5, color: 'var(--c-muted)' }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--c-indigo-light)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
          Starts <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{fmtDate(p.startAt)}</span>
        </div>
      )}
      {hasBar && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--c-text)' }}>{fmtUsd(p.raised ?? 0)}</span>
            <span style={{ color: 'var(--c-muted2)', fontSize: 11.5 }}>{pct}% of {fmtUsd(p.target)}</span>
          </div>
          <div style={{ height: 6, borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.05)', marginTop: 8, overflow: 'hidden', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 9999, background: `linear-gradient(90deg, ${p.accent}, ${p.accent}cc)` }} />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 15, paddingTop: 14, borderTop: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
        <div style={{ display: 'flex', gap: 20 }}>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--c-muted2)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>Price</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 600, marginTop: 3, color: 'var(--c-text)' }}>{fmtPrice(p.price)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--c-muted2)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>{isSoon ? 'Target' : 'Backers'}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 600, marginTop: 3, color: 'var(--c-text)' }}>{isSoon ? fmtUsd(p.target) : fmtNum(p.backers)}</div>
          </div>
        </div>
        <span className="lp-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600, color: ctaColor }}>
          {CTA_LABEL[p.status]}
          <svg className="lp-arr" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform .18s ease-out' }}><path d="m9 6 6 6-6 6" /></svg>
        </span>
      </div>
    </div>
  )
}

export default function LaunchpadPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('live')
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/'); return }
      if (!(await isOnboardingComplete(data.session.user.id))) { router.replace('/'); return }
      const res = await fetch('/api/launchpad/sales')
      if (res.ok) {
        const d = await res.json()
        setProjects(d.projects ?? [])
      }
      setLoading(false)
    })
  }, [router])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-page)' }}>
        <p style={{ fontSize: 14, color: 'var(--c-muted)' }}>Loading...</p>
      </div>
    )
  }

  const live = projects.filter(p => p.status === 'live')
  const featured = tab === 'live' ? live[0] : undefined
  let list = projects.filter(p => p.status === tab)
  if (featured) list = list.filter(p => p.id !== featured.id)

  const counts: Record<Tab, number> = {
    live: projects.filter(p => p.status === 'live').length,
    soon: projects.filter(p => p.status === 'soon').length,
    ended: projects.filter(p => p.status === 'ended').length,
  }
  const TABS: { key: Tab; label: string }[] = [
    { key: 'live', label: 'Live' },
    { key: 'soon', label: 'Upcoming' },
    { key: 'ended', label: 'Ended' },
  ]

  const marketStats = [
    { label: 'Total raised', value: fmtUsd(projects.reduce((sum, p) => sum + p.raised, 0)) },
    { label: 'Projects', value: String(projects.length) },
    { label: 'Backers', value: fmtNum(projects.reduce((sum, p) => sum + p.backers, 0)) },
  ]

  const goToProject = (id: string) => router.push(`/launchpad/${id}`)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-page)', color: 'var(--c-text)' }}>
      <style>{`
        .lp-card{transition:transform .18s ease-out,border-color .18s,box-shadow .18s}
        .lp-card:hover{transform:translateY(-3px);border-color:rgba(var(--c-fg-rgb),.14);box-shadow:0 14px 38px rgba(3,8,20,.5)}
        .lp-card:hover .lp-arr{transform:translateX(3px)}
        .lp-mtab:hover{color:var(--c-text)!important}
        .lp-join:hover{transform:translateY(-1px);filter:brightness(1.06)}
        .lp-join:active{transform:scale(.98)}
      `}</style>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '28px 34px 52px' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-.02em' }}>Launchpad</h1>
            <div style={{ marginTop: 6, fontSize: 13.5, color: 'var(--c-muted)' }}>Back early-stage projects building on the ARC network</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px', borderRadius: 9999, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2dd4bf', boxShadow: '0 0 10px #2dd4bf' }} />{live.length} live now
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9999, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-muted)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2dd4bf', boxShadow: '0 0 8px #2dd4bf' }} />ARC Testnet
            </span>
            <button onClick={() => router.push('/launchpad/submit')} style={{ height: 36, padding: '0 16px', borderRadius: 9999, background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)', border: 'none', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              Submit a project
            </button>
          </div>
        </div>

        {featured && (
          <div
            onClick={() => goToProject(featured.id)}
            style={{ position: 'relative', overflow: 'hidden', marginTop: 22, padding: '26px 28px', borderRadius: 20, cursor: 'pointer', background: `linear-gradient(150deg, ${featured.accent}26, transparent 56%), var(--glass-bg)`, backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', border: '1px solid var(--glass-border)', boxShadow: 'var(--glow-primary), inset 0 1px 0 var(--glass-hi)' }}
          >
            <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(420px 200px at 88% -20%, ${featured.accent}33, transparent 60%)`, pointerEvents: 'none' }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 26, padding: '0 11px', borderRadius: 9999, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(var(--c-fg-rgb),.14)', fontSize: 10.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--c-text)' }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 15 9l7 .5-5.4 4.6L18.5 21 12 17l-6.5 4 1.9-6.9L2 9.5 9 9z" /></svg>Featured sale
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 16 }}>
                  <span style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 19, color: '#fff', background: `linear-gradient(140deg, ${featured.accent}, ${featured.accent}bb)`, boxShadow: `0 6px 18px ${featured.accent}55` }}>{featured.mark}</span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.01em' }}>{featured.name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-muted)', padding: '2px 7px', borderRadius: 6, background: 'rgba(var(--c-fg-rgb),.05)' }}>${featured.sym}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--c-muted2)', marginTop: 3 }}>{featured.category}</div>
                  </div>
                </div>
                <div style={{ fontSize: 14, color: 'var(--c-muted)', marginTop: 14, maxWidth: 400, lineHeight: 1.5 }}>{featured.tagline}</div>
                <div style={{ marginTop: 20, maxWidth: 440 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--c-muted)' }}>Raised</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}><span style={{ color: 'var(--c-text)' }}>{fmtUsd(featured.raised ?? 0)}</span><span style={{ color: 'var(--c-muted2)' }}> / {fmtUsd(featured.target)}</span></span>
                  </div>
                  <div style={{ height: 8, borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.05)', marginTop: 9, overflow: 'hidden', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
                    <div style={{ height: '100%', width: `${progressPct(featured)}%`, borderRadius: 9999, background: `linear-gradient(90deg, ${featured.accent}, ${featured.accent}cc)` }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: 'var(--c-muted2)' }}>
                    <span>{progressPct(featured)}% funded · {fmtNum(featured.backers)} backers</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#f5b748', whiteSpace: 'nowrap' }}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>Ends in {timeLeft(featured.endAt)}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 14, minWidth: 170 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--c-muted2)' }}>Token price</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 600, letterSpacing: '-.02em', marginTop: 4 }}>{fmtPrice(featured.price)}</div>
                </div>
                <button className="lp-join" onClick={e => { e.stopPropagation(); goToProject(featured.id) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 26px', borderRadius: 13, border: 'none', background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'transform .15s,filter .15s' }}>
                  View sale
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginTop: 18 }}>
          {marketStats.map(s => (
            <div key={s.label} style={{ padding: '16px 18px', borderRadius: 15, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--c-muted2)' }}>
                <StatIcon label={s.label} />
                <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>{s.label}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 23, fontWeight: 600, letterSpacing: '-.02em', marginTop: 9, color: 'var(--c-text)' }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 26 }}>
          <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 12, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
            {TABS.map(t => {
              const active = tab === t.key
              return (
                <button
                  key={t.key} className="lp-mtab" onClick={() => setTab(t.key)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'background .15s,color .15s', background: active ? 'var(--c-panel-2)' : 'transparent', color: active ? 'var(--c-text)' : 'var(--c-muted)', boxShadow: active ? '0 1px 0 var(--glass-hi) inset' : 'none' }}
                >
                  {t.label}
                  <span style={{ minWidth: 18, height: 18, padding: '0 5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9999, fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--font-mono)', background: active ? '#6366f1' : 'rgba(var(--c-fg-rgb),.05)', color: active ? '#fff' : 'var(--c-muted2)' }}>{counts[t.key]}</span>
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--c-muted2)' }}>{list.length} {list.length === 1 ? 'project' : 'projects'}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 16 }}>
          {list.map(p => <ProjectCard key={p.id} p={p} onClick={() => goToProject(p.id)} />)}
        </div>
        {list.length === 0 && (
          <div style={{ textAlign: 'center', padding: '56px 0', color: 'var(--c-muted2)', fontSize: 13.5 }}>
            {projects.length === 0 ? (
              <>No sales yet. <Link href="/launchpad/submit" style={{ color: 'var(--c-indigo-light)' }}>Submit your project</Link> to get listed.</>
            ) : 'No sales in this category right now.'}
          </div>
        )}
      </div>
    </div>
  )
}
