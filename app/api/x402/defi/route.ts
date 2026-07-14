import type { NextRequest } from 'next/server'
import { createX402GetHandler } from '@/app/lib/x402-seller'

interface DefiProtocolResult {
  mode: 'protocol'
  name: string
  category: string | null
  chains: string[]
  tvl_usd: number | null
  change_1d_pct: number | null
  change_7d_pct: number | null
  fetchedAt: string
}

interface DefiYieldResult {
  mode: 'top_yield'
  pools: Array<{ project: string; symbol: string; chain: string; apy_pct: number; tvl_usd: number }>
  fetchedAt: string
}

interface DefiProtocolYieldResult {
  mode: 'protocol_yield'
  protocol: string
  pools: Array<{ symbol: string; chain: string; apy_pct: number; tvl_usd: number }>
  fetchedAt: string
}

/** Several DeFiLlama protocol entries can substring-match the same query
 * (e.g. "aave" matches "Aave V3", "Aave V2", "Aavegotchi") — picking
 * whichever the API happens to list first is arbitrary. The one with the
 * largest TVL is the one a user means by the bare name. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findBestProtocolMatch(protocols: any[], q: string) {
  const exact = protocols.find((p) => p.name?.toLowerCase() === q || p.slug?.toLowerCase() === q)
  if (exact) return exact
  const candidates = protocols.filter((p) => p.name?.toLowerCase().includes(q) || p.slug?.toLowerCase().includes(q))
  if (candidates.length === 0) return undefined
  return candidates.reduce((best, p) => (p.tvl ?? 0) > (best.tvl ?? 0) ? p : best)
}

async function fetchProtocolTvl(protocolQuery: string): Promise<DefiProtocolResult> {
  const res = await fetch('https://api.llama.fi/protocols')
  if (!res.ok) throw new Error(`DeFiLlama protocols fetch failed: ${res.status}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const protocols: any[] = await res.json()
  const match = findBestProtocolMatch(protocols, protocolQuery.toLowerCase())
  if (!match) throw new Error(`Protocol "${protocolQuery}" not found on DeFiLlama`)

  return {
    mode: 'protocol',
    name: match.name,
    category: match.category ?? null,
    chains: match.chains ?? [],
    tvl_usd: match.tvl ?? null,
    change_1d_pct: match.change_1d != null ? Number(match.change_1d.toFixed(2)) : null,
    change_7d_pct: match.change_7d != null ? Number(match.change_7d.toFixed(2)) : null,
    fetchedAt: new Date().toISOString(),
  }
}

async function fetchTopYield(): Promise<DefiYieldResult> {
  const res = await fetch('https://yields.llama.fi/pools')
  if (!res.ok) throw new Error(`DeFiLlama yields fetch failed: ${res.status}`)
  const json = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pools: any[] = json.data ?? []

  // Require meaningful TVL and cap APY — pools with tiny liquidity or
  // reward-token-inflated APY (seen up to 600,000%+) aren't realistic yields.
  const top = pools
    .filter((p) => (p.tvlUsd ?? 0) > 5_000_000 && p.apy != null && p.apy < 1000)
    .sort((a, b) => b.apy - a.apy)
    .slice(0, 5)
    .map((p) => ({
      project: p.project,
      symbol: p.symbol,
      chain: p.chain,
      apy_pct: Number(p.apy.toFixed(2)),
      tvl_usd: p.tvlUsd,
    }))

  return { mode: 'top_yield', pools: top, fetchedAt: new Date().toISOString() }
}

/** Top pools for ONE named protocol, e.g. "top APY on Aave" — yields.llama.fi
 * pool `project` is a slug (e.g. "aave-v3", "aave-v4") that a bare protocol
 * name substring-matches directly, unlike the /protocols name matching above. */
async function fetchProtocolYield(protocolQuery: string): Promise<DefiProtocolYieldResult> {
  const res = await fetch('https://yields.llama.fi/pools')
  if (!res.ok) throw new Error(`DeFiLlama yields fetch failed: ${res.status}`)
  const json = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pools: any[] = json.data ?? []
  const q = protocolQuery.toLowerCase()

  // Lower TVL floor than the global top-yield list — a single protocol's
  // pools are naturally smaller than the market-wide top 5, but still filter
  // out dust pools and reward-inflated APY outliers.
  const top = pools
    .filter((p) => p.project?.toLowerCase().includes(q) && (p.tvlUsd ?? 0) > 1_000_000 && p.apy != null && p.apy < 1000)
    .sort((a, b) => b.apy - a.apy)
    .slice(0, 5)
    .map((p) => ({
      symbol: p.symbol,
      chain: p.chain,
      apy_pct: Number(p.apy.toFixed(2)),
      tvl_usd: p.tvlUsd,
    }))
  if (top.length === 0) throw new Error(`No yield pools found for "${protocolQuery}" on DeFiLlama`)

  return { mode: 'protocol_yield', protocol: protocolQuery, pools: top, fetchedAt: new Date().toISOString() }
}

export const GET = createX402GetHandler({
  path: '/api/x402/defi',
  description: 'MironPay DeFi TVL / yield lookup (DeFiLlama)',
  feeAtomicUsdc: '10000', // $0.01 at 6 decimals — placeholder, revisit for mainnet
  fetchData: async (request: NextRequest) => {
    const params = new URL(request.url).searchParams
    const protocol = params.get('protocol')?.trim()
    const metric = params.get('metric')?.trim()
    if (protocol && metric === 'yield') return fetchProtocolYield(protocol)
    if (protocol) return fetchProtocolTvl(protocol)
    return fetchTopYield()
  },
})
