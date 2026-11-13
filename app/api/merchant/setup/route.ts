import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { storeName, logoUrl } = await request.json()
  if (!storeName || typeof storeName !== 'string' || storeName.length > 30) {
    return NextResponse.json({ error: 'Store name is required (max 30 chars)' }, { status: 400 })
  }

  const wallet = await resolveCircleWalletId(supabase, user.id)
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 400 })

  const name = storeName.trim()
  if (!name) return NextResponse.json({ error: 'Store name is required (max 30 chars)' }, { status: 400 })

  // Renaming a verified store drops the badge: verification was granted for
  // the old name, and keeping it would let a verified shop take on another
  // brand's name with the blue tick. (Unverified/pending stores rename freely;
  // a pending review is reset too, since it was for the old name.)
  const { data: existing } = await supabase
    .from('merchant_profiles')
    .select('store_name, verification_status')
    .eq('user_id', user.id)
    .maybeSingle()
  const renamed = !!existing && existing.store_name !== name
  const resetVerification = renamed && existing.verification_status !== 'none'

  const { data, error } = await supabase
    .from('merchant_profiles')
    .upsert({
      user_id: user.id,
      store_name: name,
      logo_url: logoUrl ?? null,
      receive_address: wallet.walletAddress,
      ...(resetVerification ? { verification_status: 'none' } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data, verificationReset: resetVerification })
}
