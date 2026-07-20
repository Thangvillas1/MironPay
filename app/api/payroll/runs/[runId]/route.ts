import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: run, error } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('id', runId)
    .single()

  if (error || !run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  if (run.status === 'draft') {
    return NextResponse.json({
      run,
      items: run.draft_rows,
      errors: run.draft_errors,
    })
  }

  const { data: items, error: itemsErr } = await supabase
    .from('payroll_run_items')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true })

  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })

  return NextResponse.json({ run, items, errors: [] })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('payroll_runs')
    .update({ status: 'cancelled' })
    .eq('id', runId)
    .eq('status', 'draft') // only cancellable while draft
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Only draft runs can be cancelled' }, { status: 400 })
  }

  return NextResponse.json({ run: data })
}
