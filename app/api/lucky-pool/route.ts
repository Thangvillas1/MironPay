import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const today = new Date().toISOString().slice(0, 10)

    const [poolRes, winsRes, streakRes] = await Promise.all([
      supabase.from('lucky_pool').select('balance, total_contributed, total_won').eq('id', 1).single(),
      supabase.from('lucky_wins')
        .select('username, amount, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('agent_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('role', 'user')
        .gte('created_at', `${today}T00:00:00.000Z`),
    ])

    const poolBalance = poolRes.data?.balance ?? 0
    const streakCount = streakRes.count ?? 0
    const winChance = Math.min(0.01 + streakCount * 0.001, 0.10)

    return NextResponse.json({
      pool_balance: poolBalance,
      total_contributed: poolRes.data?.total_contributed ?? 0,
      total_won: poolRes.data?.total_won ?? 0,
      recent_wins: winsRes.data ?? [],
      user_streak: streakCount,
      win_chance: winChance,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
