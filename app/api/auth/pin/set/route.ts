import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

function hashPin(userId: string, pin: string): string {
  return createHash('sha256').update(`${userId}:${pin}:miron`).digest('hex')
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { pin, username } = body
  if (!pin || typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 6 digits' }, { status: 400 })
  }

  const pin_hash = hashPin(user.id, pin)
  // upsert (not update) so onboarding can create the profile row (with
  // username) in the same call a returning user uses to just change their PIN.
  const row: { id: string; pin_hash: string; username?: string } = { id: user.id, pin_hash }
  if (typeof username === 'string' && username) row.username = username
  const { error } = await supabase.from('profiles').upsert(row)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
