import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { scanLogs } from '@/app/lib/arc-log-scan'
import { applyFeedbackLogChunk } from '@/app/lib/arc-feedback-index'
import { arcPublicClient, REPUTATION_REGISTRY, REPUTATION_REGISTRY_DEPLOY_BLOCK, NEW_FEEDBACK_EVENT, FEEDBACK_REVOKED_EVENT } from '@/app/lib/arc-chain'

// Quét incremental log ReputationRegistry (NewFeedback/FeedbackRevoked) từ block đã
// lưu trong arc_index_state, cập nhật arc_agent_leaderboard. Tự giới hạn thời gian
// chạy (deadline) để không vượt timeout của 1 request — nếu backlog còn nhiều, lần
// gọi tiếp theo sẽ resume tiếp.
//
// Chưa nối Vercel Cron thật (project chưa deploy) — trigger thủ công:
//   curl -H "Authorization: Bearer $AGENT_INDEXER_CRON_SECRET" https://<host>/api/cron/agent-index
export async function GET(request: NextRequest) {
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.AGENT_INDEXER_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()
  const client = arcPublicClient()
  const tip = await client.getBlockNumber()

  const { data: state } = await supabase
    .from('arc_index_state')
    .select('last_scanned_block')
    .eq('contract_key', 'reputation_registry')
    .maybeSingle()

  const fromBlock = state ? BigInt(state.last_scanned_block) + 1n : REPUTATION_REGISTRY_DEPLOY_BLOCK

  if (fromBlock > tip) {
    return NextResponse.json({ scannedTo: (fromBlock - 1n).toString(), upToDate: true })
  }

  const deadline = Date.now() + 50_000

  const result = await scanLogs({
    client,
    address: REPUTATION_REGISTRY,
    events: [NEW_FEEDBACK_EVENT, FEEDBACK_REVOKED_EVENT],
    fromBlock,
    toBlock: tip,
    deadline,
    onChunk: async (logs, chunkToBlock) => {
      await applyFeedbackLogChunk(supabase, logs)
      await supabase.from('arc_index_state').upsert({
        contract_key: 'reputation_registry',
        last_scanned_block: Number(chunkToBlock),
        updated_at: new Date().toISOString(),
      })
    },
  })

  return NextResponse.json({ scannedTo: result.resumeFrom.toString(), caughtUp: result.done })
}
