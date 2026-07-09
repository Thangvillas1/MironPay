import { createX402GetHandler } from '@/app/lib/x402-seller'

async function fetchFearGreed() {
  const res = await fetch('https://api.alternative.me/fng/?limit=1')
  if (!res.ok) throw new Error(`Fear & Greed fetch failed: ${res.status}`)
  const data = await res.json()
  const point = data.data?.[0]
  if (!point) throw new Error('No Fear & Greed data available')

  return {
    value: Number(point.value),
    classification: point.value_classification as string,
    fetchedAt: new Date(Number(point.timestamp) * 1000).toISOString(),
  }
}

export const GET = createX402GetHandler({
  path: '/api/x402/sentiment',
  description: 'MironPay crypto market sentiment (Fear & Greed Index)',
  feeAtomicUsdc: '10000', // $0.01 at 6 decimals — placeholder, revisit for mainnet
  fetchData: fetchFearGreed,
})
