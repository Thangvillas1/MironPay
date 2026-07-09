import { createX402GetHandler } from '@/app/lib/x402-seller'
import { fetchWithRetry } from '@/app/lib/coingecko'

interface TrendingItem {
  symbol: string
  name: string
  market_cap_rank: number | null
  price_usd: number | null
  change_24h_pct: number | null
}

async function fetchTrending() {
  const res = await fetchWithRetry('https://api.coingecko.com/api/v3/search/trending')
  if (!res.ok) throw new Error(`CoinGecko trending fetch failed: ${res.status}`)
  const data = await res.json()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coins: TrendingItem[] = (data.coins ?? []).slice(0, 7).map((c: any) => {
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

  return { coins, fetchedAt: new Date().toISOString() }
}

export const GET = createX402GetHandler({
  path: '/api/x402/trending',
  description: 'MironPay trending tokens lookup (CoinGecko trending)',
  feeAtomicUsdc: '10000', // $0.01 at 6 decimals — placeholder, revisit for mainnet
  fetchData: fetchTrending,
})
