import type { NextRequest } from 'next/server'
import { createX402GetHandler } from '@/app/lib/x402-seller'

interface StablecoinItem {
  symbol: string
  name: string
  price_usd: number
  peg_type: string
  market_cap_usd: number
}

interface TopStablecoinsResult {
  mode: 'top'
  coins: StablecoinItem[]
  fetchedAt: string
}

interface SingleStablecoinResult {
  mode: 'single'
  coin: StablecoinItem
  fetchedAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getStablecoinsList(): Promise<any[]> {
  const res = await fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true')
  if (!res.ok) throw new Error(`DeFiLlama stablecoins fetch failed: ${res.status}`)
  const json = await res.json()
  return json.peggedAssets ?? []
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toItem(c: any): StablecoinItem {
  return {
    symbol: c.symbol,
    name: c.name,
    price_usd: Number((c.price ?? 1).toFixed(4)),
    peg_type: c.pegType ?? 'unknown',
    market_cap_usd: Math.round(c.circulating?.peggedUSD ?? 0),
  }
}

async function fetchTopStablecoins(): Promise<TopStablecoinsResult> {
  const coins = await getStablecoinsList()
  const top = coins
    .filter((c) => (c.circulating?.peggedUSD ?? 0) > 0)
    .sort((a, b) => b.circulating.peggedUSD - a.circulating.peggedUSD)
    .slice(0, 8)
    .map(toItem)
  return { mode: 'top', coins: top, fetchedAt: new Date().toISOString() }
}

async function fetchSingleStablecoin(query: string): Promise<SingleStablecoinResult> {
  const coins = await getStablecoinsList()
  const q = query.toLowerCase()
  const match = coins.find((c) => c.symbol?.toLowerCase() === q)
    ?? coins.find((c) => c.name?.toLowerCase() === q)
    ?? coins.filter((c) => c.name?.toLowerCase().includes(q))
      .reduce((best, c) => (c.circulating?.peggedUSD ?? 0) > (best?.circulating?.peggedUSD ?? 0) ? c : best, undefined)
  if (!match) throw new Error(`Stablecoin "${query}" not found on DeFiLlama`)
  return { mode: 'single', coin: toItem(match), fetchedAt: new Date().toISOString() }
}

export const GET = createX402GetHandler({
  path: '/api/x402/stablecoins',
  description: 'MironPay stablecoin peg / market cap lookup (DeFiLlama)',
  feeAtomicUsdc: '10000', // $0.01 at 6 decimals — placeholder, revisit for mainnet
  fetchData: async (request: NextRequest) => {
    const symbol = new URL(request.url).searchParams.get('symbol')?.trim()
    return symbol ? fetchSingleStablecoin(symbol) : fetchTopStablecoins()
  },
})
