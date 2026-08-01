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

  const { data, error } = await supabase
    .from('merchant_profiles')
    .upsert({
      user_id: user.id,
      store_name: storeName,
      logo_url: logoUrl ?? null,
      receive_address: wallet.walletAddress,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data })
}
