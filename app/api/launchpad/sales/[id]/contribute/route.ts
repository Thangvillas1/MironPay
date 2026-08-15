import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { pinFailureHttp, verifyPin } from '@/app/lib/pin'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { contributeToSale } from '@/app/lib/launchpad-chain'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { amount, pin } = await request.json()
  const parsedAmount = parseFloat(amount)
  if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  }

  const pinResult = await verifyPin(supabase, user.id, pin)
  if (!pinResult.ok) {
    return NextResponse.json({ error: pinResult.error, code: pinResult.code }, pinFailureHttp(pinResult))
  }

  const admin = createAdminSupabaseClient()
  const { data: sale } = await admin.from('launchpad_sales').select('project_id').eq('project_id', projectId).maybeSingle()
  if (!sale) return NextResponse.json({ error: `"${projectId}" is not a live Launchpad sale.` }, { status: 404 })

  const wallet = await resolveCircleWalletId(supabase, user.id)
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 400 })

  try {
    const { txHash } = await contributeToSale(wallet.circleWalletId, wallet.walletAddress, projectId, parsedAmount)

    await supabase.from('launchpad_contributions').insert({
      project_id: projectId, user_id: user.id, amount: parsedAmount, tx_hash: txHash,
    })

    return NextResponse.json({ txHash })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Contribution failed' }, { status: 500 })
  }
}
