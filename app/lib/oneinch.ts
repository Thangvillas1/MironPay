const ONEINCH_BASE = 'https://api.1inch.dev'

// 1inch chain ids for the networks worth quoting on — this tool is
// research-only (compare route/price), unrelated to MironPay's own
// swap execution which only ever runs on ARC via Circle Swap Kit.
export const ONEINCH_CHAINS: Record<string, number> = {
  ethereum: 1, polygon: 137, arbitrum: 42161, optimism: 10, base: 8453, bsc: 56, avalanche: 43114,
}

interface OneInchToken { symbol: string; decimals: number }

// Full token lists are large and change rarely — cache per chain in-memory
// rather than refetching on every quote request.
const TOKEN_LIST_TTL_MS = 10 * 60_000
const tokenListCache = new Map<number, { data: Map<string, OneInchToken>; fetchedAt: number }>()

async function getTokenList(chainId: number): Promise<Map<string, OneInchToken>> {
  const cached = tokenListCache.get(chainId)
  if (cached && Date.now() - cached.fetchedAt < TOKEN_LIST_TTL_MS) return cached.data

  const apiKey = process.env.ONEINCH_API_KEY
  if (!apiKey) throw new Error('ONEINCH_API_KEY not configured')
  const res = await fetch(`${ONEINCH_BASE}/swap/v6.0/${chainId}/tokens`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`1inch token list fetch failed: ${res.status}`)
  const json = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens: Record<string, any> = json.tokens ?? {}
  const map = new Map<string, OneInchToken>()
  for (const [address, t] of Object.entries(tokens)) {
    map.set(address.toLowerCase(), { symbol: t.symbol, decimals: t.decimals })
    map.set(t.symbol.toUpperCase(), { symbol: t.symbol, decimals: t.decimals })
  }
  tokenListCache.set(chainId, { data: map, fetchedAt: Date.now() })
  return map
}

function resolveToken(list: Map<string, OneInchToken>, query: string): { address: string; symbol: string; decimals: number } {
  const key = query.startsWith('0x') ? query.toLowerCase() : query.toUpperCase()
  const token = list.get(key)
  if (!token) throw new Error(`Token "${query}" not found on this chain's 1inch token list`)
  const address = query.startsWith('0x') ? query.toLowerCase() : Array.from(list.entries()).find(([, v]) => v === token)?.[0] ?? query
  return { address, symbol: token.symbol, decimals: token.decimals }
}

export interface SwapQuote {
  chain: string
  srcSymbol: string
  dstSymbol: string
  srcAmount: number
  dstAmount: number
  gasEstimate: number | null
}

export async function fetchSwapQuote(chainName: string, tokenInQuery: string, tokenOutQuery: string, amountHuman: number): Promise<SwapQuote> {
  const chainId = ONEINCH_CHAINS[chainName.toLowerCase()]
  if (!chainId) throw new Error(`Unsupported chain "${chainName}" for swap quotes`)

  const apiKey = process.env.ONEINCH_API_KEY
  if (!apiKey) throw new Error('ONEINCH_API_KEY not configured')

  const list = await getTokenList(chainId)
  const tokenIn = resolveToken(list, tokenInQuery)
  const tokenOut = resolveToken(list, tokenOutQuery)
  const amountWei = BigInt(Math.round(amountHuman * 10 ** tokenIn.decimals)).toString()

  const url = `${ONEINCH_BASE}/swap/v6.0/${chainId}/quote?src=${tokenIn.address}&dst=${tokenOut.address}&amount=${amountWei}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`1inch quote failed: ${res.status} ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  const dstAmountRaw = BigInt(data.dstAmount)

  return {
    chain: chainName.toLowerCase(),
    srcSymbol: tokenIn.symbol,
    dstSymbol: tokenOut.symbol,
    srcAmount: amountHuman,
    dstAmount: Number(dstAmountRaw) / 10 ** tokenOut.decimals,
    gasEstimate: data.gas != null ? Number(data.gas) : null,
  }
}
