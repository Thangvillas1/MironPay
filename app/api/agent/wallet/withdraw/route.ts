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
    const amount = parseFloat(body.amount)
    if (isNaN(amount) || amount < 0.01) {
      return NextResponse.json({ error: 'Minimum withdrawal is 0.01 USDC' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('agent_wallet_id, agent_wallet_address, circle_wallet_id')
      .eq('id', user.id)
      .single()

    if (!profile?.agent_wallet_id) {
      return NextResponse.json({ error: 'Agent wallet not initialized' }, { status: 400 })
    }

    const agentBalRes = await circleClient.getWalletTokenBalance({ id: profile.agent_wallet_id })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentTokens: any[] = agentBalRes.data?.tokenBalances ?? []
    const agentUsdc = agentTokens.find((b: any) => b.token?.symbol === 'USDC')
    const agentBalance = parseFloat(agentUsdc?.amount ?? '0')
    const tokenId: string | undefined = agentUsdc?.token?.id

    if (agentBalance < amount) {
      return NextResponse.json({
        error: `Insufficient balance: Agent Wallet has ${agentBalance.toFixed(4)} USDC`,
      }, { status: 400 })
    }

    if (!tokenId) {
      return NextResponse.json({ error: 'USDC not found in Agent Wallet' }, { status: 400 })
    }

    const userWallet = await resolveCircleWalletId(supabase, user.id)
    if (!userWallet?.walletAddress) {
      return NextResponse.json({ error: 'Main wallet not found' }, { status: 404 })
    }

    const tx = await circleClient.createTransaction({
      walletId: profile.agent_wallet_id,
      tokenId,
      destinationAddress: userWallet.walletAddress,
      amount: [amount.toString()],
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
      withdrawn: amount,
      to: userWallet.walletAddress,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[agent/withdraw]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
