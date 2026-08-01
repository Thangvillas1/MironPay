import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

type LeaderboardRow = { id: string; username: string | null; miron_score: number | null; miron_level: string | null }

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Top 10 theo miron_score
    const { data: top } = await supabase
      .rpc('leaderboard_top', { p_limit: 10 }) as { data: LeaderboardRow[] | null }

    // Score của user hiện tại
    const { data: me } = await supabase
      .from('profiles')
      .select('username, miron_score, miron_level, streak_days')
      .eq('id', user.id)
      .single()

    // Rank của user
    const { data: count } = await supabase
      .rpc('count_users_with_score_above', { p_score: me?.miron_score ?? 0 })

    const myRank = Number(count ?? 0) + 1

    const leaderboard = (top ?? []).map((p, i) => ({
      rank: i + 1,
      username: p.username ?? 'user',
      score: Math.round(p.miron_score ?? 0),
      level: p.miron_level ?? 'Newcomer',
      isMe: p.id === user.id,
    }))

    // Nếu user không trong top 10, thêm vào cuối
    const inTop = leaderboard.some(p => p.isMe)
    if (!inTop && me) {
      leaderboard.push({
        rank: myRank,
        username: me.username ?? 'you',
        score: Math.round(me.miron_score ?? 0),
        level: me.miron_level ?? 'Newcomer',
        isMe: true,
      })
    }

    return NextResponse.json({
      leaderboard,
      me: {
        score: Math.round(me?.miron_score ?? 0),
        level: me?.miron_level ?? 'Newcomer',
        streak: me?.streak_days ?? 0,
        rank: myRank,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
