const KYBERSWAP_BASE = 'https://aggregator-api.kyberswap.com'

// KyberSwap's own input slugs — confirmed against the official demo repo
// (KyberNetwork/ks-aggregator-api-demo, src/libs/constants.ts), not guessed.
export const KYBERSWAP_CHAINS: Record<string, string> = {
  ethereum: 'ethereum', polygon: 'polygon', arbitrum: 'arbitrum', optimism: 'optimism',
  base: 'base', bsc: 'bsc', avalanche: 'avalanche',
}

// CoinGecko asset platform ids for the same chain set, used only to resolve
// an arbitrary token contract's decimals (KyberSwap's route response gives
// USD values directly, but the request still needs amountIn in wei).
const COINGECKO_PLATFORM: Record<string, string> = {
  ethereum: 'ethereum', polygon: 'polygon-pos', arbitrum: 'arbitrum-one', optimism: 'optimistic-ethereum',
  base: 'base', bsc: 'binance-smart-chain', avalanche: 'avalanche',
}

// Covers the overwhelming majority of real queries without a network call —
// CoinGecko's contract endpoint (rate-limited free tier) is the fallback,
// not the default path.
const KNOWN_DECIMALS: Record<string, number> = {
  USDC: 6, USDT: 6, DAI: 18, WETH: 18, WBTC: 8, ETH: 18, BNB: 18, MATIC: 18, POL: 18,
  ARB: 18, OP: 18, AVAX: 18, FRAX: 18, GHO: 18,
}

const NATIVE_PLACEHOLDER = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

async function resolveDecimals(chainName: string, tokenQuery: string): Promise<number> {
  const upper = tokenQuery.toUpperCase()
  if (KNOWN_DECIMALS[upper] != null) return KNOWN_DECIMALS[upper]
  if (!tokenQuery.startsWith('0x')) throw new Error(`Unknown token "${tokenQuery}" — use a known symbol or a contract address`)

  const platform = COINGECKO_PLATFORM[chainName]
  const res = await fetch(`https://api.coingecko.com/api/v3/coins/${platform}/contract/${tokenQuery.toLowerCase()}`)
  if (!res.ok) throw new Error(`Could not resolve decimals for "${tokenQuery}" on ${chainName}`)
  const data = await res.json()
  const decimals = data.detail_platforms?.[platform]?.decimal_place
  if (decimals == null) throw new Error(`Could not resolve decimals for "${tokenQuery}" on ${chainName}`)
  return decimals
}

function resolveAddress(tokenQuery: string): string {
  if (tokenQuery.startsWith('0x')) return tokenQuery
  if (tokenQuery.toUpperCase() === 'ETH' || tokenQuery.toUpperCase() === 'BNB' || tokenQuery.toUpperCase() === 'MATIC' || tokenQuery.toUpperCase() === 'AVAX') {
    return NATIVE_PLACEHOLDER
  }
  throw new Error(`"${tokenQuery}" must be a contract address (only native coin symbols are accepted as bare symbols)`)
}

export interface SwapQuote {
  chain: string
  tokenInSymbol: string
  tokenOutSymbol: string
  amountIn: number
  amountInUsd: number | null
  amountOutUsd: number | null
  gasUsd: number | null
  route: string[]
}

export async function fetchSwapQuote(chainName: string, tokenInQuery: string, tokenOutQuery: string, amountHuman: number): Promise<SwapQuote> {
  const chain = KYBERSWAP_CHAINS[chainName.toLowerCase()]
  if (!chain) throw new Error(`Unsupported chain "${chainName}" for swap quotes`)

  const tokenInDecimals = await resolveDecimals(chainName.toLowerCase(), tokenInQuery)
  const tokenInAddress = resolveAddress(tokenInQuery)
  const tokenOutAddress = resolveAddress(tokenOutQuery)
  const amountInWei = BigInt(Math.round(amountHuman * 10 ** tokenInDecimals)).toString()

  const url = `${KYBERSWAP_BASE}/${chain}/api/v1/routes?tokenIn=${tokenInAddress}&tokenOut=${tokenOutAddress}&amountIn=${amountInWei}`
  const res = await fetch(url, { headers: { 'X-Client-Id': 'MironPay' } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`KyberSwap route fetch failed: ${res.status} ${body.slice(0, 200)}`)
  }
  const json = await res.json()
  const summary = json.data?.routeSummary
  if (!summary) throw new Error('KyberSwap returned no route for this pair')

  const exchanges = [...new Set((summary.route ?? []).flat().map((hop: { exchange?: string }) => hop.exchange).filter(Boolean))] as string[]

  return {
    chain: chainName.toLowerCase(),
    tokenInSymbol: tokenInQuery.startsWith('0x') ? tokenInQuery : tokenInQuery.toUpperCase(),
    tokenOutSymbol: tokenOutQuery.startsWith('0x') ? tokenOutQuery : tokenOutQuery.toUpperCase(),
    amountIn: amountHuman,
    amountInUsd: summary.amountInUsd != null ? Number(Number(summary.amountInUsd).toFixed(2)) : null,
    amountOutUsd: summary.amountOutUsd != null ? Number(Number(summary.amountOutUsd).toFixed(2)) : null,
    gasUsd: summary.gasUsd != null ? Number(Number(summary.gasUsd).toFixed(2)) : null,
    route: exchanges,
  }
}
