import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { circleClient } from '@/app/lib/circle'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { dedupeTokenBalancesBySymbol } from '@/app/lib/token-balance-dedupe'
import { calculateWithdrawalAvailability } from '@/app/lib/withdrawal-amount'
import { classifyTransactionError } from '@/app/lib/transaction-error'

const SUPPORTED_TOKENS = new Set(['USDC', 'EURC'])

type AgentTokenBalance = {
  amount?: string
  token?: { id?: string; symbol?: string }
}

type WithdrawalQuote = {
  agentWalletId: string
  destinationAddress: string
  tokenId: string
  tokenSymbol: 'USDC' | 'EURC'
  balance: number
  estimatedFee: number
  feeReserve: number
  maxAmount: number
}

type QuoteResult =
  | { ok: true; quote: WithdrawalQuote }
  | { ok: false; status: number; body: Record<string, unknown> }

function requestedToken(value: unknown): 'USDC' | 'EURC' | null {
  const symbol = typeof value === 'string' ? value.trim().toUpperCase() : 'USDC'
  return SUPPORTED_TOKENS.has(symbol) ? symbol as 'USDC' | 'EURC' : null
}

async function buildWithdrawalQuote(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  tokenSymbol: 'USDC' | 'EURC',
): Promise<QuoteResult> {
  const [{ data: profile }, userWallet] = await Promise.all([
    supabase
      .from('profiles')
      .select('agent_wallet_id')
      .eq('id', userId)
      .single(),
    resolveCircleWalletId(supabase, userId),
  ])

  if (!profile?.agent_wallet_id) {
    return { ok: false, status: 400, body: { error: 'Agent Wallet is not initialized.', code: 'AGENT_WALLET_NOT_FOUND' } }
  }
  if (!userWallet?.walletAddress) {
    return { ok: false, status: 404, body: { error: 'Main Wallet was not found.', code: 'MAIN_WALLET_NOT_FOUND' } }
  }

  const balanceResponse = await circleClient.getWalletTokenBalance({ id: profile.agent_wallet_id })
  const rawBalances = (balanceResponse.data?.tokenBalances ?? []) as AgentTokenBalance[]
  const balances = dedupeTokenBalancesBySymbol(rawBalances)
  const selected = balances.find(balance => balance.token?.symbol?.toUpperCase() === tokenSymbol)
  const usdc = balances.find(balance => balance.token?.symbol?.toUpperCase() === 'USDC')
  const balance = Number(selected?.amount ?? 0)
  const usdcGasBalance = Number(usdc?.amount ?? 0)
  const tokenId = selected?.token?.id

  if (!tokenId || balance < 0.01) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `Agent Wallet does not have at least 0.01 ${tokenSymbol} available to withdraw.`,
        code: 'INSUFFICIENT_TOKEN_BALANCE',
      },
    }
  }

  try {
    const estimate = await circleClient.estimateTransferFee({
      walletId: profile.agent_wallet_id,
      tokenId,
      destinationAddress: userWallet.walletAddress,
      amount: ['0.01'],
    })
    const estimateData = estimate.data as unknown as {
      data?: { medium?: { networkFee?: string; networkFeeRaw?: string } }
      medium?: { networkFee?: string; networkFeeRaw?: string }
    }
    const medium = estimateData.data?.medium ?? estimateData.medium
    const estimatedFee = Number(medium?.networkFee ?? medium?.networkFeeRaw)
    if (!Number.isFinite(estimatedFee) || estimatedFee < 0) {
      return {
        ok: false,
        status: 503,
        body: {
          error: 'The ARC network fee could not be estimated. Max withdrawal is disabled; please try again.',
          code: 'FEE_ESTIMATE_UNAVAILABLE',
          retryable: true,
        },
      }
    }

    const availability = calculateWithdrawalAvailability({
      tokenSymbol,
      tokenBalance: balance,
      usdcGasBalance,
      estimatedNetworkFee: estimatedFee,
    })
    if (!availability.canPayFee || availability.maxAmount < 0.01) {
      return {
        ok: false,
        status: 400,
        body: {
          error: `Not enough USDC to reserve the estimated ARC network fee (${availability.feeReserve.toFixed(6)} USDC).`,
          code: 'INSUFFICIENT_GAS',
          retryable: false,
        },
      }
    }

    return {
      ok: true,
      quote: {
        agentWalletId: profile.agent_wallet_id,
        destinationAddress: userWallet.walletAddress,
        tokenId,
        tokenSymbol,
        balance,
        estimatedFee,
        feeReserve: availability.feeReserve,
        maxAmount: availability.maxAmount,
      },
    }
  } catch (error) {
    const failure = classifyTransactionError(error, { operation: 'send', token: tokenSymbol })
    console.error('[agent/withdraw] fee estimation failed:', error)
    return { ok: false, status: failure.status, body: failure }
  }
}

