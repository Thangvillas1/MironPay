import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { circleSwapAdapter, swapKit, ARC_TESTNET, isNoRouteError, swapKitErrorMessage } from '@/app/lib/circle-swap-kit'

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
      : 1500 // 15% default — testnet liquidity is thin

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
    // waiting for the tx hash. Retry once on a transient "no route" quote.
    let lastErr: unknown = null
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500))
      try {
        const result = await swapKit.swap({
          from: { adapter: circleSwapAdapter, chain: ARC_TESTNET, address: walletAddress },
          tokenIn,
          tokenOut,
          amountIn,
          config: { slippageBps, allowanceStrategy: 'permit' },
        })

        return NextResponse.json({
          transactionId: result.txHash,
          txHash: result.txHash,
          explorerUrl: result.explorerUrl ?? (result.txHash ? `https://testnet.arcscan.app/tx/${result.txHash}` : null),
          amountOut: result.amountOut ?? null,
        })
      } catch (e) {
        lastErr = e
        if (isNoRouteError(e) && attempt === 0) continue
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
