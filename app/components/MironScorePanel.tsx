'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabase'

interface LeaderboardEntry {
  rank: number
  username: string
  score: number
  level: string
  isMe: boolean
}

interface ScoreData {
  score: number
  level: string
  streak: number
  rank: number
}

const LEVEL_EMOJI: Record<string, string> = {
  Newcomer: '🌱', Builder: '⚡', Trader: '🔥', Elite: '💎',
}

export default function MironScorePanel() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [me, setMe] = useState<ScoreData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => {
      if (!s.session) { setLoading(false); return }
      fetch('/api/score/leaderboard', {
        headers: { Authorization: `Bearer ${s.session.access_token}` },
      })
        .then(r => r.json())
        .then(d => {
          setLeaderboard(d.leaderboard ?? [])
          setMe(d.me ?? null)
          setLoading(false)
        })
        .catch(() => setLoading(false))
    })
  }, [])

  const myScore = me?.score ?? 0
  const myLevel = me?.level ?? 'Newcomer'
  const myRank = me?.rank ?? '—'

  return (
    <div className="rounded-[16px] p-4 shrink-0" style={{ background: 'var(--c-panel)', border: '1px solid rgba(34,197,94,0.2)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--c-success)' }}>Miron Score</p>
        {me?.streak ? (
          <span className="text-[10px] font-semibold text-amber-400 flex items-center gap-0.5">
            🔥 {me.streak}d streak
          </span>
        ) : null}
      </div>

      {/* User's own score */}
      <div className="flex items-center gap-2 mb-1">
        {loading ? (
          <div className="h-8 w-24 bg-white/10 rounded animate-pulse" />
        ) : (
          <>
            <span className="text-3xl font-black" style={{ color: 'var(--c-text)' }}>
              {myScore.toLocaleString()}
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-semibold" style={{ color: 'var(--c-success)' }}>
                {LEVEL_EMOJI[myLevel]} {myLevel}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
                Rank #{myRank}
              </span>
            </div>
          </>
        )}
      </div>

      <p className="text-[10px] mb-3" style={{ color: 'var(--c-muted)' }}>
        Top 100 get early IDO whitelist access
      </p>

      {/* Leaderboard — top 4 only, full board is a separate view (coming later) */}
      <div className="flex flex-col gap-1">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 bg-white/5 rounded-[8px] animate-pulse" />
          ))
        ) : leaderboard.length === 0 ? (
          <p className="text-xs text-center py-3" style={{ color: 'var(--c-muted)' }}>
            No data yet. Make transactions to get on the board!
          </p>
        ) : (
          leaderboard.slice(0, 4).map(item => (
            <div key={item.rank}
              className="flex items-center gap-2 px-2 py-1.5 rounded-[8px] transition-all"
              style={{ background: item.isMe ? 'rgba(34,197,94,0.08)' : 'transparent' }}>
              <span className="text-[10px] font-bold w-5 text-center shrink-0"
                style={{ color: item.rank <= 3 ? ['#ffd700','#c0c0c0','#cd7f32'][item.rank-1] : item.isMe ? '#22c55e' : 'var(--c-muted)' }}>
                {item.rank <= 3 ? ['🥇','🥈','🥉'][item.rank-1] : item.rank}
              </span>
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold"
                style={{ background: item.isMe ? '#22c55e' : 'rgba(var(--c-fg-rgb),0.08)', color: item.isMe ? '#000' : 'var(--c-text)' }}>
                {item.username[0]?.toUpperCase()}
              </div>
              <span className="flex-1 text-xs font-medium truncate" style={{ color: item.isMe ? 'var(--c-text)' : 'var(--c-muted)' }}>
                @{item.username}{item.isMe ? ' (you)' : ''}
              </span>
              <span className="text-xs font-bold shrink-0" style={{ color: item.isMe ? '#22c55e' : 'var(--c-muted)' }}>
                {item.score.toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>

      <button
        disabled
        title="Coming soon"
        className="mt-3 w-full py-2 rounded-[8px] text-xs font-semibold cursor-not-allowed"
        style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.12)', color: 'var(--c-muted)' }}>
        View full leaderboard — coming soon
      </button>
    </div>
  )
}
