import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { validateUsernameFormat } from '@/app/lib/username'

// Thin wrapper around the `is_username_taken` RPC (already used by the real
// desktop onboarding pages) so the sandboxed mobile mock — which has no
// Supabase client of its own — can run the same live-availability check.
export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const username = (request.nextUrl.searchParams.get('u') ?? '').toLowerCase()
  const formatError = validateUsernameFormat(username)
  if (formatError) return NextResponse.json({ available: false, error: formatError })

  const { data: taken, error } = await supabase.rpc('is_username_taken', { p_username: username, p_exclude_id: user.id })
  if (error) return NextResponse.json({ error: 'Unable to check username' }, { status: 500 })

  return NextResponse.json({ available: !taken })
}
