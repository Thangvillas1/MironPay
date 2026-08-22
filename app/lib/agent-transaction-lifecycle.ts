import { circleClient } from '@/app/lib/circle'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { awardVerifiedScore } from '@/app/lib/score-server'

const FAILED = new Set(['FAILED', 'CANCELLED', 'DENIED'])
export function classifyCircleState(state: string): 'complete' | 'failed' | 'pending' {
  return state === 'COMPLETE' ? 'complete' : FAILED.has(state) ? 'failed' : 'pending'
}

export async function attachReservationTransaction(userId: string, nonce: string, walletId: string, txId: string) {
  const { data, error } = await createAdminSupabaseClient().rpc('attach_agent_spend_transaction', {
    p_user_id: userId, p_nonce: nonce, p_circle_wallet_id: walletId, p_transaction_id: txId,
  })
  if (error || !data) throw new Error('Could not attach Circle transaction to spend reservation')
}

export async function reconcileAgentReservations(userId: string, onlyTxId?: string) {
  const admin = createAdminSupabaseClient()
  let query = admin.from('agent_spend_reservations')
    .select('nonce,amount,transaction_id,transaction_hash,circle_wallet_id,created_at')
    .eq('user_id', userId).eq('status', 'reserved')
  if (onlyTxId) query = query.eq('transaction_id', onlyTxId)
  const { data: reservations, error } = await query.limit(20)
  if (error) throw error

  const results: Array<Record<string, unknown>> = []
  for (const reservation of reservations ?? []) {
    let txId = reservation.transaction_id as string | null
    // x402 settlements have an on-chain hash but no Circle transaction ID. A
    // failed accounting RPC stores that proof here for deterministic retry.
    if (!txId && reservation.transaction_hash) {
      const { data: finalized, error: finalizeError } = await admin.rpc('finalize_agent_spend_actual', {
        p_user_id: userId,
        p_nonce: reservation.nonce,
        p_actual_amount: Number(reservation.amount),
        p_transaction_hash: reservation.transaction_hash,
      })
      results.push({
        nonce: reservation.nonce,
        status: !finalizeError && finalized ? 'complete' : 'pending',
        state: !finalizeError && finalized ? 'COMPLETE' : 'ACCOUNTING_PENDING',
        transactionId: null,
        txHash: reservation.transaction_hash,
      })
      continue
    }
    if (!txId && reservation.circle_wallet_id) {
      const listed = await circleClient.listTransactions({ walletIds: [reservation.circle_wallet_id], pageSize: 50 })
      const match = ((listed.data?.transactions ?? []) as Array<{ id?: string; refId?: string }>).find((tx) => tx.refId === reservation.nonce)
      txId = match?.id ?? null
      if (txId) await attachReservationTransaction(userId, reservation.nonce, reservation.circle_wallet_id, txId)
    }
    if (!txId) {
      if (Date.parse(reservation.created_at) < new Date().setUTCHours(0, 0, 0, 0)) {
        await admin.rpc('release_agent_spend', { p_user_id: userId, p_nonce: reservation.nonce })
        results.push({ nonce: reservation.nonce, status: 'failed', state: 'UNRESOLVED_EXPIRED', transactionId: null })
        continue
      }
      results.push({ nonce: reservation.nonce, status: 'pending', transactionId: null })
      continue
    }
    const response = await circleClient.getTransaction({ id: txId })
    const tx = (response.data as unknown as { transaction?: { state?: string; txHash?: string } }).transaction
    const state = tx?.state ?? 'UNKNOWN'
    if (state === 'COMPLETE' && tx?.txHash) {
      const { data: finalized } = await admin.rpc('finalize_agent_spend', { p_user_id: userId, p_nonce: reservation.nonce, p_transaction_id: txId, p_transaction_hash: tx.txHash })
      if (finalized) await awardVerifiedScore(userId, 'agent_tx', tx.txHash).catch(() => {})
    } else if (FAILED.has(state)) {
      await admin.rpc('release_agent_spend', { p_user_id: userId, p_nonce: reservation.nonce })
    }
    results.push({ nonce: reservation.nonce, status: classifyCircleState(state), state, transactionId: txId, txHash: tx?.txHash ?? null })
  }
  return results
}
