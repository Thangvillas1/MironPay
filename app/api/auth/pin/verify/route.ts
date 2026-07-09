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
  const { pin } = body
  if (!pin || typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: 'Invalid PIN format' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('pin_hash')
    .eq('id', user.id)
    .single()

  if (!profile?.pin_hash) {
    return NextResponse.json({ error: 'PIN not set' }, { status: 400 })
  }

  const expected = hashPin(user.id, pin)
  if (profile.pin_hash !== expected) {
    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
