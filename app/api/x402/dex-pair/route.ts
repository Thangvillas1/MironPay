import type { NextRequest } from 'next/server'
import { createX402GetHandler } from '@/app/lib/x402-seller'
import { fetchDexPairs } from '@/app/lib/dex'

export const GET = createX402GetHandler({
  path: '/api/x402/dex-pair',
  description: 'MironPay DEX pair price/liquidity lookup (DexScreener, GeckoTerminal fallback)',
  feeAtomicUsdc: '10000', // $0.01 at 6 decimals — placeholder, revisit for mainnet
  fetchData: async (request: NextRequest) => {
    const query = new URL(request.url).searchParams.get('query')?.trim()
    if (!query) throw new Error('Missing "query" query parameter')
    const pairs = await fetchDexPairs(query)
    return { query, pairs, fetchedAt: new Date().toISOString() }
  },
})
