import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, handle, wallet_address, favorite, created_at, updated_at')
    .eq('owner_user_id', user.id)
    .order('favorite', { ascending: false })
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contacts: data ?? [] })
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const name = cleanText(body.name, 80)
  const handle = cleanText(body.handle, 80) || null
  if (!name) return NextResponse.json({ error: 'Contact name is required' }, { status: 400 })

  let walletAddress: string
  try {
    walletAddress = getAddress(cleanText(body.address, 42))
  } catch {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      owner_user_id: user.id,
      name,
      handle,
      wallet_address: walletAddress,
      favorite: body.favorite === true,
    })
    .select('id, name, handle, wallet_address, favorite, created_at, updated_at')
    .single()
  if (error?.code === '23505') return NextResponse.json({ error: 'This wallet is already in your contacts' }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contact: data }, { status: 201 })
}
