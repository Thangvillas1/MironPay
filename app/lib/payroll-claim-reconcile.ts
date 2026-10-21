import type { SupabaseClient } from '@supabase/supabase-js'
import type { Hex } from 'viem'
import { sendPayrollClaimEmail } from './email'
import { publicClient, payrollClaimContract, withRpcRetry, PAYROLL_CLAIM_ABI } from './payroll-claim-chain'

// A pay request that outlives its maxDuration is killed mid-wait: payBatch()
// may already be on-chain (or land moments later from Circle's queue) while
// the run is still 'draft' in the DB. These helpers decide a run's outcome
// from the contract itself instead of assuming "no response = failed".

/** Runs older than this can no longer have a live pay request behind them. */
const STALE_DRAFT_MS = 2 * 60 * 1000
/** How far back a 'failed' run is re-checked in case its payBatch landed late. */
const RECHECK_FAILED_MS = 24 * 60 * 60 * 1000

/** True when payBatch() funded these boxes. payBatch is one transaction, so
 *  its boxes are created all-or-nothing — checking the first and last is
 *  enough. Throws if the chain can't be read (caller must not guess). */
export async function boxesFunded(boxIds: string[]): Promise<boolean> {
  if (boxIds.length === 0) return false
  const contract = payrollClaimContract()
  const probe = boxIds.length === 1 ? [boxIds[0]] : [boxIds[0], boxIds[boxIds.length - 1]]
  const results = await Promise.all(
    probe.map((boxId) =>
      withRpcRetry(() =>
        publicClient.readContract({ address: contract, abi: PAYROLL_CLAIM_ABI, functionName: 'boxes', args: [boxId as Hex] })
      )
    )
  )
  return results.every(([, , exists]) => exists)
}

export interface ClaimEmailItem {
  email: string
  amount: number
  note?: string | null
  referenceCode: string
}

/** "Your salary is waiting" emails for one run. Never throws. */
export async function sendRunClaimEmails(supabase: SupabaseClient, userId: string, period: string, items: ClaimEmailItem[]) {
  // Company identity for the email's "Paid by {name}" line: legal_name once
  // verified (that's the name that was actually reviewed), otherwise the
  // account username — falling back to a generic label rather than failing
  // the whole payroll if this lookup errors.
  const { data: companyProfile } = await supabase
    .from('company_profiles')
    .select('legal_name, verification_status')
    .eq('user_id', userId)
    .maybeSingle()
  const companyVerified = companyProfile?.verification_status === 'verified'
  let companyName = companyVerified ? companyProfile?.legal_name : null
  if (!companyName) {
    const { data: profile } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle()
    companyName = profile?.username ?? null
  }

  await Promise.allSettled(
    items.map((item) =>
      sendPayrollClaimEmail({
        to: item.email.trim().toLowerCase(),
        amount: item.amount,
        period,
        note: item.note ?? undefined,
        companyName,
        companyVerified,
        referenceCode: item.referenceCode,
      }).catch((e) => console.error('[payroll email] sendPayrollClaimEmail failed:', item.email, e))
    )
  )
}

export interface ReconciledRun {
  runId: string
  period: string
  items: ClaimEmailItem[]
}

/**
 * Settles this company's interrupted runs against the chain:
 * - stale 'draft' runs → 'paid' if their boxes exist on-chain, else 'failed';
 * - recent 'failed' runs whose items are still 'pending' → 'paid' if their
 *   payBatch turned out to have landed after all.
 * Each status flip is a conditional UPDATE on the old status, so concurrent
 * callers can't both claim the same run. Returns the runs newly marked paid —
 * their recipients were never emailed, the caller should send those emails.
 * A run whose boxes can't be read right now is left untouched.
 */
export async function reconcileInterruptedRuns(supabase: SupabaseClient, userId: string): Promise<ReconciledRun[]> {
  const now = Date.now()
  const { data: candidates } = await supabase
    .from('payroll_claim_runs')
    .select('id, status, period, created_at')
    .eq('user_id', userId)
    .in('status', ['draft', 'failed'])
    .gte('created_at', new Date(now - RECHECK_FAILED_MS).toISOString())
    .lt('created_at', new Date(now - STALE_DRAFT_MS).toISOString())

  const reconciled: ReconciledRun[] = []
  for (const run of candidates ?? []) {
    const { data: items } = await supabase
      .from('payroll_claim_items')
      .select('email, amount, note, box_id, reference_code, status')
      .eq('run_id', run.id)
      .order('created_at', { ascending: true })
    const pending = (items ?? []).filter((i) => i.status === 'pending')
    // A failed run with no pending items was rejected before broadcast
    // (e.g. item insert error) — nothing on-chain to look for.
    if (pending.length === 0 || pending.length !== (items ?? []).length) {
      if (run.status === 'draft') await markFailed(supabase, run.id)
      continue
    }

    let funded: boolean
    try {
      funded = await boxesFunded(pending.map((i) => i.box_id))
    } catch (e) {
      console.error('[payroll reconcile] could not read boxes for run', run.id, e)
      continue
    }

    if (!funded) {
      if (run.status === 'draft') await markFailed(supabase, run.id)
      continue
    }

    const { data: flipped } = await supabase
      .from('payroll_claim_runs')
      .update({ status: 'paid', paid_at: new Date().toISOString(), error_message: null })
      .eq('id', run.id)
      .eq('status', run.status)
      .select('id')
    if (!flipped || flipped.length === 0) continue
    await supabase
      .from('payroll_claim_items')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('run_id', run.id)
      .eq('status', 'pending')
    reconciled.push({
      runId: run.id,
      period: run.period,
      items: pending.map((i) => ({ email: i.email, amount: Number(i.amount), note: i.note, referenceCode: i.reference_code })),
    })
  }
  return reconciled
}

async function markFailed(supabase: SupabaseClient, runId: string) {
  await supabase
    .from('payroll_claim_runs')
    .update({ status: 'failed', error_message: 'Interrupted before payment reached the chain' })
    .eq('id', runId)
    .eq('status', 'draft')
}
