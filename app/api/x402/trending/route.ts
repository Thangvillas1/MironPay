import { createX402GetHandler } from '@/app/lib/x402-seller'
import { fetchWithRetry } from '@/app/lib/coingecko'
import { fetchBinanceTopGainers } from '@/app/lib/binance'

interface TrendingItem {
  symbol: string
  name: string
  market_cap_rank: number | null
  price_usd: number | null
  change_24h_pct: number | null
}

async function fetchFromCoinGecko(): Promise<TrendingItem[]> {
  const res = await fetchWithRetry('https://api.coingecko.com/api/v3/search/trending')
  if (!res.ok) throw new Error(`CoinGecko trending fetch failed: ${res.status}`)
  const data = await res.json()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.coins ?? []).slice(0, 7).map((c: any) => {
    const item = c.item
    const change = item.data?.price_change_percentage_24h?.usd
    return {
      symbol: (item.symbol ?? '').toUpperCase(),
      name: item.name,
      market_cap_rank: item.market_cap_rank ?? null,
      price_usd: item.data?.price ?? null,
      change_24h_pct: change != null ? Number(change.toFixed(2)) : null,
    }
  })
}

/**
 * CoinGecko's trending endpoint is search-volume based (what people are
 * looking up) — Binance has no equivalent, so its fallback is framed as top
 * 24h gainers instead when CoinGecko is unavailable. Close enough to "what's
 * hot right now" to keep the agent answering instead of erroring out.
 */
async function fetchTrending() {
  try {
    return { coins: await fetchFromCoinGecko(), fetchedAt: new Date().toISOString() }
  } catch (coinGeckoErr) {
    const gainers = await fetchBinanceTopGainers()
    if (gainers.length === 0) {
      throw coinGeckoErr instanceof Error ? coinGeckoErr : new Error(String(coinGeckoErr))
    }
    const coins: TrendingItem[] = gainers.map(g => ({
      symbol: g.symbol, name: g.symbol, market_cap_rank: null, price_usd: g.priceUsd, change_24h_pct: g.change24hPct,
    }))
    return { coins, fetchedAt: new Date().toISOString() }
  }
}

export const GET = createX402GetHandler({
  path: '/api/x402/trending',
  description: 'MironPay trending tokens lookup (CoinGecko trending)',
  feeAtomicUsdc: '10000', // $0.01 at 6 decimals — placeholder, revisit for mainnet
  fetchData: fetchTrending,
})
