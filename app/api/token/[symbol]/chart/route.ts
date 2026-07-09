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

const PERIOD_TO_DAYS: Record<string, string> = {
  '1D': '1',
  '1W': '7',
  '1M': '30',
  '3M': '90',
  '1Y': '365',
}

async function cgFetch(path: string, revalidate = 300) {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (process.env.COINGECKO_API_KEY) {
    headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY
  }
  const res = await fetch(`${CG}${path}`, { headers, next: { revalidate } })
  if (!res.ok) throw new Error(`CoinGecko ${res.status}: ${path}`)
  return res.json()
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params
  const upper = symbol.toUpperCase()
  const period = request.nextUrl.searchParams.get('period') ?? '1D'
  const days = PERIOD_TO_DAYS[period] ?? '1'

  const coinId = SYMBOL_TO_ID[upper]
  if (!coinId) {
    return NextResponse.json({ chartData: null })
  }

  try {
    // Longer cache for historical data (it doesn't change)
    const revalidate = days === '1' ? 300 : 3600
    const data = await cgFetch(
      `/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`,
      revalidate
    )
    return NextResponse.json({ chartData: data.prices ?? null })
  } catch (err) {
    console.error('[token/chart]', err instanceof Error ? err.message : err)
    return NextResponse.json({ chartData: null })
  }
}
