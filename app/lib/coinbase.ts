const COINBASE_BASE = 'https://api.exchange.coinbase.com'

/**
 * Second fallback price source, behind CoinGecko then Binance. Binance's
 * public API now returns 451 "restricted location" for Vercel's serving
 * region (see console logs), so it can no longer be trusted as a fallback.
 * Coinbase Exchange's public market-data endpoints are unauthenticated,
 * unrestricted from US-based infra, and cover the same major pairs.
 */
export async function fetchCoinbasePrice(symbol: string): Promise<{ priceUsd: number; change24hPct: number | null } | null> {
  const pair = `${symbol.toUpperCase()}-USD`
  try {
    const res = await fetch(`${COINBASE_BASE}/products/${pair}/stats`)
    if (!res.ok) {
      console.error(`[coinbase] stats ${pair} failed: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300))
      return null
    }
    const data = await res.json()
    const price = parseFloat(data.last)
    const open = parseFloat(data.open)
    if (!Number.isFinite(price)) return null
    const change = Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : null
    return { priceUsd: price, change24hPct: change != null ? Number(change.toFixed(2)) : null }
  } catch (e) {
    console.error(`[coinbase] stats ${pair} threw:`, e instanceof Error ? e.message : e)
    return null
  }
}

/** ~5-min candles for the last 24h, same shape as CoinGecko's market_chart prices array. */
export async function fetchCoinbaseChart24h(symbol: string): Promise<Array<[number, number]>> {
  try {
    const pair = `${symbol.toUpperCase()}-USD`
    const res = await fetch(`${COINBASE_BASE}/products/${pair}/candles?granularity=300`)
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    // Each candle: [time, low, high, open, close, volume] — oldest last, so reverse to chronological.
    return data
      .map((c: unknown[]) => [Number(c[0]) * 1000, parseFloat(String(c[4]))] as [number, number])
      .reverse()
  } catch {
    return []
  }
}
