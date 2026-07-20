import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { verifyPin } from '@/app/lib/pin'

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pin } = await request.json()
  const result = await verifyPin(supabase, user.id, pin)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === 'Incorrect PIN' ? 401 : 400 })
  }

  return NextResponse.json({ ok: true })
}
