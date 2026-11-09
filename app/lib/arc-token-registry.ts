import { fetchWithRetry } from '@/app/lib/coingecko'

/**
 * Verified token registry for the wallet, keyed by contract address (never
 * by ticker — any contract can call itself "USDC").
 *
 * Addresses / decimals verified 2026-11-08 by querying Arc Testnet directly
 * (name(), symbol(), decimals() over https://rpc.testnet.arc.network,
 * chainId 5042002) — see TOKEN_REGISTRY.md in the mobile repo.
 *
 * Prices come from CoinGecko by FIXED coin id (no ticker search). cirBTC is
 * Circle's 1:1 wrapped BTC, priced at bitcoin.
 */
export interface RegistryToken {
  symbol: string
  name: string
  address: string // lowercase
  decimals: number
  coingeckoId: string
  logoUrl: string
}

export const ARC_TESTNET_TOKENS: RegistryToken[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x3600000000000000000000000000000000000000',
    decimals: 6,
    coingeckoId: 'usd-coin',
    logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    address: '0x89b50855aa3be2f677cd6303cec089b5f319d72a',
    decimals: 6,
    coingeckoId: 'euro-coin',
    logoUrl: 'https://assets.coingecko.com/coins/images/26045/small/euro-coin.png',
  },
  {
    symbol: 'cirBTC',
    name: 'Circle Wrapped Bitcoin',
    address: '0xf0c4a4ce82a5746abaad9425360ab04fbba432bf',
    decimals: 8,
    coingeckoId: 'bitcoin',
    logoUrl: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  },
]

const BY_ADDRESS = new Map(ARC_TESTNET_TOKENS.map((t) => [t.address, t]))
const USDC = ARC_TESTNET_TOKENS[0]

/**
 * Resolve a Circle balance entry to a registry token. Arc's native gas token
 * IS USDC (same balance as the 0x3600… ERC-20, just 18 vs 6 decimals), so a
 * native entry maps to USDC.
 */
export function resolveRegistryToken(token: { tokenAddress?: string | null; isNative?: boolean } | undefined): RegistryToken | null {
  if (!token) return null
  if (token.isNative) return USDC
  const addr = token.tokenAddress?.toLowerCase()
  return addr ? BY_ADDRESS.get(addr) ?? null : null
}

export interface TokenPrice {
  priceUsd: number
  change24hPct: number | null
}

const PRICE_TTL_MS = 60_000
let priceCache: { at: number; prices: Record<string, TokenPrice> } | null = null

/**
 * One batched CoinGecko call for every registry token, cached for 60s so the
 * wallet screen doesn't burn the free tier's tight rate limit. On failure the
 * last good prices are reused (and if there are none, prices are simply
 * missing — callers show "—", never a guessed number).
 */
export async function fetchRegistryPrices(): Promise<Record<string, TokenPrice>> {
  if (priceCache && Date.now() - priceCache.at < PRICE_TTL_MS) return priceCache.prices
  const ids = Array.from(new Set(ARC_TESTNET_TOKENS.map((t) => t.coingeckoId)))
  try {
    const res = await fetchWithRetry(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`
    )
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
    const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>
    const prices: Record<string, TokenPrice> = {}
    for (const id of ids) {
      const row = data[id]
      if (typeof row?.usd === 'number') {
        prices[id] = { priceUsd: row.usd, change24hPct: typeof row.usd_24h_change === 'number' ? row.usd_24h_change : null }
      }
    }
    priceCache = { at: Date.now(), prices }
    return prices
  } catch (error) {
    console.error('[token-registry] price fetch failed:', error)
    return priceCache?.prices ?? {}
  }
}
