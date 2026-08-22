import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { pinFailureHttp, verifyPin } from '@/app/lib/pin'

const MAX_SESSION_MINUTES = 120
const DEFAULT_SESSION_MINUTES = 30

// User explicitly approves a time-boxed window for the AI agent to move
// funds. Mirrors Alchemy Agent Wallets' session-approval model: the agent
// never gets standing permission, only a window that expires on its own.
export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const pinResult = await verifyPin(supabase, user.id, body.pin)
  if (!pinResult.ok) return NextResponse.json({ error: pinResult.error, code: pinResult.code }, pinFailureHttp(pinResult))
  const minutes = Math.min(MAX_SESSION_MINUTES, Math.max(1, parseInt(body.minutes, 10) || DEFAULT_SESSION_MINUTES))
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString()
  const admin = createAdminSupabaseClient()

  const { data: existing, error: selectError } = await admin.from('agent_wallets').select('user_id').eq('user_id', user.id).maybeSingle()
  if (selectError) return NextResponse.json({ error: 'Could not inspect Agent session.' }, { status: 503 })
  if (!existing) {
    const { error } = await admin.from('agent_wallets').insert({ user_id: user.id, session_expires_at: expiresAt })
    if (error) return NextResponse.json({ error: 'Could not enable Agent session.' }, { status: 503 })
  } else {
    const { error } = await admin.from('agent_wallets').update({ session_expires_at: expiresAt }).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: 'Could not enable Agent session.' }, { status: 503 })
  }

  return NextResponse.json({ success: true, session_expires_at: expiresAt })
}

// Revoke early — same intent as Alchemy's `wallet disconnect`.
export async function DELETE(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await createAdminSupabaseClient().from('agent_wallets').update({ session_expires_at: null }).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Could not revoke Agent session.' }, { status: 503 })
  return NextResponse.json({ success: true })
}
