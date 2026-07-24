import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { cctpProvider, circleBridgeAdapter, getRelayerAdapter, getRelayerAddress, ARC_CHAIN, resolveExternalChainObject, bridgeErrorMessage } from '@/app/lib/circle-bridge-kit'

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
    const externalChainObj = resolveExternalChainObject(externalChainSlug)
    if (!externalChainObj) {
      return NextResponse.json({ error: `Unsupported chain: ${externalChainSlug}` }, { status: 400 })
    }

    const wallet = await resolveCircleWalletId(supabase, user.id)
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    // Calling cctpProvider directly (not through BridgeKit) means `chain`
    // must be a full chain-definition object and `address` is required —
    // see the note in deposit/prepare/route.ts and circle-bridge-kit.ts.
    const relayerAdapter = getRelayerAdapter()
    const relayerAddress = getRelayerAddress()

    const attestation = await cctpProvider.fetchAttestation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { adapter: relayerAdapter, chain: externalChainObj, address: relayerAddress } as any,
      burnTxHash,
    )

    const preparedMint = await cctpProvider.mint(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { adapter: relayerAdapter, chain: externalChainObj, address: relayerAddress } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { adapter: circleBridgeAdapter, chain: ARC_CHAIN, address: wallet.walletAddress } as any,
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
