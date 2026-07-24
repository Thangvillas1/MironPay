import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { bridgeKit, circleBridgeAdapter, getRelayerAdapter, ARC_TESTNET, resolveExternalChain, isNoRouteError, bridgeErrorMessage, jsonSafe } from '@/app/lib/circle-bridge-kit'

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { externalChain: externalChainSlug, amount, recipientAddress: rawRecipient } = body

    if (!externalChainSlug || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0 || !rawRecipient) {
      return NextResponse.json({ error: 'Missing or invalid params' }, { status: 400 })
    }
    const externalChain = resolveExternalChain(externalChainSlug)
    if (!externalChain) {
      return NextResponse.json({ error: `Unsupported chain: ${externalChainSlug}` }, { status: 400 })
    }

    let recipientAddress: string
    try {
      recipientAddress = getAddress(rawRecipient)
    } catch {
      return NextResponse.json({ error: 'Invalid recipient address' }, { status: 400 })
    }

    const wallet = await resolveCircleWalletId(supabase, user.id)
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    // Source leg: our own Circle wallet on Arc, backend-signed. Destination
    // leg: the relayer EOA submits the (permissionless) mint on the external
    // chain and pays its gas — funds still land on `recipientAddress`. No
    // explicit `address` on the relayer side: it's a private-key adapter,
    // forced to "user-controlled" by the SDK, so it always resolves its own
    // address (which is exactly who should sign/pay for the mint here).
    // Cast: see the note in app/api/wallet/bridge/estimate/route.ts — mixing
    // an adapter-circle-wallets adapter into a bridge-kit call is runtime-safe
    // but the two packages bundle separate copies of the core Adapter/Chain
    // types, so it doesn't type-check nominally.
    const result = await bridgeKit.bridge({
      from: { adapter: circleBridgeAdapter, chain: ARC_TESTNET, address: wallet.walletAddress },
      to: { adapter: getRelayerAdapter(), chain: externalChain, recipientAddress },
      amount,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    // The SDK's actual step name for the burn is 'burn', not 'depositForBurn'
    // (confirmed from a live run: step names come back as
    // ['approve', 'burn', 'fetchAttestation', 'mint']) — the wrong name here
    // silently meant burnTxHash was always null and no withdrawal ever got
    // tagged 'bridge_out', so none ever showed up as "Bridge" in activity.
    const burnTxHash = result.steps.find(s => s.name === 'burn')?.txHash ?? null
    const mintTxHash = result.steps.find(s => s.name === 'mint')?.txHash ?? null

    if (burnTxHash) {
      const { error: kindErr } = await supabase.from('transaction_kinds').insert({
        tx_hash: burnTxHash, kind: 'bridge_out', wallet_address: wallet.walletAddress,
      })
      if (kindErr) console.error('[bridge/withdraw] transaction_kinds insert failed', kindErr)
    } else {
      console.error('[bridge/withdraw] no burn step found — cannot tag as Bridge in activity', result.steps.map(s => s.name))
    }

    return NextResponse.json(jsonSafe({
      state: result.state,
      burnTxHash,
      mintTxHash,
      steps: result.steps,
    }))
  } catch (err) {
    if (isNoRouteError(err)) {
      return NextResponse.json({ error: 'No bridge route available right now. Please try again in a few minutes.' }, { status: 400 })
    }
    const message = bridgeErrorMessage(err) || (err instanceof Error ? err.message : String(err))
    console.error('[bridge/withdraw]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
