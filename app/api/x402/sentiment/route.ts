import { createX402GetHandler } from '@/app/lib/x402-seller'

interface FearGreedResult {
  value: number
  classification: string
  fetchedAt: string
  stale?: boolean
}

// alternative.me is effectively the only free Fear & Greed source — there's
// no real second provider to fall back to. Best available degradation is
// serving the last successful reading (marked stale) instead of a hard
// error. Per-instance only (Fluid Compute), same tradeoff already accepted
// for the price cache in the chat route.
let lastGood: FearGreedResult | null = null

async function fetchFearGreed(): Promise<FearGreedResult> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1')
    if (!res.ok) throw new Error(`Fear & Greed fetch failed: ${res.status}`)
    const data = await res.json()
    const point = data.data?.[0]
    if (!point) throw new Error('No Fear & Greed data available')

    lastGood = {
      value: Number(point.value),
      classification: point.value_classification as string,
      fetchedAt: new Date(Number(point.timestamp) * 1000).toISOString(),
    }
    return lastGood
  } catch (err) {
    if (lastGood) return { ...lastGood, stale: true }
    throw err
  }
}

export const GET = createX402GetHandler({
  path: '/api/x402/sentiment',
  description: 'MironPay crypto market sentiment (Fear & Greed Index)',
  feeAtomicUsdc: '10000', // $0.01 at 6 decimals — placeholder, revisit for mainnet
  fetchData: fetchFearGreed,
})
