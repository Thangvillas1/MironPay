const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

/**
 * CoinGecko's free/unauthenticated tier rate-limits aggressively (a handful
 * of req/min per IP) and returns 429 under any real testing load. A single
 * retry after a short backoff clears the large majority of these without
 * making the user wait noticeably longer or re-triggering the x402 charge
 * (this runs before the seller settles payment).
 */
export async function fetchWithRetry(url: string, retries = 1, backoffMs = 900): Promise<Response> {
  const res = await fetch(url)
  if (res.status === 429 && retries > 0) {
    await new Promise(r => setTimeout(r, backoffMs))
    return fetchWithRetry(url, retries - 1, backoffMs * 2)
  }
  return res
}

interface CoinGeckoCoin {
  id: string
  name: string
  symbol: string
  market_cap_rank: number | null
}

/** Resolve a ticker symbol (e.g. "BTC") to CoinGecko's internal coin id + display name. */
export async function resolveCoinGeckoId(symbol: string): Promise<{ id: string; name: string }> {
  const res = await fetchWithRetry(`${COINGECKO_BASE}/search?query=${encodeURIComponent(symbol)}`)
  if (!res.ok) throw new Error(`CoinGecko search failed: ${res.status}`)
  const data = await res.json()
  const coins: CoinGeckoCoin[] = data.coins ?? []
  const exact = coins.filter((c) => c.symbol?.toLowerCase() === symbol.toLowerCase())
  const pool = exact.length > 0 ? exact : coins
  if (pool.length === 0) throw new Error(`Token "${symbol}" not found`)
  pool.sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity))
  return { id: pool[0].id, name: pool[0].name }
}

/**
 * Lightweight price + 24h change lookup — no description/sentiment/chart bundle.
 * Free, unpaywalled: used for the wallet's holdings list, NOT the agent's paid
 * x402 `get_token_price` tool (that one needs the full bundle, see
 * app/api/x402/market-data/route.ts).
 */
export async function fetchSimplePrice(symbol: string): Promise<{ priceUsd: number; change24hPct: number | null } | null> {
  try {
    const { id } = await resolveCoinGeckoId(symbol)
    const res = await fetchWithRetry(`${COINGECKO_BASE}/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`)
    if (!res.ok) return null
    const data = await res.json()
    const info = data[id]
    if (!info || info.usd == null) return null
    return {
      priceUsd: info.usd,
      change24hPct: info.usd_24h_change != null ? Number(info.usd_24h_change.toFixed(2)) : null,
    }
  } catch {
    return null
  }
}
