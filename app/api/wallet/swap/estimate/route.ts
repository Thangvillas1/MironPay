import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { circleSwapAdapter, swapKit, ARC_TESTNET, CIRCLE_KIT_KEY, isNoRouteError, swapKitErrorMessage } from '@/app/lib/circle-swap-kit'

const SUPPORTED_TOKENS = new Set(['USDC', 'EURC'])

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const tokenIn = searchParams.get('tokenIn')
    const tokenOut = searchParams.get('tokenOut')
    const amountIn = searchParams.get('amountIn')
    const slippageBps = Math.min(10000, Math.max(10, parseInt(searchParams.get('slippageBps') ?? '3000')))

    if (!tokenIn || !tokenOut || !amountIn || isNaN(parseFloat(amountIn)) || parseFloat(amountIn) <= 0) {
      return NextResponse.json({ error: 'Missing or invalid params' }, { status: 400 })
    }
    if (!SUPPORTED_TOKENS.has(tokenIn) || !SUPPORTED_TOKENS.has(tokenOut)) {
      return NextResponse.json({ error: `Unsupported token: ${tokenIn} or ${tokenOut}` }, { status: 400 })
    }

    const wallet = await resolveCircleWalletId(supabase, user.id)
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    // Retry with increasing backoff — Circle testnet routing is intermittently flaky
    const RETRY_DELAYS_MS = [1500, 3000, 5000, 8000]
    let lastErr: unknown = null
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]))
      try {
        const estimate = await swapKit.estimate({
          from: { adapter: circleSwapAdapter, chain: ARC_TESTNET, address: wallet.walletAddress },
          tokenIn,
          tokenOut,
          amountIn,
          config: { slippageBps, allowanceStrategy: 'permit', kitKey: CIRCLE_KIT_KEY },
        })

        return NextResponse.json({
          estimatedOutput: estimate.estimatedOutput,
          stopLimit: estimate.stopLimit,
          fees: estimate.fees ?? null,
          amountIn,
          tokenIn,
          tokenOut,
        })
      } catch (e) {
        lastErr = e
        if (!isNoRouteError(e) || attempt >= RETRY_DELAYS_MS.length) break
      }
    }

    if (isNoRouteError(lastErr)) {
      throw new Error('No swap route available on testnet right now. Please try again in a few minutes.')
    }
    throw new Error(swapKitErrorMessage(lastErr) || 'Estimate failed')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[swap/estimate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
