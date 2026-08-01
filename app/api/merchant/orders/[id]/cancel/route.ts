import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('merchant_orders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('merchant_user_id', user.id)
    .eq('status', 'pending')
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: 'Only a pending order you own can be cancelled' }, { status: 400 })
  return NextResponse.json({ order: data })
}
