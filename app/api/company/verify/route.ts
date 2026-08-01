import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

async function getUser(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  return user ? { supabase, user } : null
}

export async function GET(request: NextRequest) {
  const ctx = await getUser(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await ctx.supabase.from('company_profiles').select('*').eq('user_id', ctx.user.id).maybeSingle()
  return NextResponse.json({ profile: data ?? { verification_status: 'none' } })
}

/**
 * Submit (or re-submit) a company for business verification.
 *
 * TESTNET SHORTCUT: auto-approves immediately (no manual admin review) so
 * verification is fast to test end-to-end. Flip AUTO_APPROVE to false (or
 * remove it) before mainnet — real verification must go back to a manual
 * 'pending' -> admin-reviewed 'verified' flow, same as merchant verification.
 */
const AUTO_APPROVE = true

export async function POST(request: NextRequest) {
  const ctx = await getUser(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { supabase, user } = ctx

  const body = await request.json().catch(() => null)
  const legalName = (body?.legalName as string | undefined)?.trim()
  // TESTNET SHORTCUT (paired with AUTO_APPROVE below): no format/length
  // requirement on registration number, or even that it's present — fill in
  // whatever, this never gets checked against a real registry right now.
  // Only legal name is still required, since that's literally the string
  // shown to employees as "paid by ___"; nothing to show if it's blank.
  const registrationNumber = (body?.registrationNumber as string | undefined)?.trim() || null
  const emailDomain = (body?.emailDomain as string | undefined)?.trim() || null

  if (!legalName) return NextResponse.json({ error: 'Legal entity name is required' }, { status: 400 })

  const now = new Date().toISOString()
  // A company already 'verified' resubmitting (e.g. legal name changed)
  // would normally drop back to 'pending' until re-reviewed — skipped here
  // only because AUTO_APPROVE is on for testnet.
  const { data, error } = await supabase
    .from('company_profiles')
    .upsert(
      {
        user_id: user.id,
        legal_name: legalName,
        registration_number: registrationNumber,
        email_domain: emailDomain,
        verification_status: AUTO_APPROVE ? 'verified' : 'pending',
        submitted_at: now,
        verified_at: AUTO_APPROVE ? now : null,
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data })
}
