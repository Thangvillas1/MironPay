import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('miron_score, miron_level, streak_days')
      .eq('id', user.id)
      .single()

    const score = profile?.miron_score ?? 0
    const level = profile?.miron_level ?? 'Newcomer'
    const streak = profile?.streak_days ?? 0

    // Progress đến level tiếp theo
    const thresholds: Record<string, number> = {
      Newcomer: 100,
      Builder: 300,
      Trader: 600,
      Elite: 1000,
    }
    const nextThreshold = thresholds[level] ?? 1000
    const prevThreshold: Record<string, number> = {
      Newcomer: 0, Builder: 100, Trader: 300, Elite: 600,
    }
    const prev = prevThreshold[level] ?? 0
    const progress = Math.min(100, Math.round(((score - prev) / (nextThreshold - prev)) * 100))

    return NextResponse.json({ score, level, streak, progress, nextThreshold })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
