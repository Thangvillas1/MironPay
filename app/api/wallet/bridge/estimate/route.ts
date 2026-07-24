import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { bridgeKit, circleBridgeAdapter, getRelayerAdapter, ARC_TESTNET, resolveExternalChain, bridgeErrorMessage, jsonSafe } from '@/app/lib/circle-bridge-kit'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { fetchSimplePrice } from '@/app/lib/coingecko'

// USD-pegged stablecoins: skip the price lookup (saves an API call and a
// rate-limit risk) and just treat 1 unit as $1.
const STABLE_USD = new Set(['USDC', 'USDT'])

async function usdPrice(symbol: string): Promise<number | null> {
  if (STABLE_USD.has(symbol.toUpperCase())) return 1
  try {
    const price = await fetchSimplePrice(symbol)
    return price?.priceUsd ?? null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const direction = searchParams.get('direction')
    const externalChainSlug = searchParams.get('externalChain')
    const amount = searchParams.get('amount')

    if (direction !== 'deposit' && direction !== 'withdraw') {
      return NextResponse.json({ error: 'direction must be "deposit" or "withdraw"' }, { status: 400 })
    }
    if (!externalChainSlug || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: 'Missing or invalid params' }, { status: 400 })
    }
    const externalChain = resolveExternalChain(externalChainSlug)
    if (!externalChain) {
      return NextResponse.json({ error: `Unsupported chain: ${externalChainSlug}` }, { status: 400 })
    }

    const wallet = await resolveCircleWalletId(supabase, user.id)
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    // Same adapters used for the real transfer are used here purely to build
    // an unsigned estimate — no gas is spent, nothing is submitted on-chain.
    const relayerAdapter = getRelayerAdapter()
    // relayerAdapter is a private-key adapter, forced to "user-controlled" by
    // the SDK — no explicit `address` field allowed, it always resolves its
    // own address.
    const from = direction === 'withdraw'
      ? { adapter: circleBridgeAdapter, chain: ARC_TESTNET, address: wallet.walletAddress }
      : { adapter: relayerAdapter, chain: externalChain }
    const to = direction === 'withdraw'
      ? { adapter: relayerAdapter, chain: externalChain }
      : { adapter: circleBridgeAdapter, chain: ARC_TESTNET, address: wallet.walletAddress }

    // Cast: bridge-kit, provider-cctp-v2 and adapter-circle-wallets each
    // bundle their own copy of the shared `Adapter`/`ChainDefinition` core
    // types (not a single shared dependency), so mixing an adapter-circle-wallets
    // adapter into a bridge-kit call is runtime-compatible (same JS shape,
    // per adapter-circle-wallets' own "bridge-kit" support) but doesn't
    // type-check nominally across the two bundles.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const estimate = await bridgeKit.estimate({ from, to, amount } as any)
    console.log('[bridge/estimate] raw result', JSON.stringify(estimate, (_k, v) => typeof v === 'bigint' ? v.toString() : v))

    const gasFees = estimate.gasFees ?? []
    const fees = estimate.fees ?? []

    // Convert every fee line (each potentially a different token — ETH gas
    // on the external chain, USDC protocol fee, etc.) to USD so the UI can
    // show one combined total. Missing prices (rate-limited lookups, unknown
    // tokens) are dropped from the total rather than failing the whole
    // estimate — `totalUsdComplete` tells the UI whether every line priced
    // successfully, so it can caveat the number if not.
    const uniqueTokens = [...new Set([
      ...gasFees.filter((g: { fees: unknown }) => g.fees).map((g: { token: string }) => g.token),
      ...fees.map((f: { token: string }) => f.token),
    ])]
    const prices = Object.fromEntries(
      await Promise.all(uniqueTokens.map(async (t) => [t, await usdPrice(t)] as const))
    ) as Record<string, number | null>

    let totalUsd = 0
    let totalUsdComplete = true
    for (const g of gasFees as { token: string; fees: { fee: string } | null }[]) {
      if (!g.fees) continue
      const price = prices[g.token]
      if (price == null) { totalUsdComplete = false; continue }
      totalUsd += parseFloat(g.fees.fee) * price
    }
    for (const f of fees as { token: string; amount: string }[]) {
      const price = prices[f.token]
      if (price == null) { totalUsdComplete = false; continue }
      totalUsd += parseFloat(f.amount) * price
    }

    return NextResponse.json(jsonSafe({
      gasFees,
      fees,
      totalUsd: (gasFees.length > 0 || fees.length > 0) ? totalUsd : null,
      totalUsdComplete,
      direction,
      externalChain: externalChainSlug,
      amount,
    }))
  } catch (err) {
    const message = bridgeErrorMessage(err) || (err instanceof Error ? err.message : String(err))
    console.error('[bridge/estimate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
