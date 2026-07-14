import type { NextRequest } from 'next/server'
import { createX402GetHandler } from '@/app/lib/x402-seller'
import { fetchWalletBalances, COINSTATS_DEFAULT_CHAINS } from '@/app/lib/coinstats'

export const GET = createX402GetHandler({
  path: '/api/x402/wallet-lookup',
  description: 'MironPay wallet portfolio lookup (CoinStats, multi-chain) — read-only, never executes anything',
  feeAtomicUsdc: '10000', // $0.01 at 6 decimals — placeholder, revisit for mainnet
  fetchData: async (request: NextRequest) => {
    const params = new URL(request.url).searchParams
    const address = params.get('address')?.trim()
    if (!address) throw new Error('Missing "address" query parameter')
    const chainsParam = params.get('chains')?.trim()
    const chains = chainsParam ? chainsParam.split(',').map((c) => c.trim()).filter(Boolean) : COINSTATS_DEFAULT_CHAINS

    const chainBalances = await fetchWalletBalances(address, chains)
    const totalUsd = Number(chainBalances.reduce((s, c) => s + c.total_usd, 0).toFixed(2))
    return { address, chains: chainBalances, total_usd: totalUsd, fetchedAt: new Date().toISOString() }
  },
})
