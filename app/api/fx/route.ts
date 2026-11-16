import { NextResponse } from 'next/server'
import { getFxRates } from '@/app/lib/fx'

// Public: exchange rates are not user data.
export async function GET() {
  const fx = await getFxRates()
  if (!fx) return NextResponse.json({ error: 'Exchange rates unavailable' }, { status: 503 })
  return NextResponse.json(fx, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
