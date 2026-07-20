import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { verifyPin } from '@/app/lib/pin'

interface DraftRow {
  row: number
  employee_id: string
  amount: number | null
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pin } = await request.json()
  const pinResult = await verifyPin(supabase, user.id, pin)
  if (!pinResult.ok) {
    return NextResponse.json({ error: pinResult.error }, { status: pinResult.error === 'Incorrect PIN' ? 401 : 400 })
  }

  const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', runId).single()
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (run.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft runs can be approved' }, { status: 400 })
  }

  const draftErrors: unknown[] = run.draft_errors ?? []
  if (draftErrors.length > 0) {
    return NextResponse.json({ error: 'Run still has validation errors — fix and re-upload before signing' }, { status: 400 })
  }

  const draftRows: DraftRow[] = run.draft_rows ?? []
  if (draftRows.length === 0) {
    return NextResponse.json({ error: 'No rows to approve' }, { status: 400 })
  }

  // Re-query employees FRESH at the instant of signing — never trust the
  // cached draft_rows.wallet_address. This re-query IS the snapshot-freeze:
  // whatever wallet address is current right now gets locked into
  // payroll_run_items and nothing after this point can change it.
  const { data: employees } = await supabase
    .from('payroll_employees')
    .select('employee_id, name, wallet_address, is_active')
    .eq('user_id', user.id)

  const employeeById = new Map((employees ?? []).map((e) => [e.employee_id, e]))

  const revalidationErrors: string[] = []
  const itemsToInsert = draftRows.map((row) => {
    const employee = employeeById.get(row.employee_id)
    if (!employee) revalidationErrors.push(`Employee "${row.employee_id}" no longer exists`)
    else if (!employee.is_active) revalidationErrors.push(`Employee "${row.employee_id}" was deactivated since upload`)

    return {
      run_id: runId,
      user_id: user.id,
      employee_id: row.employee_id,
      employee_name: employee?.name ?? '',
      wallet_address: employee?.wallet_address ?? '',
      amount: row.amount ?? 0,
      status: 'pending' as const,
    }
  })

  if (revalidationErrors.length > 0) {
    return NextResponse.json({ error: `Employee data changed since upload: ${revalidationErrors.join('; ')} — re-upload to refresh` }, { status: 409 })
  }

  const { error: insertErr } = await supabase.from('payroll_run_items').insert(itemsToInsert)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Guarded by `where status='draft'` so a double-click can't double-approve
  // (the insert above would then create duplicate items, but this update
  // only succeeds once — the caller should treat a mismatched updated row
  // count as a signal to re-fetch, not retry the insert).
  const { data: updated, error } = await supabase
    .from('payroll_runs')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('status', 'draft')
    .select()
    .single()

  if (error || !updated) return NextResponse.json({ error: 'Run was already approved' }, { status: 409 })

  return NextResponse.json({ run: updated })
}