async function authenticatedRequest(request: NextRequest) {
  const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!accessToken) return null
  const supabase = createServerSupabaseClient(accessToken)
  const { data: { user } } = await supabase.auth.getUser()
  return user ? { supabase, user } : null
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticatedRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const tokenSymbol = requestedToken(request.nextUrl.searchParams.get('token'))
    if (!tokenSymbol) return NextResponse.json({ error: 'Only USDC and EURC can be withdrawn.', code: 'UNSUPPORTED_TOKEN' }, { status: 400 })

    const result = await buildWithdrawalQuote(auth.supabase, auth.user.id, tokenSymbol)
    if (!result.ok) return NextResponse.json(result.body, { status: result.status })
    const { balance, estimatedFee, feeReserve, maxAmount } = result.quote
    return NextResponse.json({ token: tokenSymbol, balance, estimatedFee, feeReserve, maxAmount })
  } catch (error) {
    const failure = classifyTransactionError(error, { operation: 'send' })
    console.error('[agent/withdraw] quote failed:', error)
    return NextResponse.json(failure, { status: failure.status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticatedRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const tokenSymbol = requestedToken(body.token)
    if (!tokenSymbol) return NextResponse.json({ error: 'Only USDC and EURC can be withdrawn.', code: 'UNSUPPORTED_TOKEN' }, { status: 400 })

    const result = await buildWithdrawalQuote(auth.supabase, auth.user.id, tokenSymbol)
    if (!result.ok) return NextResponse.json(result.body, { status: result.status })
    const quote = result.quote
    const requestedAmount = Number(body.amount)
    const amount = body.max === true ? quote.maxAmount : requestedAmount

    if (!Number.isFinite(amount) || amount < 0.01) {
      return NextResponse.json({ error: `Minimum withdrawal is 0.01 ${tokenSymbol}.`, code: 'INVALID_AMOUNT' }, { status: 400 })
    }
    if (amount > quote.maxAmount) {
      return NextResponse.json({
        error: `Maximum available after reserving the ARC network fee is ${quote.maxAmount.toFixed(6)} ${tokenSymbol}.`,
        code: 'AMOUNT_EXCEEDS_SAFE_MAX',
        maxAmount: quote.maxAmount,
        feeReserve: quote.feeReserve,
      }, { status: 400 })
    }

    const transaction = await circleClient.createTransaction({
      walletId: quote.agentWalletId,
      tokenId: quote.tokenId,
      destinationAddress: quote.destinationAddress,
      amount: [amount.toString()],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey: crypto.randomUUID(),
    })
    const txId = (transaction.data as { id?: string } | undefined)?.id
    if (!txId) {
      return NextResponse.json({ error: 'Circle did not accept the withdrawal request.', code: 'TRANSACTION_NOT_ACCEPTED' }, { status: 502 })
    }

    let state = 'QUEUED'
    let txHash: string | null = null
    try {
      const latest = await circleClient.getTransaction({ id: txId })
      const tx = (latest.data as unknown as { transaction?: { state?: string; txHash?: string } })?.transaction
      state = tx?.state ?? state
      txHash = tx?.txHash ?? null
    } catch (statusError) {
      console.warn('[agent/withdraw] status check deferred:', statusError)
    }

    if (['FAILED', 'CANCELLED', 'DENIED'].includes(state)) {
      return NextResponse.json({
        error: `Circle rejected the withdrawal before broadcast (${state}).`,
        code: 'WITHDRAWAL_REJECTED',
        transactionId: txId,
      }, { status: 502 })
    }

    const sent = ['SENT', 'CONFIRMED', 'COMPLETE'].includes(state)
    return NextResponse.json({
      success: sent,
      accepted: true,
      status: sent ? 'sent' : 'pending',
      state,
      transactionId: txId,
      txHash,
      withdrawn: amount,
      token: tokenSymbol,
      estimatedFee: quote.estimatedFee,
      feeReserve: quote.feeReserve,
      to: quote.destinationAddress,
    }, { status: sent ? 200 : 202 })
  } catch (error) {
    const failure = classifyTransactionError(error, { operation: 'send' })
    console.error('[agent/withdraw] transaction failed:', error)
    return NextResponse.json(failure, { status: failure.status })
  }
}
