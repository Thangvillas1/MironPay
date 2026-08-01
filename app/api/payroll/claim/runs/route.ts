import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

// Read-only: lists a company's own past payroll runs (most recent first) so
// "New payroll run" can show a real history — who was sent, how much, and
// current status — instead of only ever showing the run just submitted.
// Ownership enforced via `.eq('user_id', user.id)` on both queries, same
// pattern as runs/[runId]/route.ts.
export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: runs, error: runsErr } = await supabase
    .from('payroll_claim_runs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (runsErr) return NextResponse.json({ error: runsErr.message }, { status: 500 })
  if (!runs || runs.length === 0) return NextResponse.json({ runs: [] })

  const runIds = runs.map((r) => r.id)
  const { data: items } = await supabase
    .from('payroll_claim_items')
    .select('run_id, status')
    .eq('user_id', user.id)
    .in('run_id', runIds)

  const statsByRun = new Map<string, { total: number; claimed: number; reclaimed: number }>()
  for (const item of items ?? []) {
    const s = statsByRun.get(item.run_id) ?? { total: 0, claimed: 0, reclaimed: 0 }
    s.total += 1
    if (item.status === 'claimed') s.claimed += 1
    if (item.status === 'reclaimed') s.reclaimed += 1
    statsByRun.set(item.run_id, s)
  }

  const enriched = runs.map((run) => ({
    ...run,
    recipientCount: statsByRun.get(run.id)?.total ?? 0,
    claimedCount: statsByRun.get(run.id)?.claimed ?? 0,
    reclaimedCount: statsByRun.get(run.id)?.reclaimed ?? 0,
  }))

  return NextResponse.json({ runs: enriched })
}
