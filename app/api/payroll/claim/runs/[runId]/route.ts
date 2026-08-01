import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

// Read-only: fetches a company's own payroll run plus its items, so the
// "New payroll run" result screen can render the real Claim Boxes table
// (status, tx hash, reclaim eligibility) instead of the bare txHash the
// pay endpoint returns. Ownership is enforced via `.eq('user_id', user.id)`
// on both queries — a company can only ever see its own runs.
export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: run, error: runErr } = await supabase
    .from('payroll_claim_runs')
    .select('*')
    .eq('id', runId)
    .eq('user_id', user.id)
    .single()
  if (runErr || !run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const { data: items, error: itemsErr } = await supabase
    .from('payroll_claim_items')
    .select('*')
    .eq('run_id', runId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })

  return NextResponse.json({ run, items: items ?? [] })
}
