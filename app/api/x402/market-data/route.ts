import type { NextRequest } from 'next/server'
import { createX402GetHandler } from '@/app/lib/x402-seller'
import { resolveCoinGeckoId, fetchWithRetry } from '@/app/lib/coingecko'
import { fetchBinancePrice, fetchBinanceChart24h } from '@/app/lib/binance'

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').trim()
}

async function fetchFromCoinGecko(symbol: string) {
  const { id, name } = await resolveCoinGeckoId(symbol)

  // Sequenced, not Promise.all — CoinGecko's free tier rate-limits per IP,
  // and firing both at once doubles the chance of tripping it. The coin
  // lookup matters most (it's what makes the whole call fail), so it goes
  // first and gets the retry budget; the chart is best-effort on top.
  const coinRes = await fetchWithRetry(`${COINGECKO_BASE}/coins/${id}?localization=false&tickers=false&market_data=true&community_data=true&developer_data=true&sparkline=false`)
  if (!coinRes.ok) throw new Error(`CoinGecko price fetch failed: ${coinRes.status}`)
  const coin = await coinRes.json()
  const md = coin.market_data
  if (!md || md.current_price?.usd == null) throw new Error(`No price data for "${symbol}"`)

  // days=1 → ~5-min granularity for the last 24h. UI slices this one series
  // into 1h/4h/24h ranges client-side instead of firing 3 separate x402 calls.
  let chart24h: Array<[number, number]> = []
  const chartRes = await fetchWithRetry(`${COINGECKO_BASE}/coins/${id}/market_chart?vs_currency=usd&days=1`)
  if (chartRes.ok) {
    const chartData = await chartRes.json()
    chart24h = (chartData.prices ?? []) as Array<[number, number]>
  }

  const descriptionEn: string = coin.description?.en ?? ''

  return {
    symbol: symbol.toUpperCase(),
    name,
    price_usd: md.current_price.usd,
    change_24h_pct: md.price_change_percentage_24h != null ? Number(md.price_change_percentage_24h.toFixed(2)) : null,
    market_cap_usd: md.market_cap?.usd ?? null,
    fdv_usd: md.fully_diluted_valuation?.usd ?? null,
    circulating_supply: md.circulating_supply ?? null,
    max_supply: md.max_supply ?? null,
    description: descriptionEn ? stripHtml(descriptionEn).slice(0, 400) : null,
    categories: (coin.categories ?? []).filter(Boolean).slice(0, 5),
    sentiment_up_pct: coin.sentiment_votes_up_percentage ?? null,
    twitter_followers: coin.community_data?.twitter_followers ?? null,
    github_stars: coin.developer_data?.stars ?? null,
    github_commits_4w: coin.developer_data?.commit_count_4_weeks ?? null,
    chart_24h: chart24h,
    fetchedAt: new Date().toISOString(),
  }
}

/**
 * CoinGecko's free tier rate-limits hard on shared IPs (Vercel) and was
 * failing even for BTC. Binance has no key and a much higher limit, so it's
 * the fallback for price/change/chart — its data just doesn't include
 * CoinGecko's richer fields (market cap, FDV, description, socials), which
 * come back null. The x402 fee is only ever charged once a real price is
 * found from either source — both failing still throws before settlement.
 */
async function fetchTokenPrice(symbol: string) {
  try {
    return await fetchFromCoinGecko(symbol)
  } catch (coinGeckoErr) {
    const fallback = await fetchBinancePrice(symbol)
    if (!fallback) {
      throw coinGeckoErr instanceof Error ? coinGeckoErr : new Error(String(coinGeckoErr))
    }
    const chart24h = await fetchBinanceChart24h(symbol)
    return {
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase(),
      price_usd: fallback.priceUsd,
      change_24h_pct: fallback.change24hPct,
      market_cap_usd: null,
      fdv_usd: null,
      circulating_supply: null,
      max_supply: null,
      description: null,
      categories: [] as string[],
      sentiment_up_pct: null,
      twitter_followers: null,
      github_stars: null,
      github_commits_4w: null,
      chart_24h: chart24h,
      fetchedAt: new Date().toISOString(),
    }
  }
}

export const GET = createX402GetHandler({
  path: '/api/x402/market-data',
  description: 'MironPay live token price lookup (any CoinGecko-listed symbol)',
  feeAtomicUsdc: '10000', // $0.01 at 6 decimals — placeholder, revisit for mainnet
  fetchData: async (request: NextRequest) => {
    const symbol = new URL(request.url).searchParams.get('symbol')?.trim()
    if (!symbol) throw new Error('Missing "symbol" query parameter')
    return fetchTokenPrice(symbol)
  },
})
