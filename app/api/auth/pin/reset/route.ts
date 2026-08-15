import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { hashPin, isRecentPinAuthentication } from '@/app/lib/pin'

export async function POST(request: NextRequest) {
  const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(accessToken)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isRecentPinAuthentication(user.last_sign_in_at)) {
    return NextResponse.json({
      error: 'Verify your Google account again before resetting your PIN.',
      code: 'REAUTH_REQUIRED',
    }, { status: 403 })
  }

  const { pin } = await request.json()
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 6 digits', code: 'INVALID_PIN' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin
    .from('profiles')
    .update({ pin_hash: await hashPin(user.id, pin) })
    .eq('id', user.id)
  if (error) {
    console.error('[pin/reset] profile update failed:', error)
    return NextResponse.json({ error: 'Could not reset PIN. Please try again.' }, { status: 500 })
  }

  // A successful account re-verification and reset also clears any old lock.
  const { error: clearError } = await admin.from('pin_attempts').delete().eq('user_id', user.id)
  if (clearError) console.error('[pin/reset] attempt reset failed:', clearError)

  return NextResponse.json({ ok: true }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
