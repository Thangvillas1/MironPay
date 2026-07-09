'use client'

import { useEffect, useState } from 'react'

interface LeaderboardEntry {
  rank: number
  agent_id: number
  total_score: number
  feedback_count: number
  owner_address: string | null
}

const MIRON_AGENT_ID = 840671

export default function LeaderboardPage() {
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
    <main style={{ minHeight: '100vh', background: '#0b0a1a', padding: '48px 20px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: '#615d85', textTransform: 'uppercase' }}>ARC Testnet</p>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#ececf8', marginTop: 4 }}>Agent Reputation Leaderboard</h1>
        <p style={{ fontSize: 13, color: '#9c98c2', marginTop: 6 }}>
          Ranked by on-chain reputation score (ERC-8004 ReputationRegistry).{' '}
          {totalAgents > 0 && `${totalAgents.toLocaleString()} agent${totalAgents === 1 ? '' : 's'} with feedback so far.`}
        </p>

        <div style={{ marginTop: 24, borderRadius: 14, background: '#14122a', border: '1px solid rgba(255,255,255,.07)', padding: '8px 14px' }}>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 44, borderRadius: 8, background: 'rgba(255,255,255,.05)', margin: '8px 0' }} />
            ))
          ) : leaderboard.length === 0 ? (
            <p style={{ fontSize: 13, textAlign: 'center', color: '#615d85', padding: '32px 0' }}>No data yet — indexer hasn&apos;t run.</p>
          ) : (
            leaderboard.map(item => {
              const isMiron = item.agent_id === MIRON_AGENT_ID
              const medal = item.rank <= 3 ? ['🥇', '🥈', '🥉'][item.rank - 1] : null
              return (
                <div key={item.agent_id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 6px',
                  borderTop: '1px solid rgba(255,255,255,.07)',
                  background: isMiron ? 'rgba(165,180,252,.08)' : 'transparent',
                  borderRadius: isMiron ? 8 : 0,
                }}>
                  <span style={{
                    width: 28, textAlign: 'center', fontSize: medal ? 16 : 12, fontWeight: 700,
                    color: medal ? undefined : isMiron ? '#a5b4fc' : '#615d85',
                  }}>
                    {medal ?? item.rank}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: isMiron ? '#ececf8' : '#9c98c2' }}>
                    Agent #{item.agent_id}{isMiron ? ' (Miron Agent)' : ''}
                  </span>
                  <span style={{ fontSize: 12, color: '#615d85' }}>{item.feedback_count} fb</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: isMiron ? '#a5b4fc' : '#ececf8', minWidth: 60, textAlign: 'right' }}>
                    {Number(item.total_score).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </main>
  )
}
