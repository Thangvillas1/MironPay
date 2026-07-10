const BINANCE_BASE = 'https://api.binance.com/api/v3'

/**
 * Fallback price source for when CoinGecko's free tier rate-limits us
 * (common on Vercel's shared IP pool). Binance's public market-data
 * endpoints have no API key and a far higher rate limit, but only cover
 * tokens that actually trade against USDT on Binance, and carry none of
 * CoinGecko's richer metadata (market cap, description, socials, etc.).
 */
export async function fetchBinancePrice(symbol: string): Promise<{ priceUsd: number; change24hPct: number | null } | null> {
  try {
    const pair = `${symbol.toUpperCase()}USDT`
    const res = await fetch(`${BINANCE_BASE}/ticker/24hr?symbol=${pair}`)
    if (!res.ok) return null
    const data = await res.json()
    const price = parseFloat(data.lastPrice)
    if (!Number.isFinite(price)) return null
    const change = parseFloat(data.priceChangePercent)
    return { priceUsd: price, change24hPct: Number.isFinite(change) ? Number(change.toFixed(2)) : null }
  } catch {
    return null
  }
}

/** ~5-min candles for the last 24h, same shape as CoinGecko's market_chart prices array. */
export async function fetchBinanceChart24h(symbol: string): Promise<Array<[number, number]>> {
  try {
    const pair = `${symbol.toUpperCase()}USDT`
    const res = await fetch(`${BINANCE_BASE}/klines?symbol=${pair}&interval=5m&limit=288`)
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data.map((k: unknown[]) => [Number(k[0]), parseFloat(String(k[4]))] as [number, number])
  } catch {
    return []
  }
}
