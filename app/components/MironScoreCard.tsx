'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabase'

interface ScoreData {
  score: number
  level: string
  streak: number
  progress: number
  nextThreshold: number
  rank?: number
}

const LEVEL_CONFIG: Record<string, { emoji: string; color: string; bar: string; glow: string }> = {
  Newcomer: { emoji: '🌱', color: 'text-green-400',  bar: 'bg-green-400',  glow: 'rgba(34,197,94,0.15)' },
  Builder:  { emoji: '⚡', color: 'text-blue-400',   bar: 'bg-blue-400',   glow: 'rgba(59,130,246,0.15)' },
  Trader:   { emoji: '🔥', color: 'text-orange-400', bar: 'bg-orange-400', glow: 'rgba(249,115,22,0.15)' },
  Elite:    { emoji: '💎', color: 'text-purple-400', bar: 'bg-purple-400', glow: 'rgba(168,85,247,0.15)' },
}

const LEVEL_UNLOCKS: Record<string, string> = {
  Builder: 'Agent limit 10 USDC/day',
  Trader: 'Agent limit 20 USDC · Swap fee -0.1%',
  Elite: 'Agent limit 50 USDC · IDO Early Access',
}

export default function MironScoreCard() {
  const [data, setData] = useState<ScoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [bump, setBump] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => {
      if (!s.session) { setLoading(false); return }
      Promise.all([
        fetch('/api/score/me', { headers: { Authorization: `Bearer ${s.session.access_token}` } }).then(r => r.json()),
        fetch('/api/score/leaderboard', { headers: { Authorization: `Bearer ${s.session.access_token}` } }).then(r => r.json()),
      ])
        .then(([scoreData, lb]) => {
          setData({ ...scoreData, rank: lb?.me?.rank })
          setLoading(false)
        })
        .catch(() => setLoading(false))
    })
  }, [])

  useEffect(() => {
    if (!data?.score) return
    const frame = requestAnimationFrame(() => setBump(true))
    const timer = setTimeout(() => setBump(false), 800)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [data?.score])

  if (loading) return (
    <div className="bg-mp-card border border-white/8 rounded-[16px] p-4 animate-pulse flex gap-4 items-center">
      <div className="w-12 h-12 rounded-full bg-white/10 shrink-0" />
      <div className="flex-1">
        <div className="h-3 bg-white/10 rounded w-20 mb-2" />
        <div className="h-5 bg-white/10 rounded w-28 mb-2" />
        <div className="h-1.5 bg-white/10 rounded" />
      </div>
    </div>
  )

  const d = data ?? { score: 0, level: 'Newcomer', streak: 0, progress: 0, nextThreshold: 100 }
  const cfg = LEVEL_CONFIG[d.level] ?? LEVEL_CONFIG.Newcomer

  return (
    <div
      className={`bg-mp-card border border-white/8 rounded-[16px] p-4 transition-all duration-300 ${bump ? 'scale-[1.01]' : ''}`}
      style={{ boxShadow: bump ? `0 0 20px ${cfg.glow}` : undefined }}
    >
      <div className="flex items-center gap-4">
        {/* Score circle */}
        <div className="relative shrink-0">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(var(--c-fg-rgb),0.08)" strokeWidth="4" />
            <circle cx="24" cy="24" r="20" fill="none"
              strokeWidth="4" strokeLinecap="round"
              stroke={cfg.bar.replace('bg-', '').includes('green') ? '#4ade80' : cfg.bar.includes('blue') ? '#60a5fa' : cfg.bar.includes('orange') ? '#fb923c' : '#c084fc'}
              strokeDasharray={`${2 * Math.PI * 20}`}
              strokeDashoffset={`${2 * Math.PI * 20 * (1 - d.progress / 100)}`}
              style={{ transition: 'stroke-dashoffset 0.7s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-base">{cfg.emoji}</span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-mp-muted uppercase tracking-widest">Miron Score</p>
            <div className="flex items-center gap-1.5">
              {d.streak > 0 && (
                <span className="text-[10px] font-medium text-amber-400">🔥{d.streak}d</span>
              )}
              {d.rank && (
                <span className="text-[10px] font-medium text-mp-muted">#{d.rank}</span>
              )}
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 my-0.5">
            <span className={`text-2xl font-bold tabular-nums transition-all duration-500 ${bump ? cfg.color : 'text-mp-text'}`}>
              {Math.round(d.score).toLocaleString()}
            </span>
            <span className={`text-xs font-semibold ${cfg.color}`}>{d.level}</span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`} style={{ width: `${d.progress}%` }} />
          </div>
          <p className="text-[10px] text-mp-muted mt-1">
            {d.level === 'Elite' ? '💎 Max level' : `${d.progress}% → ${d.level === 'Newcomer' ? 'Builder' : d.level === 'Builder' ? 'Trader' : 'Elite'}`}
          </p>
        </div>
      </div>

      {/* Unlocks badge */}
      {LEVEL_UNLOCKS[d.level] && (
        <div className={`mt-3 px-3 py-1.5 rounded-[8px] text-[10px] font-medium ${cfg.color}`}
          style={{ background: cfg.glow, border: `1px solid ${cfg.glow}` }}>
          ✓ Unlock: {LEVEL_UNLOCKS[d.level]}
        </div>
      )}
    </div>
  )
}
