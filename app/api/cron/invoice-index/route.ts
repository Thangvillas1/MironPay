import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { scanLogs, type DecodedLog } from '@/app/lib/arc-log-scan'
import { arcPublicClient, USDC_TOKEN, USDC_TRANSFER_EVENT } from '@/app/lib/arc-chain'

const CONTRACT_KEY = 'invoice_payments'

// Matches incoming USDC Transfer logs against open invoices by
// (receive_address, amount) — no on-chain memo dependency, since an external
// payer (no MironPay account) can't write to transaction_memos and the Memo
// contract's attachMemo() is a separate, non-atomic tx with no verified
// event schema to match against. Amount+address matching within an open
// invoice window is the same pragmatic posture already accepted for Store
// (see report-payment's self-report gap) — just automated instead of
// trusting client self-report.
async function applyInvoicePaymentChunk(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  logs: DecodedLog[]
) {
  for (const log of logs) {
    if (log.eventName !== 'Transfer') continue
    const to = (log.args.to as string)?.toLowerCase()
    const value = log.args.value as bigint
    if (!to || value === undefined) continue

    // USDC has 6 decimals but invoices.amount is numeric(18,2) — round to
    // avoid floating-point drift (e.g. 12.340000000001) breaking the eq() match.
    const amount = Math.round(Number(value) / 10_000) / 100

    // Oldest matching open invoice first — same first-come-first-matched
    // posture as a real bank reconciling incoming wires by amount.
    const { data: candidates } = await supabase
      .from('invoices')
      .select('id, invoice_code')
      .eq('receive_address', to)
      .in('status', ['pending', 'overdue'])
      .eq('amount', amount)
      .or(`created_block.is.null,created_block.lte.${log.blockNumber?.toString() ?? '0'}`)
      .order('created_at', { ascending: true })
      .limit(2)

    // Address + amount is ambiguous when two open invoices share both values.
    // Never guess in that case; leave both open for issuer/manual reconciliation.
    if ((candidates?.length ?? 0) > 1) {
      await supabase.from('invoices')
        .update({ reconciliation_status: 'ambiguous' })
        .in('id', candidates!.map(candidate => candidate.id))
        .in('status', ['pending', 'overdue'])
      continue
    }
    if (candidates?.length !== 1) continue
    const match = candidates[0]

    await supabase
      .from('invoices')
      .update({ status: 'paid', reconciliation_status: 'matched', paid_at: new Date().toISOString(), tx_hash: (log as unknown as { transactionHash?: string }).transactionHash ?? null })
      .eq('id', match.id)
      .in('status', ['pending', 'overdue']) // guard against a race with a second matching transfer
  }
}

// Watches USDC Transfer events and auto-marks matching invoices "paid" —
// replaces self-report with on-chain verification. Not wired to Vercel Cron
// yet (project not deployed) — trigger manually:
//   curl -H "Authorization: Bearer $AGENT_INDEXER_CRON_SECRET" https://<host>/api/cron/invoice-index
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? process.env.AGENT_INDEXER_CRON_SECRET
  const auth = request.headers.get('Authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()
  const client = arcPublicClient()
  const tip = await client.getBlockNumber()

  const { data: state } = await supabase
    .from('arc_index_state')
    .select('last_scanned_block')
    .eq('contract_key', CONTRACT_KEY)
    .maybeSingle()

  // First run: don't backfill USDC's entire history (genesis to tip) — start
  // watching from the current tip forward, same as a webhook only sees new
  // events from the moment it's registered.
  const fromBlock = state ? BigInt(state.last_scanned_block) + 1n : tip

  if (fromBlock > tip) {
    return NextResponse.json({ scannedTo: (fromBlock - 1n).toString(), upToDate: true })
  }

  const deadline = Date.now() + 50_000

  const result = await scanLogs({
    client,
    address: USDC_TOKEN,
    events: [USDC_TRANSFER_EVENT],
    fromBlock,
    toBlock: tip,
    deadline,
    onChunk: async (logs, chunkToBlock) => {
      await applyInvoicePaymentChunk(supabase, logs)
      await supabase.from('arc_index_state').upsert({
        contract_key: CONTRACT_KEY,
        last_scanned_block: Number(chunkToBlock),
        updated_at: new Date().toISOString(),
      })
    },
  })

  return NextResponse.json({ scannedTo: result.resumeFrom.toString(), caughtUp: result.done })
}
