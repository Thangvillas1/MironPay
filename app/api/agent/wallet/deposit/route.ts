import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { circleClient } from '@/app/lib/circle'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { pinFailureHttp, verifyPin } from '@/app/lib/pin'
import { assertCircleWalletBinding, parseAgentAmount, resolveCanonicalAgentToken } from '@/app/lib/agent-security'

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const depositAmount = parseAgentAmount(body.amount)
    if (depositAmount === null || depositAmount < 0.01) {
      return NextResponse.json({ error: 'Minimum deposit is 0.01 USDC' }, { status: 400 })
    }
    const pinResult = await verifyPin(supabase, user.id, body.pin)
    if (!pinResult.ok) return NextResponse.json({ error: pinResult.error, code: pinResult.code }, pinFailureHttp(pinResult))
    const idempotencyKey = typeof body.idempotencyKey === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotencyKey)
      ? body.idempotencyKey
      : null
    if (!idempotencyKey) return NextResponse.json({ error: 'A stable idempotency key is required.', code: 'IDEMPOTENCY_REQUIRED' }, { status: 400 })

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
    await Promise.all([
      assertCircleWalletBinding(userWallet.circleWalletId, userWallet.walletAddress),
      profile.agent_wallet_id ? assertCircleWalletBinding(profile.agent_wallet_id, profile.agent_wallet_address) : Promise.reject(new Error('AGENT_WALLET_BINDING_MISSING')),
    ])

    const balRes = await circleClient.getWalletTokenBalance({ id: userWallet.circleWalletId })
    const tokenBalances = (balRes.data?.tokenBalances ?? []) as Array<{ amount?: string; token?: { id?: string; symbol?: string; tokenAddress?: string | null } }>
    const usdc = resolveCanonicalAgentToken(tokenBalances, 'USDC')
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
      idempotencyKey,
    })

    const txId = (tx.data as { id?: string } | undefined)?.id
    if (!txId) {
      return NextResponse.json({ error: 'Circle did not return a transaction ID' }, { status: 500 })
    }

    try {
      const confirmed = await circleClient.getTransaction({ id: txId, waitForState: 'COMPLETE', pollingInterval: 1500 })
      const finalTx = (confirmed.data as unknown as { transaction?: { state?: string; txHash?: string } }).transaction
      if (finalTx?.state && ['FAILED', 'CANCELLED', 'DENIED'].includes(finalTx.state)) {
        return NextResponse.json({ error: `Deposit failed (${finalTx.state}).`, code: 'DEPOSIT_FAILED', state: finalTx.state, transactionId: txId, txHash: finalTx.txHash ?? null }, { status: 502 })
      }
      if (finalTx?.state !== 'COMPLETE') {
        return NextResponse.json({ success: false, accepted: true, status: 'pending', state: finalTx?.state, transactionId: txId, txHash: finalTx?.txHash ?? null }, { status: 202 })
      }
      return NextResponse.json({
      success: true, status: 'complete', txHash: finalTx.txHash ?? null,
      transactionId: txId,
      deposited: depositAmount,
      agentWalletAddress: profile.agent_wallet_address,
    })
    } catch {
      return NextResponse.json({ success: false, accepted: true, status: 'pending', transactionId: txId }, { status: 202 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[agent/deposit]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
