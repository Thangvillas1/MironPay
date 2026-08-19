import { NextRequest, NextResponse } from 'next/server'
import { circleClient } from '@/app/lib/circle'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { awardVerifiedScore } from '@/app/lib/score-server'
import { pinFailureHttp, verifyPin } from '@/app/lib/pin'
import { isSelfTransferAddress, normalizeWalletAddress } from '@/app/lib/self-transfer'
import { ARC_MEMO_CONTRACT } from '@/app/lib/arc-transaction-memo'
import { encodeFunctionData, erc20Abi, isAddress, keccak256, parseUnits, stringToHex } from 'viem'

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

  const normalizedDestination = normalizeWalletAddress(destinationAddress)
  if (!normalizedDestination) {
    return NextResponse.json({ error: 'Recipient address is invalid.', code: 'INVALID_ADDRESS' }, { status: 400 })
  }

  const wallet = await resolveCircleWalletId(supabase, user.id)
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
  if (isSelfTransferAddress(normalizedDestination, [wallet.walletAddress])) {
    return NextResponse.json({
      error: 'You cannot send from Main Wallet back to the same Main Wallet.',
      code: 'SELF_TRANSFER',
    }, { status: 400 })
  }

  const pinResult = await verifyPin(supabase, user.id, pin)
  if (!pinResult.ok) {
    const response = pinFailureHttp(pinResult)
    return NextResponse.json({ error: pinResult.error, code: pinResult.code }, response)
  }

  const balanceRes = await circleClient.getWalletTokenBalance({ id: wallet.circleWalletId })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balances = (balanceRes.data?.tokenBalances as any[]) ?? []
  const matchingTokens = balances.filter((b) => b.token?.symbol === tokenSymbol)
  // Circle can return both native/precompile and ERC-20 representations. The
  // Arc Memo contract needs the actual token contract address.
  const selectedToken = matchingTokens.find((b) => b.token?.tokenAddress) ?? matchingTokens[0]

  if (!selectedToken?.token?.id) {
    return NextResponse.json({ error: `${tokenSymbol} not found in wallet` }, { status: 400 })
  }

  if (parseFloat(selectedToken.amount ?? '0') < parseFloat(amount)) {
    return NextResponse.json({ error: `Insufficient ${tokenSymbol} balance` }, { status: 400 })
  }

  const memoText = typeof memo === 'string' ? memo.trim() : ''
  if (memoText.length > 80) {
    return NextResponse.json({ error: 'Memo must be 80 characters or fewer.', code: 'MEMO_TOO_LONG' }, { status: 400 })
  }

  let tx
  if (memoText) {
    const tokenAddress = selectedToken.token?.tokenAddress as string | undefined
    if (!tokenAddress || !isAddress(tokenAddress)) {
      return NextResponse.json({
        error: `On-chain memo is not available for ${tokenSymbol}.`,
        code: 'MEMO_TOKEN_UNSUPPORTED',
      }, { status: 400 })
    }

    const rawDecimals = Number(selectedToken.token?.decimals ?? 6)
    const decimals = Number.isInteger(rawDecimals) && rawDecimals >= 0 && rawDecimals <= 255 ? rawDecimals : 6
    let atomicAmount: bigint
    try {
      atomicAmount = parseUnits(String(amount), decimals)
    } catch {
      return NextResponse.json({ error: `Invalid ${tokenSymbol} amount.`, code: 'INVALID_AMOUNT' }, { status: 400 })
    }
    if (atomicAmount <= 0n) {
      return NextResponse.json({ error: `Invalid ${tokenSymbol} amount.`, code: 'INVALID_AMOUNT' }, { status: 400 })
    }

    const transferData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [normalizedDestination as `0x${string}`, atomicAmount],
    })
    tx = await circleClient.createContractExecutionTransaction({
      walletId: wallet.circleWalletId,
      contractAddress: ARC_MEMO_CONTRACT,
      abiFunctionSignature: 'memo(address,bytes,bytes32,bytes)',
      abiParameters: [
        tokenAddress,
        transferData,
        keccak256(stringToHex(`mironpay:${crypto.randomUUID()}`)),
        stringToHex(memoText),
      ],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey: crypto.randomUUID(),
    })
  } else {
    tx = await circleClient.createTransaction({
      walletId: wallet.circleWalletId,
      tokenId: selectedToken.token.id,
      destinationAddress: normalizedDestination,
      amount: [amount],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey: crypto.randomUUID(),
    })
  }

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

  // The transfer and memo now share one tx hash. Supabase remains a fast cache;
  // the wallet history can independently recover the memo from Arc events.
  if (txHash && memoText) {
    const [{ error: memoErr }, { error: kindErr }] = await Promise.all([
      supabase.from('transaction_memos').insert({
        tx_hash: txHash,
        sender_address: wallet.walletAddress,
        recipient_address: normalizedDestination,
        amount: String(amount),
        memo: memoText,
      }),
      supabase.from('transaction_kinds').insert({
        tx_hash: txHash,
        kind: 'memo_transfer',
        wallet_address: wallet.walletAddress,
        amount: String(amount),
        token: tokenSymbol,
      }),
    ])
    if (memoErr) console.error('[memo] supabase insert failed:', memoErr)
    if (kindErr) console.error('[memo] transaction kind insert failed:', kindErr)
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
