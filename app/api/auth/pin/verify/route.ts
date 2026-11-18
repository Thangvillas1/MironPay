import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getAuthUser } from '@/app/lib/supabase-server'
import { pinFailureHttp, verifyPin } from '@/app/lib/pin'

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const user = await getAuthUser(supabase, token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pin } = await request.json()
  const result = await verifyPin(supabase, user.id, pin)
  if (!result.ok) {
    const response = pinFailureHttp(result)
    return NextResponse.json({ error: result.error, code: result.code }, response)
  }

  return NextResponse.json({ ok: true })
}

// Warm-up: the PIN screen pings this as soon as it appears, so the function
// is already running when the user finishes typing (a cold start here was
// ~3 s of "Verifying…"). No auth, no data, nothing to learn from it.
export function GET() {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
