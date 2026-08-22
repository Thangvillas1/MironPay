import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { circleSwapAdapter, swapKit, ARC_TESTNET, CIRCLE_KIT_KEY, isNoRouteError, swapKitErrorMessage } from '@/app/lib/circle-swap-kit'
import { awardVerifiedScore } from '@/app/lib/score-server'
import { sameAgentAction, verifyAgentIntent, type AgentAction } from '@/app/lib/agent-intent'
import { classifyTransactionError } from '@/app/lib/transaction-error'
import { pinFailureHttp, verifyPin } from '@/app/lib/pin'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { assertCircleWalletBinding } from '@/app/lib/agent-security'

const SUPPORTED_TOKENS = new Set(['USDC', 'EURC'])

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { tokenIn, tokenOut, amountIn, slippageBps: rawSlippage, agentIntentProof, pin } = body
    const slippageBps: number = typeof rawSlippage === 'number'
      ? Math.min(10000, Math.max(10, rawSlippage))
      : 3000 // 30% default — testnet liquidity is thin

    if (!tokenIn || !tokenOut || !amountIn || isNaN(parseFloat(amountIn)) || parseFloat(amountIn) <= 0) {
      return NextResponse.json({ error: 'Missing or invalid params' }, { status: 400 })
    }
    if (!SUPPORTED_TOKENS.has(tokenIn) || !SUPPORTED_TOKENS.has(tokenOut)) {
      return NextResponse.json({ error: `Unsupported token: ${tokenIn} or ${tokenOut}` }, { status: 400 })
    }

    if (typeof agentIntentProof !== 'string') {
      const pinResult = await verifyPin(supabase, user.id, pin)
      if (!pinResult.ok) {
        const response = pinFailureHttp(pinResult)
        return NextResponse.json({ error: pinResult.error, code: pinResult.code }, response)
      }
    }

    // Agent swaps require the exact short-lived intent minted by /api/agent/chat.
    // The wallet is always resolved server-side; callers can never choose an
    // arbitrary Circle-managed address.
    let walletAddress: string
    if (typeof agentIntentProof === 'string') {
      const intent = verifyAgentIntent(agentIntentProof, user.id)
      const expectedAction: AgentAction = {
        type: 'swap', tokenIn, tokenOut, amount: String(amountIn), walletSource: 'agent',
      }
      if (!intent || !sameAgentAction(intent.action, expectedAction)) {
        return NextResponse.json({ error: 'Invalid or expired Agent swap intent.', code: 'INVALID_INTENT' }, { status: 403 })
      }

      const { error: intentUseError } = await createAdminSupabaseClient().from('agent_intent_uses').insert({
        nonce: intent.nonce,
        user_id: user.id,
        expires_at: new Date(intent.expiresAt).toISOString(),
      })
      if (intentUseError) {
        const replay = intentUseError.code === '23505'
        return NextResponse.json({
          error: replay ? 'This Agent command has already been executed.' : 'Agent intent verification is temporarily unavailable.',
          code: replay ? 'INTENT_REPLAYED' : 'INTENT_LEDGER_UNAVAILABLE',
        }, { status: replay ? 409 : 503 })
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('agent_wallet_id, agent_wallet_address')
        .eq('id', user.id)
        .single()
      if (!profile?.agent_wallet_id || !profile.agent_wallet_address) {
        return NextResponse.json({ error: 'Agent wallet not initialized.' }, { status: 400 })
      }
      await assertCircleWalletBinding(profile.agent_wallet_id, profile.agent_wallet_address)
      walletAddress = profile.agent_wallet_address
    } else {
      const wallet = await resolveCircleWalletId(supabase, user.id)
      if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
      walletAddress = wallet.walletAddress
    }

    // SwapKit handles the full flow: fresh quote, allowance (permit with
    // fallback to approve, bundled into the swap call — no separate approve
    // transaction needed on supported tokens), calldata, submission and
    // waiting for the tx hash. Retry on a transient "no route" quote with
    // increasing backoff — testnet liquidity can reappear a few seconds later.
    const RETRY_DELAYS_MS = [1500, 3000, 5000, 8000]
    let lastErr: unknown = null
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]))
      try {
        const result = await swapKit.swap({
          from: { adapter: circleSwapAdapter, chain: ARC_TESTNET, address: walletAddress },
          tokenIn,
          tokenOut,
          amountIn,
          config: { slippageBps, allowanceStrategy: 'permit', kitKey: CIRCLE_KIT_KEY },
        })

        // Circle's transaction list only ever reports a generic Sent/Received
        // for this — tag the tx_hash so the history UI can show it as a swap
        // instead (see app/lib/activity-icon.tsx, which keys off "swap" in
        // the description). Best-effort: a failed insert shouldn't fail the
        // swap that already succeeded on-chain.
        if (result.txHash) {
          await supabase.from('transaction_kinds').insert({
            tx_hash: result.txHash, kind: 'swap', wallet_address: walletAddress,
          }).then(undefined, () => {})
          await awardVerifiedScore(user.id, 'swap', result.txHash)
            .catch(error => console.error('[score/swap]', error))
        }

        return NextResponse.json({
          transactionId: result.txHash,
          txHash: result.txHash,
          explorerUrl: result.explorerUrl ?? (result.txHash ? `https://testnet.arcscan.app/tx/${result.txHash}` : null),
          amountOut: result.amountOut ?? null,
        })
      } catch (e) {
        lastErr = e
        if (isNoRouteError(e) && attempt < RETRY_DELAYS_MS.length) continue
        break
      }
    }

    if (isNoRouteError(lastErr)) {
      return NextResponse.json({
        error: 'No swap route available on testnet right now. Please try again in a few minutes.',
        code: 'NO_SWAP_ROUTE',
        retryable: true,
      }, { status: 400 })
    }
    const message = swapKitErrorMessage(lastErr)
    if (message.includes('0xe52970aa')) {
      return NextResponse.json({
        error: 'Slippage too low — order could not be matched. Try again with higher slippage.',
        code: 'SLIPPAGE_TOO_LOW',
        retryable: true,
        slippageTooLow: true,
      }, { status: 400 })
    }
    const failure = classifyTransactionError(lastErr ?? message, { operation: 'swap', token: tokenIn })
    console.error('[swap/execute] swap failed:', lastErr)
    return NextResponse.json(failure, { status: failure.status })
  } catch (err) {
    const failure = classifyTransactionError(err, { operation: 'swap' })
    console.error('[swap/execute] unexpected failure:', err)
    return NextResponse.json(failure, { status: failure.status })
  }
}
