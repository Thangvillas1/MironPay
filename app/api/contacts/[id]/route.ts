import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
    if (!name) return NextResponse.json({ error: 'Contact name is required' }, { status: 400 })
    update.name = name
  }
  if ('handle' in body) update.handle = typeof body.handle === 'string' ? body.handle.trim().slice(0, 80) || null : null
  if ('favorite' in body) update.favorite = body.favorite === true
  if ('address' in body) {
    try {
      update.wallet_address = getAddress(typeof body.address === 'string' ? body.address.trim() : '')
    } catch {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }
  }
  if (Object.keys(update).length === 1) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await supabase
    .from('contacts')
    .update(update)
    .eq('id', id)
    .eq('owner_user_id', user.id)
    .select('id, name, handle, wallet_address, favorite, created_at, updated_at')
    .maybeSingle()
  if (error?.code === '23505') return NextResponse.json({ error: 'This wallet is already in your contacts' }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  return NextResponse.json({ contact: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', id)
    .eq('owner_user_id', user.id)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
