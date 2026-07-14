import type { NextRequest } from 'next/server'
import { createX402GetHandler } from '@/app/lib/x402-seller'
import { fetchSwapQuote } from '@/app/lib/kyberswap'

export const GET = createX402GetHandler({
  path: '/api/x402/swap-quote',
  description: 'MironPay swap route quote lookup (KyberSwap Aggregator) — price comparison only, never executes a swap',
  feeAtomicUsdc: '10000', // $0.01 at 6 decimals — placeholder, revisit for mainnet
  fetchData: async (request: NextRequest) => {
    const params = new URL(request.url).searchParams
    const tokenIn = params.get('tokenIn')?.trim()
    const tokenOut = params.get('tokenOut')?.trim()
    const amount = params.get('amount')?.trim()
    const chain = params.get('chain')?.trim() || 'ethereum'
    if (!tokenIn || !tokenOut || !amount) throw new Error('Missing "tokenIn", "tokenOut", or "amount" query parameter')

    const quote = await fetchSwapQuote(chain, tokenIn, tokenOut, parseFloat(amount))
    return { ...quote, fetchedAt: new Date().toISOString() }
  },
})
