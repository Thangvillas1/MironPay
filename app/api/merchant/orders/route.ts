import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

const ORDER_WINDOW_SECONDS = 180

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('merchant_profiles').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Set up your store first' }, { status: 400 })

  const { amount } = await request.json()
  const amountNum = parseFloat(amount)
  if (isNaN(amountNum) || amountNum <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  }

  const expiresAt = new Date(Date.now() + ORDER_WINDOW_SECONDS * 1000)

  const { data, error } = await supabase
    .from('merchant_orders')
    .insert({ merchant_user_id: user.id, amount: amountNum, expires_at: expiresAt.toISOString() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: data })
}

export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const range = request.nextUrl.searchParams.get('range')
  let query = supabase
    .from('merchant_orders')
    .select('*')
    .eq('merchant_user_id', user.id)
    .order('created_at', { ascending: false })

  if (range === 'today') {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    query = query.gte('created_at', startOfDay.toISOString())
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const paidOrders = (data ?? []).filter((o) => o.status === 'paid')
  const totalToday = paidOrders.reduce((sum, o) => sum + parseFloat(o.paid_amount ?? o.amount), 0)

  return NextResponse.json({ orders: data ?? [], totalPaid: totalToday, paidCount: paidOrders.length })
}
