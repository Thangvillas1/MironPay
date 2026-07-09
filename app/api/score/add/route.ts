import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

export type ScoreAction = 'send' | 'swap' | 'agent_tx' | 'deposit' | 'feedback' | 'daily_login'

const POINTS: Record<ScoreAction, number> = {
  send: 2,
  swap: 3,
  agent_tx: 1,
  deposit: 1,
  feedback: 5,
  daily_login: 0.5,
}

function getLevel(score: number): string {
  if (score >= 600) return 'Elite'
  if (score >= 300) return 'Trader'
  if (score >= 100) return 'Builder'
  return 'Newcomer'
}

function getStreakMultiplier(streakDays: number): number {
  if (streakDays >= 30) return 1.5
  if (streakDays >= 7) return 1.2
  return 1.0
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { action } = await request.json() as { action: ScoreAction }
    if (!action || !(action in POINTS)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Lấy profile hiện tại
    const { data: profile } = await supabase
      .from('profiles')
      .select('miron_score, streak_days, last_active_date')
      .eq('id', user.id)
      .single()

    const currentScore = profile?.miron_score ?? 0
    const today = new Date().toISOString().slice(0, 10)
    const lastActive = profile?.last_active_date ?? ''

    // Tính streak
    let streakDays = profile?.streak_days ?? 0
    let newLastActive = lastActive

    if (action === 'daily_login') {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      if (lastActive === yesterday) {
        streakDays += 1
      } else if (lastActive !== today) {
        streakDays = 1
      }
      newLastActive = today
    }

    // Tính điểm mới với streak multiplier
    const basePoints = POINTS[action]
    const multiplier = getStreakMultiplier(streakDays)
    const earnedPoints = parseFloat((basePoints * multiplier).toFixed(2))
    const newScore = parseFloat((currentScore + earnedPoints).toFixed(2))
    const newLevel = getLevel(newScore)

    // Cập nhật profile
    const updateData: Record<string, unknown> = {
      miron_score: newScore,
      miron_level: newLevel,
      streak_days: streakDays,
    }
    if (newLastActive) updateData.last_active_date = newLastActive

    await supabase.from('profiles').update(updateData).eq('id', user.id)

    // Ghi event
    await supabase.from('score_events').insert({
      user_id: user.id,
      action_type: action,
      points: earnedPoints,
    })

    // Snapshot hàng ngày (upsert)
    await supabase.from('score_history').upsert({
      user_id: user.id,
      score: newScore,
      level: newLevel,
      snapshot_date: today,
    }, { onConflict: 'user_id,snapshot_date' })

    return NextResponse.json({
      score: newScore,
      level: newLevel,
      earned: earnedPoints,
      streak: streakDays,
      multiplier,
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[score/add]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
