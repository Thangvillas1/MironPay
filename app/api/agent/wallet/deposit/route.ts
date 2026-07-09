import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { circleClient } from '@/app/lib/circle'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const depositAmount = parseFloat(body.amount)
    if (isNaN(depositAmount) || depositAmount < 0.01) {
      return NextResponse.json({ error: 'Minimum deposit is 0.01 USDC' }, { status: 400 })
    }

    const userWallet = await resolveCircleWalletId(supabase, user.id)
    if (!userWallet) return NextResponse.json({ error: 'Main wallet not found' }, { status: 404 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('agent_wallet_address, agent_wallet_id')
      .eq('id', user.id)
      .single()

    if (!profile?.agent_wallet_address) {
      return NextResponse.json({ error: 'Agent wallet not initialized. Visit the Agent page first.' }, { status: 400 })
    }

    const balRes = await circleClient.getWalletTokenBalance({ id: userWallet.circleWalletId })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokenBalances: any[] = balRes.data?.tokenBalances ?? []
    const usdc = tokenBalances.find((b: any) => b.token?.symbol === 'USDC')
    const userBalance = parseFloat(usdc?.amount ?? '0')
    const tokenId: string | undefined = usdc?.token?.id

    if (userBalance < depositAmount) {
      return NextResponse.json({
        error: `Insufficient balance: you have ${userBalance.toFixed(4)} USDC`,
      }, { status: 400 })
    }

    if (!tokenId) {
      return NextResponse.json({ error: 'USDC token not found in main wallet' }, { status: 400 })
    }

    const tx = await circleClient.createTransaction({
      walletId: userWallet.circleWalletId,
      tokenId,
      destinationAddress: profile.agent_wallet_address,
      amount: [depositAmount.toString()],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey: crypto.randomUUID(),
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txId = (tx.data as any)?.id
    if (!txId) {
      return NextResponse.json({ error: 'Circle did not return a transaction ID' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      transactionId: txId,
      deposited: depositAmount,
      agentWalletAddress: profile.agent_wallet_address,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[agent/deposit]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
