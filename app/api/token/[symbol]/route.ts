import { NextRequest, NextResponse } from 'next/server'

const CG = 'https://api.coingecko.com/api/v3'

const SYMBOL_TO_ID: Record<string, string> = {
  USDC: 'usd-coin',
  EURC: 'euro-coin',
  USDT: 'tether',
  USDP: 'pax-dollar',
  DAI: 'dai',
  WBTC: 'wrapped-bitcoin',
  WETH: 'weth',
}

async function cgFetch(path: string) {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (process.env.COINGECKO_API_KEY) {
    headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY
  }
  const res = await fetch(`${CG}${path}`, { headers, next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`CoinGecko ${res.status}: ${path}`)
  return res.json()
}

async function resolveId(symbol: string): Promise<string | null> {
  if (SYMBOL_TO_ID[symbol]) return SYMBOL_TO_ID[symbol]
  try {
    const data = await cgFetch(`/search?query=${encodeURIComponent(symbol)}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = (data.coins ?? []).find((c: any) => c.symbol?.toUpperCase() === symbol)
    return match?.id ?? null
  } catch {
    return null
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params
  const upper = symbol.toUpperCase()

  const coinId = await resolveId(upper)
  if (!coinId) {
    return NextResponse.json({ found: false, symbol: upper })
  }

  try {
    const coinData = await cgFetch(
      `/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`
    )
    const md = coinData.market_data ?? {}
    return NextResponse.json({
      found: true,
      coinId,
      symbol: upper,
      name: coinData.name ?? upper,
      logoUrl: coinData.image?.large ?? coinData.image?.small ?? null,
      price: md.current_price?.usd ?? null,
      change24h: md.price_change_percentage_24h ?? null,
      marketCap: md.market_cap?.usd ?? null,
      volume24h: md.total_volume?.usd ?? null,
      circulatingSupply: md.circulating_supply ?? null,
    })
  } catch (err) {
    console.error('[token/meta]', err instanceof Error ? err.message : err)
    return NextResponse.json({ found: false, symbol: upper })
  }
}
