import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import Papa from 'papaparse'
import { getAddress } from 'viem'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { circleClient } from '@/app/lib/circle'

interface CsvRow {
  employee_id?: string
  amount?: string
  note?: string
}

interface DraftRow {
  row: number
  employee_id: string
  amount: number | null
  note: string | null
  employee_name: string | null
  wallet_address: string | null
  resolved: boolean
}

interface DraftError {
  row: number
  field: string
  message: string
}

// Rough network-fee buffer for the eventual batch payout (see spec P3: must
// check total + fee against balance before allowing a signature, not just
// at execute time).
const EST_FEE_BUFFER_USDC = 0.5

export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', runId).single()
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (run.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft runs can be uploaded to' }, { status: 400 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required (multipart form field "file")' }, { status: 400 })
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer())
  const fileHash = createHash('sha256').update(fileBuffer).digest('hex')
  const text = fileBuffer.toString('utf8')

  const parsed = Papa.parse<CsvRow>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() })

  if (parsed.errors.length > 0) {
    return NextResponse.json({ error: `CSV parse error: ${parsed.errors[0].message}` }, { status: 400 })
  }

  const headers = parsed.meta.fields ?? []
  if (!headers.includes('employee_id') || !headers.includes('amount')) {
    return NextResponse.json(
      { error: 'File must have "employee_id" and "amount" columns (optional "note"). No wallet or name column — those come from the employee record.' },
      { status: 400 }
    )
  }

  const { data: employees } = await supabase
    .from('payroll_employees')
    .select('employee_id, name, wallet_address, is_active')
    .eq('user_id', user.id)

  const employeeById = new Map((employees ?? []).map((e) => [e.employee_id, e]))

  const draftRows: DraftRow[] = []
  const draftErrors: DraftError[] = []
  const seenIds = new Set<string>()
  let total = 0

  parsed.data.forEach((raw, idx) => {
    const rowNum = idx + 2 // +1 for 0-index, +1 for header row
    const employeeId = (raw.employee_id ?? '').trim()
    const amountRaw = (raw.amount ?? '').trim()
    const note = raw.note?.trim() || null

    if (!employeeId) {
      draftErrors.push({ row: rowNum, field: 'employee_id', message: 'Empty employee_id' })
      draftRows.push({ row: rowNum, employee_id: employeeId, amount: null, note, employee_name: null, wallet_address: null, resolved: false })
      return
    }

    if (seenIds.has(employeeId)) {
      draftErrors.push({ row: rowNum, field: 'employee_id', message: `Duplicate employee_id "${employeeId}" in this file` })
    }
    seenIds.add(employeeId)

    const employee = employeeById.get(employeeId)
    if (!employee) {
      draftErrors.push({ row: rowNum, field: 'employee_id', message: `Unknown employee_id "${employeeId}" — add them in Employees first` })
    } else if (!employee.is_active) {
      draftErrors.push({ row: rowNum, field: 'employee_id', message: `Employee "${employeeId}" is inactive` })
    }

    const amount = amountRaw === '' || isNaN(Number(amountRaw)) ? null : Number(amountRaw)
    if (amount === null || amount <= 0) {
      draftErrors.push({ row: rowNum, field: 'amount', message: `Invalid amount "${amountRaw}" — must be a positive number` })
    }

    let checksummedWallet: string | null = null
    if (employee?.wallet_address) {
      try {
        checksummedWallet = getAddress(employee.wallet_address)
      } catch {
        draftErrors.push({ row: rowNum, field: 'wallet_address', message: `Stored wallet for "${employeeId}" fails checksum validation` })
      }
    }

    if (amount !== null && amount > 0) total += amount

    draftRows.push({
      row: rowNum,
      employee_id: employeeId,
      amount,
      note,
      employee_name: employee?.name ?? null,
      wallet_address: checksummedWallet,
      resolved: !!employee,
    })
  })

  // Balance check — hard error if total + est. fee exceeds company balance.
  const wallet = await resolveCircleWalletId(supabase, user.id)
  if (wallet) {
    try {
      const balanceRes = await circleClient.getWalletTokenBalance({ id: wallet.circleWalletId })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const balances = (balanceRes.data?.tokenBalances as any[]) ?? []
      const usdc = balances.find((b) => b.token?.symbol === 'USDC' && b.token?.tokenAddress)
      const available = usdc ? parseFloat(usdc.amount) : 0
      if (total + EST_FEE_BUFFER_USDC > available) {
        draftErrors.push({
          row: 0,
          field: 'total',
          message: `Total ${total.toFixed(2)} USDC + est. fee exceeds company wallet balance (${available.toFixed(2)} USDC)`,
        })
      }
    } catch {
      // If balance lookup fails, don't silently pass — surface it as a blocking error.
      draftErrors.push({ row: 0, field: 'total', message: 'Could not verify company wallet balance — try again' })
    }
  }

  const { data: updated, error } = await supabase
    .from('payroll_runs')
    .update({
      file_hash: fileHash,
      draft_rows: draftRows,
      draft_errors: draftErrors,
      total_amount: total,
      employee_count: draftRows.length,
    })
    .eq('id', runId)
    .eq('status', 'draft')
    .select()
    .single()

  if (error || !updated) return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 })

  return NextResponse.json({ run: updated, items: draftRows, errors: draftErrors })
}
