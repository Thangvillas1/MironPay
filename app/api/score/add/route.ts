import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { awardVerifiedScore } from '@/app/lib/score-server'

export type ScoreAction = 'send' | 'swap' | 'agent_tx' | 'deposit' | 'feedback' | 'daily_login'

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { action } = await request.json() as { action?: ScoreAction }
    if (action !== 'daily_login') {
      return NextResponse.json({ error: 'Transaction scores are awarded by verified server events' }, { status: 403 })
    }

    const result = await awardVerifiedScore(user.id, 'daily_login', new Date().toISOString().slice(0, 10))
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to award score'
    console.error('[score/add]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
