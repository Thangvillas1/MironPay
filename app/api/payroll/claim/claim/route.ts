import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { circleClient } from '@/app/lib/circle'
import {
  publicClient,
  relayerWalletClient,
  payrollClaimContract,
  claimMessageHash,
  withRpcRetry,
  PAYROLL_CLAIM_ABI,
} from '@/app/lib/payroll-claim-chain'
import type { Address, Hex } from 'viem'

// Default Vercel Hobby function timeout (10s) is shorter than the on-chain
// wait below (waitForTransactionReceipt has its own 60s timeout) — without
// this the function gets killed mid-request and the client sees a bare
// "Network error" instead of a real response.
export const maxDuration = 60

/**
 * Recipient-triggered claim. The logged-in user must own the exact Circle
 * wallet that's about to sign — and RLS ("Recipients can read items
 * addressed to their own email") already restricts them to rows matching
 * their own JWT email, so there is no separate ownership check needed here
 * beyond "this item belongs to my email" (enforced by RLS on the select).
 *
 * The actual security guarantee is on-chain, not here: MironPayrollClaim
 * .claim() independently verifies the signature itself. This route (and the
 * relayer submitting the tx) is a convenience layer, not a trust boundary —
 * per the design decision to never let backend/DB assert who gets paid.
 */
