import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { reconcileOnChainLimit, setOnChainLimit } from '@/app/lib/spending-limit'
import { assertCircleWalletBinding, levelCap, parseAgentAmount } from '@/app/lib/agent-security'
import { pinFailureHttp, verifyPin } from '@/app/lib/pin'

export async function PUT(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { daily_limit, pin, idempotencyKey } = await request.json()
  const limit = parseAgentAmount(daily_limit)
  if (limit === null || limit < 0.01) return NextResponse.json({ error: 'Minimum limit is 0.01 USDC' }, { status: 400 })
  const pinResult = await verifyPin(supabase, user.id, pin)
  if (!pinResult.ok) return NextResponse.json({ error: pinResult.error, code: pinResult.code }, pinFailureHttp(pinResult))
  if (typeof idempotencyKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return NextResponse.json({ error: 'Stable idempotency key required.', code: 'IDEMPOTENCY_REQUIRED' }, { status: 400 })
  }

  const { data: profile } = await supabase.from('profiles')
    .select('agent_wallet_address, agent_wallet_id, miron_level').eq('id', user.id).single()
  const cap = levelCap(profile?.miron_level)
  if (limit > cap) return NextResponse.json({ error: `Your current level allows at most ${cap} USDC per day.`, code: 'LEVEL_CAP_EXCEEDED' }, { status: 403 })
  if (!profile?.agent_wallet_address || !profile.agent_wallet_id) return NextResponse.json({ error: 'Agent Wallet not initialized.' }, { status: 400 })
  await assertCircleWalletBinding(profile.agent_wallet_id, profile.agent_wallet_address)

  const admin = createAdminSupabaseClient()
  const { data: claimed, error: claimError } = await admin.rpc('claim_agent_limit_change', {
    p_user_id: user.id, p_key: idempotencyKey, p_limit: limit,
  })
  if (claimError) return NextResponse.json({ error: 'Too many limit changes. Try later.', code: 'LIMIT_RATE_EXCEEDED' }, { status: 429 })
  if (!claimed) {
    const { data: existing, error: existingError } = await admin.from('agent_limit_changes').select('status,tx_hash,requested_limit')
      .eq('idempotency_key', idempotencyKey).eq('user_id', user.id).maybeSingle()
    if (existingError) return NextResponse.json({ error: 'Limit reconciliation is temporarily unavailable.', code: 'LIMIT_LEDGER_UNAVAILABLE' }, { status: 503 })
    if (existing?.status === 'complete') return NextResponse.json({ success: true, daily_limit: Number(existing.requested_limit), onChain: true, txHash: existing.tx_hash })
    if (existing?.status === 'claimed' && existing.tx_hash) {
      const chainState = await reconcileOnChainLimit(existing.tx_hash as `0x${string}`)
      if (chainState === 'complete') {
        const { error: dbError } = await admin.from('agent_wallets').update({ daily_limit: Number(existing.requested_limit) }).eq('user_id', user.id)
        if (dbError) return NextResponse.json({ success: false, status: 'pending', code: 'LIMIT_DB_PENDING', txHash: existing.tx_hash }, { status: 202 })
        const { error: completeError } = await admin.from('agent_limit_changes').update({ status: 'complete' }).eq('idempotency_key', idempotencyKey).eq('user_id', user.id)
        if (completeError) return NextResponse.json({ success: false, status: 'pending', code: 'LIMIT_LEDGER_PENDING', txHash: existing.tx_hash }, { status: 202 })
        return NextResponse.json({ success: true, daily_limit: Number(existing.requested_limit), onChain: true, txHash: existing.tx_hash })
      }
      if (chainState === 'reverted') {
        const { error: failedError } = await admin.from('agent_limit_changes').update({ status: 'failed' }).eq('idempotency_key', idempotencyKey).eq('user_id', user.id)
        if (failedError) return NextResponse.json({ success: false, status: 'pending', code: 'LIMIT_LEDGER_PENDING', txHash: existing.tx_hash }, { status: 202 })
        return NextResponse.json({ error: 'On-chain limit transaction reverted.', code: 'LIMIT_CHAIN_FAILED' }, { status: 502 })
      }
    }
    if (existing?.status === 'claimed') return NextResponse.json({ success: false, status: 'pending', code: 'LIMIT_PENDING', txHash: existing.tx_hash }, { status: 202 })
    return NextResponse.json({ error: 'The previous limit update failed. Close and reopen the dialog to retry.', code: 'LIMIT_FAILED' }, { status: 409 })
  }

  const chainResult = await setOnChainLimit(profile.agent_wallet_address, limit)
  // Persist the on-chain proof before any other DB mutation. If the following
  // wallet update fails, replaying the same key can reconcile this receipt.
  if (chainResult.status === 'pending' || chainResult.status === 'complete') {
    const { error: proofError } = await admin.from('agent_limit_changes').update({ tx_hash: chainResult.txHash })
      .eq('idempotency_key', idempotencyKey).eq('user_id', user.id).eq('status', 'claimed')
    if (proofError) {
      return NextResponse.json({ success: false, status: 'pending', code: 'LIMIT_LEDGER_PENDING', txHash: chainResult.txHash }, { status: 202 })
    }
  }
  if (chainResult.status === 'pending') {
    return NextResponse.json({ success: false, status: 'pending', code: 'LIMIT_PENDING', txHash: chainResult.txHash }, { status: 202 })
  }
  if (chainResult.status !== 'complete') {
    const { error: failedError } = await admin.from('agent_limit_changes').update({ status: 'failed' }).eq('idempotency_key', idempotencyKey).eq('user_id', user.id)
    if (failedError) return NextResponse.json({ error: 'Limit failure could not be recorded.', code: 'LIMIT_LEDGER_UNAVAILABLE' }, { status: 503 })
    return NextResponse.json({ error: 'On-chain limit update failed; database was unchanged.', code: 'LIMIT_CHAIN_FAILED' }, { status: 502 })
  }
  const txHash = chainResult.txHash
  const { error: dbError } = await admin.from('agent_wallets').update({ daily_limit: limit }).eq('user_id', user.id)
  if (dbError) return NextResponse.json({ error: 'On-chain limit updated; database reconciliation pending.', code: 'LIMIT_DB_PENDING', txHash }, { status: 202 })
  const { error: completeError } = await admin.from('agent_limit_changes').update({ status: 'complete' })
    .eq('idempotency_key', idempotencyKey).eq('user_id', user.id).eq('status', 'claimed')
  if (completeError) return NextResponse.json({ success: false, status: 'pending', code: 'LIMIT_LEDGER_PENDING', txHash }, { status: 202 })
  return NextResponse.json({ success: true, daily_limit: limit, onChain: true, txHash })
}
