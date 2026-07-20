import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('payroll_employees')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ employees: data })
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { employeeId, name, walletAddress, confirmed } = body

  if (!employeeId || !name || !walletAddress) {
    return NextResponse.json({ error: 'employeeId, name and walletAddress are required' }, { status: 400 })
  }
  if (confirmed !== true) {
    return NextResponse.json({ error: 'Wallet address must be explicitly confirmed' }, { status: 400 })
  }

  let checksummed: string
  try {
    checksummed = getAddress(walletAddress)
  } catch {
    return NextResponse.json({ error: 'Invalid wallet address checksum' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('payroll_employees')
    .insert({
      user_id: user.id,
      employee_id: employeeId,
      name,
      wallet_address: checksummed,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `employee_id "${employeeId}" already exists` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ employee: data })
}
