import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { cctpProvider, circleBridgeAdapter, getRelayerAdapter, getRelayerAddress, ARC_CHAIN, resolveExternalChainObject, bridgeErrorMessage } from '@/app/lib/circle-bridge-kit'

// Builds the unsigned burn-transaction calldata for a deposit (external chain
// -> Arc) so the browser can submit it directly through the user's own
// connected wallet (eth_sendTransaction) — the user's funds, so only they can
// sign the burn. Nothing is executed here — the relayer adapter is only used
// to resolve chain/contract metadata; `fromAddress` is validated as a real
// address but not passed into the wallet context (the depositForBurn
// calldata doesn't embed a sender, so which address "prepares" it doesn't
// matter — the real user's connected wallet ends up signing/broadcasting it).
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { externalChain: externalChainSlug, amount, fromAddress: rawFromAddress } = body

    if (!externalChainSlug || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0 || !rawFromAddress) {
      return NextResponse.json({ error: 'Missing or invalid params' }, { status: 400 })
    }
    const externalChainObj = resolveExternalChainObject(externalChainSlug)
    if (!externalChainObj) {
      return NextResponse.json({ error: `Unsupported chain: ${externalChainSlug}` }, { status: 400 })
    }

    let fromAddress: string
    try {
      fromAddress = getAddress(rawFromAddress)
    } catch {
      return NextResponse.json({ error: 'Invalid source wallet address' }, { status: 400 })
    }

    const wallet = await resolveCircleWalletId(supabase, user.id)
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    // Cast: see the note in app/api/wallet/bridge/estimate/route.ts — mixing
    // an adapter-circle-wallets adapter into a provider-cctp-v2 call is
    // runtime-safe but doesn't type-check nominally across the two bundles.
    const source = { adapter: getRelayerAdapter(), chain: externalChainObj, address: getRelayerAddress() } as any // eslint-disable-line @typescript-eslint/no-explicit-any

    // USDC has 6 decimals everywhere CCTP supports it. `approve()` (unlike
    // `burn()`) takes the smallest-unit amount directly — it just encodes
    // `increaseAllowance(spender, amount)`, so the source address used to
    // "prepare" it doesn't matter for the resulting calldata either way.
    const smallestUnitAmount = BigInt(Math.round(parseFloat(amount) * 1_000_000)).toString()
    const approvePrepared = await cctpProvider.approve(source, smallestUnitAmount)
    const approveCall = approvePrepared.type === 'evm' && approvePrepared.getCallData
      ? approvePrepared.getCallData()
      : null // 'noop' means the CCTP contract already has sufficient allowance

    // Calling cctpProvider.burn() directly (not through BridgeKit's
    // convenience layer) means its own zod schema applies: `chain` must
    // already be a full chain-definition object (not a plain string — that
    // only works through BridgeKit, which resolves it internally) and
    // `address`/`config` are required. See circle-bridge-kit.ts for why we
    // keep separate string vs. object chain identifiers.
    const burnPrepared = await cctpProvider.burn({
      source,
      destination: { adapter: circleBridgeAdapter, chain: ARC_CHAIN, address: wallet.walletAddress },
      amount,
      token: 'USDC',
      config: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    if (burnPrepared.type !== 'evm' || !burnPrepared.getCallData) {
      return NextResponse.json({ error: 'Could not prepare burn transaction for this chain' }, { status: 500 })
    }
    const burnCall = burnPrepared.getCallData()

    console.log('[bridge/deposit/prepare] chain', externalChainSlug,
      'usdcAddress', (externalChainObj as { usdcAddress?: string }).usdcAddress,
      'approve.to', approveCall?.to ?? '(noop)', 'approve.data', approveCall?.data ?? null,
      'burn.to', burnCall.to, 'burn.data', burnCall.data)

    return NextResponse.json({
      approve: approveCall ? { to: approveCall.to, data: approveCall.data, value: approveCall.value ? approveCall.value.toString() : '0' } : null,
      burn: { to: burnCall.to, data: burnCall.data, value: burnCall.value ? burnCall.value.toString() : '0' },
      externalChain: externalChainSlug,
      fromAddress,
    })
  } catch (err) {
    const message = bridgeErrorMessage(err) || (err instanceof Error ? err.message : String(err))
    console.error('[bridge/deposit/prepare]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