export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const itemId = body?.itemId as string | undefined
  if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })

  const { data: preview } = await supabase.from('payroll_claim_items').select('*').eq('id', itemId).single()
  if (!preview) return NextResponse.json({ error: 'Claim item not found' }, { status: 404 })
  if (preview.email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: 'This claim is not addressed to your account email' }, { status: 403 })
  }

  // Atomic lock: only one request can flip 'paid' -> 'claiming'. A second
  // click (or a retry racing the first) finds zero rows updated and bails
  // out here — before any signature or on-chain tx, so no relayer gas is
  // ever wasted on a guaranteed-to-fail double-claim.
  const { data: item } = await supabase
    .from('payroll_claim_items')
    .update({ status: 'claiming', updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('status', 'paid')
    .select()
    .maybeSingle()
  if (!item) {
    return NextResponse.json({ error: `Item is not claimable (status: ${preview.status})` }, { status: 400 })
  }

  // Everything below runs after the 'paid' -> 'claiming' lock above, so ANY
  // failure here — including ones that aren't on-chain/signing errors, like
  // a wallet lookup or an RPC read throwing — must revert the lock. Without
  // this wrapping the item, an uncaught exception anywhere in this block
  // leaves the row permanently stuck on 'claiming' with no way to retry
  // (found via manual testing: a transient RPC error here 500'd the request
  // and never ran the narrower try/catches that used to only wrap signing
  // and the relayer tx).
  try {
    const recipientWallet = await resolveCircleWalletId(supabase, user.id)
    if (!recipientWallet) {
      await supabase.from('payroll_claim_items').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', itemId)
      return NextResponse.json({ error: 'Your MironPay wallet was not found' }, { status: 400 })
    }

    const contract = payrollClaimContract()
    const boxId = item.box_id as Hex
    const recipient = recipientWallet.walletAddress as Address

    // Double-check on-chain the box hasn't already been claimed/reclaimed —
    // don't trust our own DB status alone before spending relayer gas.
    const boxAddr = await withRpcRetry(() =>
      publicClient.readContract({ address: contract, abi: PAYROLL_CLAIM_ABI, functionName: 'computeBoxAddress', args: [boxId] })
    )
    const code = await withRpcRetry(() => publicClient.getCode({ address: boxAddr }))
    if (code && code !== '0x') {
      await supabase.from('payroll_claim_items').update({ status: 'claimed', updated_at: new Date().toISOString() }).eq('id', itemId)
      return NextResponse.json({ error: 'Already claimed or reclaimed on-chain' }, { status: 409 })
    }

    // Recipient's own Circle wallet signs proof of ownership — free, off-chain.
    const message = claimMessageHash(boxId, recipient, contract)
    const signRes = await circleClient.signMessage({
      walletId: recipientWallet.circleWalletId,
      message,
      encodedByHex: true,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sig = (signRes.data as any)?.signature ?? (signRes.data as any)?.data?.signature
    if (!sig) throw new Error('Circle signMessage did not return a signature')
    const signature = sig as Hex

    // Relayer submits the already-signed claim on-chain and pays gas — it
    // cannot redirect funds, it can only relay a signature that already
    // proves `recipient` authorized this exact claim.
    const relayer = relayerWalletClient()
    const hash = await withRpcRetry(() =>
      relayer.writeContract({
        address: contract,
        abi: PAYROLL_CLAIM_ABI,
        functionName: 'claim',
        args: [boxId, recipient, signature],
      })
    )
    await withRpcRetry(() => publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 }))

    await supabase
      .from('payroll_claim_items')
      .update({
        status: 'claimed',
        claim_tx_hash: hash,
        claimed_by: user.id,
        claimed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)

    // Tag this tx_hash so the recipient's normal transaction history (same
    // list as Send/Swap/Bridge) shows it as "Payroll" with its own icon
    // instead of a generic "Received" — same tagging mechanism already used
    // for swap/bridge, see app/api/wallet/route.ts + app/lib/activity-icon.tsx.
    const { error: kindErr } = await supabase.from('transaction_kinds').insert({
      tx_hash: hash,
      kind: 'payroll_claim',
      wallet_address: recipient,
      amount: item.amount.toString(),
      token: 'USDC',
    })
    if (kindErr) console.error('[payroll claim] transaction_kinds insert failed:', kindErr)

    return NextResponse.json({ txHash: hash })
  } catch (err) {
    // Revert the lock so a retry (or the user clicking again) isn't
    // permanently stuck on an item that never actually got claimed.
    await supabase.from('payroll_claim_items').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', itemId)
    return NextResponse.json({ error: `Claim failed: ${err instanceof Error ? err.message : 'unknown error'}` }, { status: 500 })
  }
}

/**
 * List the current user's payroll items across any company — both what's
 * still claimable ('paid') and recent history ('claimed'/'reclaimed'), so
 * the inbox can show both the "ready to claim" cards and history rows.
 * Enriched (best-effort, two extra lookups since these tables don't have
 * a declared FK Supabase can auto-embed) with each item's pay period /
 * claim deadline from its run, and the paying company's display name.
 */
export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: items, error } = await supabase
    .from('payroll_claim_items')
    .select('*')
    .eq('email', user.email.toLowerCase())
    .in('status', ['paid', 'claiming', 'claimed', 'reclaiming', 'reclaimed'])
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items || items.length === 0) return NextResponse.json({ items: [] })

  const runIds = [...new Set(items.map((i) => i.run_id))]
  const { data: runs } = await supabase
    .from('payroll_claim_runs')
    .select('id, period, expiry_seconds, paid_at, user_id')
    .in('id', runIds)
  const runById = new Map((runs ?? []).map((r) => [r.id, r]))

  const companyIds = [...new Set((runs ?? []).map((r) => r.user_id))]
  // company_profiles itself is RLS-locked to "read your own row" — as a
  // recipient reading OTHER users' (the paying companies') verification
  // status, we must go through the public view that's scoped to verified
  // rows only, or this always comes back empty and the tick never shows.
  const [{ data: companies }, { data: companyProfiles }] = await Promise.all([
    supabase.from('profiles').select('id, username').in('id', companyIds),
    supabase.from('company_verification_public').select('user_id, legal_name, verification_status').in('user_id', companyIds),
  ])
  const usernameById = new Map((companies ?? []).map((c) => [c.id, c]))
  const profileById = new Map((companyProfiles ?? []).map((c) => [c.user_id, c]))

  const enriched = items.map((item) => {
    const run = runById.get(item.run_id)
    const deadline = run?.paid_at ? new Date(run.paid_at).getTime() + run.expiry_seconds * 1000 : null
    const companyProfile = run ? profileById.get(run.user_id) : undefined
    const verified = companyProfile?.verification_status === 'verified'
    const name = (verified && companyProfile?.legal_name) || (run && usernameById.get(run.user_id)?.username) || 'Employer'
    return {
      ...item,
      period: run?.period ?? null,
      // Raw ms timestamp, not a pre-rounded day count — the inbox renders a
      // live ticking countdown from this, which a rounded number can't do.
      deadlineAt: deadline,
      company: name,
      companyVerified: verified,
    }
  })

  return NextResponse.json({ items: enriched })
}
