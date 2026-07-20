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

  const { data: existing, error: fetchErr } = await supabase
    .from('payroll_employees')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const body = await request.json()
  const { name, isActive, walletAddress, confirmed } = body

  // Wallet-address change is a distinct, logged action — never silently
  // combined with name/is_active edits.
  if (walletAddress !== undefined) {
    if (confirmed !== true) {
      return NextResponse.json({ error: 'Wallet change must be explicitly confirmed' }, { status: 400 })
    }
    let checksummed: string
    try {
      checksummed = getAddress(walletAddress)
    } catch {
      return NextResponse.json({ error: 'Invalid wallet address checksum' }, { status: 400 })
    }

    const { error: logErr } = await supabase.from('payroll_employee_wallet_changes').insert({
      employee_row_id: existing.id,
      user_id: user.id,
      old_wallet: existing.wallet_address,
      new_wallet: checksummed,
    })
    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 })

    const { data, error } = await supabase
      .from('payroll_employees')
      .update({ wallet_address: checksummed, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ employee: data })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) patch.name = name
  if (isActive !== undefined) patch.is_active = isActive

  const { data, error } = await supabase
    .from('payroll_employees')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ employee: data })
}
