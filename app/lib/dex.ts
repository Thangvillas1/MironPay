export interface DexPair {
  chain: string
  dex: string
  pairLabel: string
  priceUsd: number
  liquidityUsd: number
  volume24hUsd: number
  change24hPct: number | null
  url: string
}

/** DexScreener's free search endpoint — no API key, no rate-limit key required. */
async function fetchFromDexScreener(query: string): Promise<DexPair[]> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error(`DexScreener fetch failed: ${res.status}`)
  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pairs: any[] = data.pairs ?? []

  return pairs
    .filter((p) => (p.liquidity?.usd ?? 0) > 1000)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
    .slice(0, 5)
    .map((p) => ({
      chain: p.chainId,
      dex: p.dexId,
      pairLabel: `${p.baseToken?.symbol}/${p.quoteToken?.symbol}`,
      priceUsd: Number(p.priceUsd),
      liquidityUsd: Math.round(p.liquidity?.usd ?? 0),
      volume24hUsd: Math.round(p.volume?.h24 ?? 0),
      change24hPct: p.priceChange?.h24 != null ? Number(p.priceChange.h24.toFixed(2)) : null,
      url: p.url,
    }))
}

/**
 * Fallback for when DexScreener is unavailable. GeckoTerminal's pool search
 * doesn't inline token symbols — they come back as separate `included`
 * records that have to be resolved by id, unlike DexScreener's flat shape.
 */
async function fetchFromGeckoTerminal(query: string): Promise<DexPair[]> {
  const res = await fetch(`https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(query)}&include=base_token,quote_token`)
  if (!res.ok) throw new Error(`GeckoTerminal fetch failed: ${res.status}`)
  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokensById = new Map<string, any>((data.included ?? []).map((t: any) => [t.id, t]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pools: any[] = data.data ?? []

  return pools
    .map((p) => {
      const a = p.attributes
      const baseId = p.relationships?.base_token?.data?.id
      const quoteId = p.relationships?.quote_token?.data?.id
      const baseSymbol = tokensById.get(baseId)?.attributes?.symbol ?? '?'
      const quoteSymbol = tokensById.get(quoteId)?.attributes?.symbol ?? '?'
      return {
        chain: p.id?.split('_')[0] ?? 'unknown',
        dex: p.relationships?.dex?.data?.id ?? 'unknown',
        pairLabel: `${baseSymbol}/${quoteSymbol}`,
        priceUsd: Number(a.base_token_price_usd),
        liquidityUsd: Math.round(Number(a.total_reserve_in_usd ?? 0)),
        volume24hUsd: Math.round(Number(a.volume_usd?.h24 ?? 0)),
        change24hPct: a.price_change_percentage?.h24 != null ? Number(Number(a.price_change_percentage.h24).toFixed(2)) : null,
        url: `https://www.geckoterminal.com/${p.id?.split('_')[0]}/pools/${a.address}`,
      }
    })
    .filter((p) => p.liquidityUsd > 1000)
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
    .slice(0, 5)
}

export async function fetchDexPairs(query: string): Promise<DexPair[]> {
  try {
    const pairs = await fetchFromDexScreener(query)
    if (pairs.length > 0) return pairs
    throw new Error('No pairs found on DexScreener')
  } catch (dexScreenerErr) {
    const pairs = await fetchFromGeckoTerminal(query)
    if (pairs.length === 0) {
      throw dexScreenerErr instanceof Error ? dexScreenerErr : new Error(String(dexScreenerErr))
    }
    return pairs
  }
}
