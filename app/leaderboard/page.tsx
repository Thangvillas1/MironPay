'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface LeaderboardEntry {
  rank: number
  agent_id: number
  total_score: number
  feedback_count: number
  owner_address: string | null
}

const MIRON_AGENT_ID = 840671

export default function LeaderboardPage() {
  const router = useRouter()
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [totalAgents, setTotalAgents] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/agent/leaderboard-public')
      .then(r => r.json())
      .then(d => {
        setLeaderboard(d.leaderboard ?? [])
        setTotalAgents(d.totalAgents ?? 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mpm-page, #0b0a1a)' }}>
      {/* Back header — this page isn't wrapped by the (app) shell/tab bar,
          so it needs its own way back (mainly reached from Settings). */}
      <div
        className="flex items-center gap-3"
        style={{
          padding: '16px 18px', paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
          borderBottom: '1px solid var(--mpm-border, rgba(255,255,255,.07))',
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            width: 38, height: 38, borderRadius: 12, border: '1px solid var(--mpm-border, rgba(255,255,255,.07))',
            background: 'var(--mpm-input, rgba(255,255,255,.045))', color: 'var(--mpm-text, #eaf0fb)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: 'var(--mpm-text, #eaf0fb)' }}>Leaderboard</h2>
      </div>

      <div style={{ padding: '20px 18px 40px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--mpm-muted2, #515f80)', textTransform: 'uppercase' as const }}>ARC Testnet</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--mpm-text, #eaf0fb)', marginTop: 4 }}>Agent Reputation Leaderboard</h1>
          <p style={{ fontSize: 13, color: 'var(--mpm-muted, #8595b8)', marginTop: 6 }}>
            Ranked by on-chain reputation score (ERC-8004 ReputationRegistry).{' '}
            {totalAgents > 0 && `${totalAgents.toLocaleString()} agent${totalAgents === 1 ? '' : 's'} with feedback so far.`}
          </p>

          <div style={{
            marginTop: 20, borderRadius: 'var(--mpm-radius-lg, 14px)',
            background: 'var(--mpm-glass-bg, rgba(20,30,54,.55))', backdropFilter: 'blur(var(--mpm-glass-blur, 18px))', WebkitBackdropFilter: 'blur(var(--mpm-glass-blur, 18px))',
            border: '1px solid var(--mpm-glass-border, rgba(255,255,255,.10))', boxShadow: 'inset 0 1px 0 var(--mpm-glass-hi, rgba(255,255,255,.07))',
            padding: 6,
          }}>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ height: 44, borderRadius: 8, background: 'var(--mpm-input, rgba(255,255,255,.045))', margin: '8px 0' }} />
              ))
            ) : leaderboard.length === 0 ? (
              <p style={{ fontSize: 13, textAlign: 'center', color: 'var(--mpm-muted2, #515f80)', padding: '32px 0' }}>No data yet — indexer hasn&apos;t run.</p>
            ) : (
              leaderboard.map(item => {
                const isMiron = item.agent_id === MIRON_AGENT_ID
                const medal = item.rank <= 3 ? ['🥇', '🥈', '🥉'][item.rank - 1] : null
                return (
                  <div key={item.agent_id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 6px',
                    borderTop: '1px solid var(--mpm-border, rgba(255,255,255,.07))',
                    background: isMiron ? 'rgba(91,140,255,.10)' : 'transparent',
                    borderRadius: isMiron ? 8 : 0,
                  }}>
                    <span style={{
                      width: 28, textAlign: 'center', fontSize: medal ? 16 : 12, fontWeight: 700,
                      color: medal ? undefined : isMiron ? 'var(--mpm-purple-accent, #5b8cff)' : 'var(--mpm-muted2, #515f80)',
                    }}>
                      {medal ?? item.rank}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: isMiron ? 'var(--mpm-text, #eaf0fb)' : 'var(--mpm-muted, #8595b8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Agent #{item.agent_id}{isMiron ? ' (Miron Agent)' : ''}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--mpm-muted2, #515f80)', flexShrink: 0 }}>{item.feedback_count} fb</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: isMiron ? 'var(--mpm-purple-accent, #5b8cff)' : 'var(--mpm-text, #eaf0fb)', minWidth: 60, textAlign: 'right' as const, flexShrink: 0 }}>
                      {Number(item.total_score).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
