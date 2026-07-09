import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { setOnChainLimit } from '@/app/lib/spending-limit'

export async function PUT(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { daily_limit } = await request.json()
  const limit = parseFloat(daily_limit)
  if (isNaN(limit) || limit < 0.01) {
    return NextResponse.json({ error: 'Minimum limit is 0.01 USDC' }, { status: 400 })
  }

  // Get agent wallet address for on-chain storage
  const { data: profile } = await supabase
    .from('profiles').select('agent_wallet_address').eq('id', user.id).single()

  // Write to Supabase (fast, immediate effect)
  const { error: dbError } = await supabase
    .from('agent_wallets')
    .update({ daily_limit: limit })
    .eq('user_id', user.id)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  // Write to chain (fire-and-forget — non-blocking)
  let txHash: string | null = null
  if (profile?.agent_wallet_address) {
    txHash = await setOnChainLimit(profile.agent_wallet_address, limit)
    if (txHash) {
      console.log(`[limit] Set ${limit} USDC on-chain for ${profile.agent_wallet_address}: ${txHash}`)
    }
  }

  return NextResponse.json({
    success: true,
    daily_limit: limit,
    onChain: !!txHash,
    txHash,
  })
}
