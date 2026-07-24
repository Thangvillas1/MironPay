import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { cctpProvider, circleBridgeAdapter, getRelayerAdapter, getRelayerAddress, ARC_TESTNET, resolveExternalChain, bridgeErrorMessage } from '@/app/lib/circle-bridge-kit'

// Called after the browser has submitted the burn tx itself (via the user's
// connected wallet). Backend fetches Circle's attestation for that burn and
// submits the mint into the MironPay Arc wallet — this leg is entirely our
// own custody chain, so it's fully backend-signed via the existing Circle
// Wallets adapter, same as the swap route.
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { externalChain: externalChainSlug, burnTxHash } = body

    if (!externalChainSlug || !burnTxHash) {
      return NextResponse.json({ error: 'Missing or invalid params' }, { status: 400 })
    }
    const externalChain = resolveExternalChain(externalChainSlug)
    if (!externalChain) {
      return NextResponse.json({ error: `Unsupported chain: ${externalChainSlug}` }, { status: 400 })
    }

    const wallet = await resolveCircleWalletId(supabase, user.id)
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    // Cast: `externalChain` is a plain string slug (deliberately, see
    // circle-bridge-kit.ts) rather than an imported chain-definition object,
    // and adapter-circle-wallets bundles its own copy of the core
    // Adapter/Chain types, so neither lines up with provider-cctp-v2's
    // nominal `ChainDefinitionWithCCTPv2` type despite being runtime-correct.
    const relayerAdapter = getRelayerAdapter()
    const relayerAddress = getRelayerAddress()

    const attestation = await cctpProvider.fetchAttestation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { adapter: relayerAdapter, chain: externalChain, address: relayerAddress } as any,
      burnTxHash,
    )

    const preparedMint = await cctpProvider.mint(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { adapter: relayerAdapter, chain: externalChain, address: relayerAddress } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { adapter: circleBridgeAdapter, chain: ARC_TESTNET, address: wallet.walletAddress } as any,
      attestation,
    )
    const mintTxHash = await preparedMint.execute()

    await supabase.from('transaction_kinds').insert({
      tx_hash: mintTxHash, kind: 'bridge_in', wallet_address: wallet.walletAddress,
    }).then(undefined, () => {})

    return NextResponse.json({ mintTxHash })
  } catch (err) {
    const message = bridgeErrorMessage(err) || (err instanceof Error ? err.message : String(err))
    console.error('[bridge/deposit/complete]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
