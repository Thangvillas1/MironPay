const COINSTATS_BASE = 'https://openapiv1.coinstats.app'

// Chains confirmed to work against CoinStats' /wallet/balances endpoint as of
// 2026-07-15 — several common slugs (bsc, solana, tron) returned "Invalid
// blockchain(s)" when tested and were left out rather than guessed at.
export const COINSTATS_DEFAULT_CHAINS = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base', 'avalanche', 'fantom']

export interface WalletToken {
  symbol: string
  name: string
  amount: number
  usd_value: number
  rank: number | null
}

export interface ChainBalance {
  blockchain: string
  tokens: WalletToken[]
  total_usd: number
}

/**
 * Wallet-balance APIs (this one included) reflect whatever tokens exist
 * on-chain for an address, including spam airdrops that spoof a real
 * token's symbol/name/rank to inflate displayed USD value with a fake
 * balance amount (seen: a fake "DOT" with a $849M implied value). Rank
 * filtering alone doesn't catch this — the spoofed token can carry the
 * real asset's legitimate rank. A hard per-token USD ceiling is a blunt
 * but necessary second filter for a tool whose answers get relayed to
 * users as fact.
 */
const MAX_PLAUSIBLE_TOKEN_USD = 1_000_000
const MIN_RANK_FOR_TRUST = 500

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toWalletToken(b: any): WalletToken {
  return {
    symbol: b.symbol,
    name: b.name,
    amount: b.amount,
    usd_value: Number((b.amount * (b.price ?? 0)).toFixed(2)),
    rank: b.rank ?? null,
  }
}

/**
 * Look up token balances for an address across one or more chains.
 * `chains` should use CoinStats' input slugs (e.g. "polygon", "arbitrum") —
 * the response's own `blockchain` field may differ (e.g. "polygon-pos").
 */
export async function fetchWalletBalances(address: string, chains: string[]): Promise<ChainBalance[]> {
  const apiKey = process.env.COINSTATS_API_KEY
  if (!apiKey) throw new Error('COINSTATS_API_KEY not configured')

  const res = await fetch(`${COINSTATS_BASE}/wallet/balances?address=${encodeURIComponent(address)}&blockchain=${chains.join(',')}`, {
    headers: { 'X-API-KEY': apiKey },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`CoinStats wallet lookup failed: ${res.status} ${body.slice(0, 200)}`)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any[] = await res.json()

  return data.map((chain) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trusted = (chain.balances ?? []).filter((b: any) => {
      const usd = b.amount * (b.price ?? 0)
      if (usd > MAX_PLAUSIBLE_TOKEN_USD) return false
      // Native coin balance (no contract address) is always trusted regardless of rank.
      if (!b.contractAddress) return true
      return b.rank != null && b.rank < MIN_RANK_FOR_TRUST
    })
    const tokens: WalletToken[] = trusted.map(toWalletToken).sort((a: WalletToken, b: WalletToken) => b.usd_value - a.usd_value)
    return {
      blockchain: chain.blockchain,
      tokens,
      total_usd: Number(tokens.reduce((s, t) => s + t.usd_value, 0).toFixed(2)),
    }
  })
}
