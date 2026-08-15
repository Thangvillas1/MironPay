import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { hashPin } from '@/app/lib/pin'

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

  const { data: existing } = await supabase.from('profiles').select('pin_hash').eq('id', user.id).maybeSingle()
  if (existing?.pin_hash) {
    return NextResponse.json({ error: 'PIN is already set' }, { status: 409 })
  }

  const pin_hash = await hashPin(user.id, pin)
  // upsert (not update) so onboarding can create the profile row (with
  // username) in the same call a returning user uses to just change their PIN.
  const row: { id: string; pin_hash: string; username?: string } = { id: user.id, pin_hash }
  if (typeof username === 'string' && username) row.username = username
  const { error } = await createAdminSupabaseClient().from('profiles').upsert(row)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
