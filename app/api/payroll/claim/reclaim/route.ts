import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { circleClient } from '@/app/lib/circle'
import { payrollClaimContract } from '@/app/lib/payroll-claim-chain'

// See app/api/payroll/claim/claim/route.ts — same on-chain wait vs. Vercel's
// default 10s Hobby function timeout.
export const maxDuration = 60

async function waitForCircleTx(txId: string): Promise<string> {
  const confirmed = await circleClient.getTransaction({ id: txId, waitForState: 'COMPLETE', pollingInterval: 1500 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txHash = (confirmed.data as any)?.transaction?.txHash
  if (!txHash) throw new Error('Transaction did not reach a confirmed state')
  return txHash
}

/**
 * Company-triggered reclaim of an unclaimed, expired box. Must go through
 * the company's own Circle wallet (not the relayer) — the contract checks
 * `msg.sender == meta.company`, so only the exact paying wallet can succeed.
 */
export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const itemId = body?.itemId as string | undefined
  if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })

  const { data: preview } = await supabase.from('payroll_claim_items').select('*').eq('id', itemId).eq('user_id', user.id).single()
  if (!preview) return NextResponse.json({ error: 'Claim item not found' }, { status: 404 })

  // Atomic lock, same reasoning as claim/route.ts: a second click can't
  // race a real reclaim tx onto the chain once this update finds 0 rows.
  const { data: item } = await supabase
    .from('payroll_claim_items')
    .update({ status: 'reclaiming', updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('status', 'paid')
    .select()
    .maybeSingle()
  if (!item) {
    return NextResponse.json({ error: `Item is not reclaimable (status: ${preview.status})` }, { status: 400 })
  }

  const wallet = await resolveCircleWalletId(supabase, user.id)
  if (!wallet) return NextResponse.json({ error: 'Company wallet not found' }, { status: 400 })

  const contract = payrollClaimContract()

  try {
    const tx = await circleClient.createContractExecutionTransaction({
      walletId: wallet.circleWalletId,
      contractAddress: contract,
      abiFunctionSignature: 'reclaim(bytes32)',
      abiParameters: [item.box_id],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey: crypto.randomUUID(),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txHash = await waitForCircleTx((tx.data as any)?.id)

    await supabase
      .from('payroll_claim_items')
      .update({ status: 'reclaimed', reclaimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', itemId)

    return NextResponse.json({ txHash })
  } catch (err) {
    await supabase.from('payroll_claim_items').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', itemId)
    const message = err instanceof Error ? err.message : 'Reclaim failed'
    // Common case: contract reverts "Not expired yet" — surface it plainly.
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
