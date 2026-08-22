import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { reconcileAgentReservations } from '@/app/lib/agent-transaction-lifecycle'

export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const txId = request.nextUrl.searchParams.get('txId') ?? undefined
  const transactions = await reconcileAgentReservations(user.id, txId)
  return NextResponse.json({ transactions })
}
