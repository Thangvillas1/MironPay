import { NextRequest, NextResponse } from 'next/server'
import { circleClient } from '@/app/lib/circle'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { awardVerifiedScore } from '@/app/lib/score-server'
import { pinFailureHttp, verifyPin } from '@/app/lib/pin'

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { destinationAddress, amount, memo, tokenSymbol = 'USDC', pin } = body

  if (!destinationAddress || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return NextResponse.json({ error: 'Invalid destination address or amount' }, { status: 400 })
  }

  const pinResult = await verifyPin(supabase, user.id, pin)
  if (!pinResult.ok) {
    const response = pinFailureHttp(pinResult)
    return NextResponse.json({ error: pinResult.error, code: pinResult.code }, response)
  }

  const wallet = await resolveCircleWalletId(supabase, user.id)
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

  const balanceRes = await circleClient.getWalletTokenBalance({ id: wallet.circleWalletId })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balances = (balanceRes.data?.tokenBalances as any[]) ?? []
  const selectedToken = balances.find((b) => b.token?.symbol === tokenSymbol)

  if (!selectedToken?.token?.id) {
    return NextResponse.json({ error: `${tokenSymbol} not found in wallet` }, { status: 400 })
  }

  if (parseFloat(selectedToken.amount ?? '0') < parseFloat(amount)) {
    return NextResponse.json({ error: `Insufficient ${tokenSymbol} balance` }, { status: 400 })
  }

  const tx = await circleClient.createTransaction({
    walletId: wallet.circleWalletId,
    tokenId: selectedToken.token.id,
    destinationAddress,
    amount: [amount],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: crypto.randomUUID(),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txId = (tx.data as any)?.id
  let txHash: string | null = null

  // Wait until txHash is available (up to 20 seconds)
  if (txId) {
    try {
      const confirmed = await circleClient.getTransaction({
        id: txId,
        waitForState: 'SENT',
        pollingInterval: 1500,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      txHash = (confirmed.data as any)?.transaction?.txHash ?? null
    } catch {
      // On timeout, still return the response without txHash
    }
  }

  // Save memo: await Supabase (fast ~50ms), on-chain remains fire-and-forget
  if (txHash && memo && typeof memo === 'string' && memo.trim()) {
    const memoText = memo.trim()

    const { error: memoErr } = await supabase.from('transaction_memos').insert({
      tx_hash: txHash,
      sender_address: wallet.walletAddress,
      recipient_address: destinationAddress,
      amount: amount,
      memo: memoText,
    })
    if (memoErr) console.error('[memo] supabase insert failed:', memoErr)

    void circleClient.createContractExecutionTransaction({
      walletId: wallet.circleWalletId,
      contractAddress: '0x5294E9927c3306DcBaDb03fe70b92e01cCede505',
      abiFunctionSignature: 'attachMemo(address,bytes,string)',
      abiParameters: [destinationAddress, '0x', memoText],
      fee: { type: 'level', config: { feeLevel: 'LOW' } },
      idempotencyKey: crypto.randomUUID(),
    }).catch(e => console.error('[memo] contract call failed:', e))
  }

  if (txId) {
    await awardVerifiedScore(user.id, 'send', txHash ?? txId)
      .catch(error => console.error('[score/send]', error))
  }

  return NextResponse.json({
    transactionId: txId,
    txHash,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state: (tx.data as any)?.state,
  })
}
