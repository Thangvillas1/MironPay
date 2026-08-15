import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { pinFailureHttp, verifyPin } from '@/app/lib/pin'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { refundContribution } from '@/app/lib/launchpad-chain'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pin } = await request.json()
  const pinResult = await verifyPin(supabase, user.id, pin)
  if (!pinResult.ok) {
    return NextResponse.json({ error: pinResult.error, code: pinResult.code }, pinFailureHttp(pinResult))
  }

  const wallet = await resolveCircleWalletId(supabase, user.id)
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 400 })

  try {
    const { txHash } = await refundContribution(wallet.circleWalletId, wallet.walletAddress, projectId)
    return NextResponse.json({ txHash })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Refund failed' }, { status: 500 })
  }
}
