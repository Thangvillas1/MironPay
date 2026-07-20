import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('payroll_runs')
    .select('id, period, status, total_amount, employee_count, created_at, approved_at, paid_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ runs: data })
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { period } = await request.json()
  if (!period || typeof period !== 'string') {
    return NextResponse.json({ error: 'period is required, e.g. "2026-07"' }, { status: 400 })
  }

  // Only one OPEN run per period (partial unique index on the table).
  const { data: existing } = await supabase
    .from('payroll_runs')
    .select('id, status')
    .eq('period', period)
    .neq('status', 'cancelled')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: `An open run for ${period} already exists`, existingRunId: existing.id },
      { status: 409 }
    )
  }

  const { data, error } = await supabase
    .from('payroll_runs')
    .insert({ user_id: user.id, period, status: 'draft' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ run: data })
}
