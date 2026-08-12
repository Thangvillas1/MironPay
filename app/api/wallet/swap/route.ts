import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { circleSwapAdapter, swapKit, ARC_TESTNET, CIRCLE_KIT_KEY, isNoRouteError, swapKitErrorMessage } from '@/app/lib/circle-swap-kit'
import { awardVerifiedScore } from '@/app/lib/score-server'

const SUPPORTED_TOKENS = new Set(['USDC', 'EURC'])

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { tokenIn, tokenOut, amountIn, slippageBps: rawSlippage, overrideWalletId, overrideWalletAddress } = body
    const slippageBps: number = typeof rawSlippage === 'number'
      ? Math.min(10000, Math.max(10, rawSlippage))
      : 3000 // 30% default — testnet liquidity is thin

    if (!tokenIn || !tokenOut || !amountIn || isNaN(parseFloat(amountIn)) || parseFloat(amountIn) <= 0) {
      return NextResponse.json({ error: 'Missing or invalid params' }, { status: 400 })
    }
    if (!SUPPORTED_TOKENS.has(tokenIn) || !SUPPORTED_TOKENS.has(tokenOut)) {
      return NextResponse.json({ error: `Unsupported token: ${tokenIn} or ${tokenOut}` }, { status: 400 })
    }

    // Allow the agent to swap from a different wallet (agent wallet)
    const isAgentWallet = !!(overrideWalletId && overrideWalletAddress)
    let walletAddress: string
    if (isAgentWallet) {
      walletAddress = overrideWalletAddress
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
      }, { status: 400 })
    }
    const message = swapKitErrorMessage(lastErr)
    if (message.includes('0xe52970aa')) {
      return NextResponse.json({
        error: 'Slippage too low — order could not be matched. Try again with higher slippage.',
        slippageTooLow: true,
      }, { status: 400 })
    }
    return NextResponse.json({ error: message || 'Swap failed' }, { status: 500 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[swap/execute]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
