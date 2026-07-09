import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000'
const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const ARC_CHAIN = 'Arc_Testnet'
const KIT_BASE_URL = 'https://api.circle.com'

const TOKEN_MAP: Record<string, string> = {
  USDC: USDC_ADDRESS,
  EURC: EURC_ADDRESS,
}

function toBaseUnits(amount: string, decimals = 6): string {
  return Math.floor(parseFloat(amount) * Math.pow(10, decimals)).toString()
}

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
    const slippageBps = Math.min(10000, Math.max(10, parseInt(searchParams.get('slippageBps') ?? '1500')))

    if (!tokenIn || !tokenOut || !amountIn || isNaN(parseFloat(amountIn)) || parseFloat(amountIn) <= 0) {
      return NextResponse.json({ error: 'Missing or invalid params' }, { status: 400 })
    }
    if (!TOKEN_MAP[tokenIn] || !TOKEN_MAP[tokenOut]) {
      return NextResponse.json({ error: `Unsupported token: ${tokenIn} or ${tokenOut}` }, { status: 400 })
    }

    const wallet = await resolveCircleWalletId(supabase, user.id)
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    const swapBody = {
      tokenInAddress: TOKEN_MAP[tokenIn],
      tokenInChain: ARC_CHAIN,
      tokenOutAddress: TOKEN_MAP[tokenOut],
      tokenOutChain: ARC_CHAIN,
      fromAddress: wallet.walletAddress,
      toAddress: wallet.walletAddress,
      amount: toBaseUnits(amountIn),
      slippageBps,
    }

    // Retry once — Circle testnet routing is intermittently flaky
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null
    let lastErr = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 500))
      const res = await fetch(`${KIT_BASE_URL}/v1/stablecoinKits/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CIRCLE_KIT_KEY}` },
        body: JSON.stringify(swapBody),
      })
      const text = await res.text()
      if (res.ok) {
        data = JSON.parse(text)
        break
      }
      let parsed: { code?: number; message?: string } = {}
      try { parsed = JSON.parse(text) } catch { /* ok */ }
      if (parsed.code === 331001) {
        lastErr = 'No swap route available on testnet right now. Please try again in a few minutes.'
        break // no route is not transient — retrying won't help
      } else {
        lastErr = `Stablecoin service error ${res.status}: ${text}`
        break // non-transient error, don't retry
      }
    }
    if (!data) throw new Error(lastErr)

    const estimatedRaw: string | null = data.estimatedAmount ?? null
    const minOutRaw: string | null = data.transaction?.executionParams?.instructions?.[1]?.minTokenOut ?? null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const providerFees: any[] = data.fees?.provider ?? []
    const fees = providerFees.length > 0
      ? providerFees.map((f: { token: string; amount: string }) => ({
          amount: (parseInt(f.amount) / 1e6).toFixed(6),
          token: tokenIn,
          type: 'provider',
        }))
      : null

    return NextResponse.json({
      estimatedOutput: estimatedRaw
        ? { amount: (parseInt(estimatedRaw) / 1e6).toFixed(6), token: tokenOut }
        : null,
      stopLimit: minOutRaw
        ? { amount: (parseInt(minOutRaw) / 1e6).toFixed(6), token: tokenOut }
        : null,
      fees,
      amountIn,
      tokenIn,
      tokenOut,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[swap/estimate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
