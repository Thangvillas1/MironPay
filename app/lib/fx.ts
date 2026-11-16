import { fetchWithRetry } from '@/app/lib/coingecko'

// USD → fiat rates for the wallet's "Conversion currency". CoinGecko's
// exchange_rates (refreshed every few minutes, includes VND) is the main
// source; open.er-api.com (daily, no key) is the fallback when CoinGecko
// rate-limits Vercel's shared IPs.
export const FX_CURRENCIES = ['EUR', 'VND', 'GBP', 'JPY', 'SGD'] as const

export interface FxRates {
  base: 'USD'
  rates: Record<string, number>
  source: 'coingecko' | 'er-api'
  /** When the rates were fetched (ms). */
  updatedAt: number
}

const TTL_MS = 10 * 60_000
let cache: FxRates | null = null
let inFlight: Promise<FxRates | null> | null = null

function complete(rates: Record<string, number>) {
  return FX_CURRENCIES.every((c) => Number.isFinite(rates[c]) && rates[c] > 0)
}

async function fromCoinGecko(): Promise<FxRates | null> {
  const res = await fetchWithRetry('https://api.coingecko.com/api/v3/exchange_rates', 1)
  if (!res.ok) return null
  const data = (await res.json()) as { rates?: Record<string, { value: number }> }
  const usd = data.rates?.usd?.value
  if (!usd) return null
  const rates: Record<string, number> = { USD: 1 }
  for (const c of FX_CURRENCIES) rates[c] = (data.rates?.[c.toLowerCase()]?.value ?? NaN) / usd
  return complete(rates) ? { base: 'USD', rates, source: 'coingecko', updatedAt: Date.now() } : null
}

async function fromErApi(): Promise<FxRates | null> {
  const res = await fetch('https://open.er-api.com/v6/latest/USD')
  if (!res.ok) return null
  const data = (await res.json()) as { result?: string; rates?: Record<string, number> }
  if (data.result !== 'success' || !data.rates) return null
  const rates: Record<string, number> = { USD: 1 }
  for (const c of FX_CURRENCIES) rates[c] = data.rates[c]
  return complete(rates) ? { base: 'USD', rates, source: 'er-api', updatedAt: Date.now() } : null
}

/** Cached per warm instance; on a failed refresh the last good rates are kept. */
export async function getFxRates(): Promise<FxRates | null> {
  if (cache && Date.now() - cache.updatedAt < TTL_MS) return cache
  if (inFlight) return inFlight
  inFlight = (async () => {
    const fresh = (await fromCoinGecko().catch(() => null)) ?? (await fromErApi().catch(() => null))
    if (fresh) cache = fresh
    return cache
  })().finally(() => {
    inFlight = null
  })
  return inFlight
}
