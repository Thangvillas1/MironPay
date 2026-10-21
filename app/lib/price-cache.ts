import { fetchSimplePrice } from '@/app/lib/coingecko'

type Price = Awaited<ReturnType<typeof fetchSimplePrice>>

// The wallet endpoints are polled every few seconds by every open tab, and
// each uncached lookup costs two CoinGecko calls (search + price). From
// Vercel's shared IPs those hit 429 constantly, and the retry/backoff +
// Coinbase/Binance fallback chain then adds seconds to every wallet load —
// worse the more requests run at once. A price that is a minute old is fine
// for a holdings list, so cache per warm instance and share in-flight lookups.
const HIT_TTL_MS = 60_000
const MISS_TTL_MS = 30_000

const cache = new Map<string, { value: Price; expiresAt: number }>()
const inFlight = new Map<string, Promise<Price>>()

export async function cachedSimplePrice(symbol: string): Promise<Price> {
  const key = symbol.toUpperCase()
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value

  const pending = inFlight.get(key)
  if (pending) return pending

  const lookup = fetchSimplePrice(key)
    .catch(() => null)
    .then((value) => {
      // On a failed refresh keep serving the last good price rather than
      // flipping the holdings list to "unpriced".
      const fallback = value ?? hit?.value ?? null
      cache.set(key, { value: fallback, expiresAt: Date.now() + (fallback ? HIT_TTL_MS : MISS_TTL_MS) })
      return fallback
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, lookup)
  return lookup
}
