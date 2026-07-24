import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { bridgeKit, circleBridgeAdapter, getRelayerAdapter, ARC_TESTNET, resolveExternalChain, bridgeErrorMessage, jsonSafe } from '@/app/lib/circle-bridge-kit'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'

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

    return NextResponse.json(jsonSafe({
      gasFees: estimate.gasFees ?? null,
      fees: estimate.fees ?? null,
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
