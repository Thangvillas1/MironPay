import type { SupabaseClient } from '@supabase/supabase-js'
import type { DecodedLog } from './arc-log-scan'

function normalizedScore(value: bigint, decimals: number) {
  return Number(value) / 10 ** decimals
}

// Tính lại total_score/feedback_count của 1 nhóm agent TRỰC TIẾP từ arc_feedback_events
// (nguồn dữ liệu gốc) thay vì cộng dồn delta vào giá trị cũ — an toàn tuyệt đối khi
// gọi lại nhiều lần (idempotent), vì luôn ghi đè bằng tổng tính lại từ đầu chứ không
// phụ thuộc giá trị đã đọc trước đó. Fix bug "lost update": cách cộng dồn cũ (đọc
// total_score hiện tại rồi ghi total_score+delta) bị mất dữ liệu khi 1 lần ghi trước
// đó không được xác nhận (network blip) — lần sau đọc lại giá trị CŨ rồi ghi đè, xoá
// mất phần đã cộng trước đó (phát hiện thật: agent #840671 có 30 feedback on-chain
// nhưng leaderboard từng chỉ còn 1 — do bug này, sửa ở đây và trong backfill script).
async function recomputeAgentScores(supabase: SupabaseClient, agentIds: string[]) {
  if (agentIds.length === 0) return
  const { data: rows, error } = await supabase
    .from('arc_feedback_events')
    .select('agent_id, value, value_decimals, revoked, block_number')
    .in('agent_id', agentIds)
    .eq('revoked', false)
  if (error) throw error

  type Agg = { score: number; count: number; lastBlock: number }
  const byAgent = new Map<string, Agg>()
  for (const row of rows ?? []) {
    const key = String(row.agent_id)
    const cur = byAgent.get(key) ?? { score: 0, count: 0, lastBlock: 0 }
    cur.score += normalizedScore(BigInt(row.value), row.value_decimals)
    cur.count += 1
    cur.lastBlock = Math.max(cur.lastBlock, row.block_number)
    byAgent.set(key, cur)
  }

  // Agent nào không còn dòng nào chưa-revoked (hiếm, FeedbackRevoked gần như không
  // xảy ra) vẫn cần ghi total_score=0 để không giữ giá trị cũ sai.
  const upserts = agentIds.map(agentId => {
    const agg = byAgent.get(agentId) ?? { score: 0, count: 0, lastBlock: 0 }
    return {
      agent_id: agentId,
      total_score: agg.score,
      feedback_count: agg.count,
      last_feedback_block: agg.lastBlock,
      updated_at: new Date().toISOString(),
    }
  })

  const { error: upsertErr } = await supabase.from('arc_agent_leaderboard').upsert(upserts, { onConflict: 'agent_id' })
  if (upsertErr) throw upsertErr
}

// Áp dụng 1 chunk log NewFeedback/FeedbackRevoked (đã decode bởi scanLogs/viem) vào
// Supabase: upsert từng dòng feedback thô, đánh dấu revoked, rồi tính lại điểm tổng
// cho các agent bị ảnh hưởng. Dùng chung bởi route cron (app/api/cron/agent-index).
export async function applyFeedbackLogChunk(supabase: SupabaseClient, logs: DecodedLog[]) {
  type NewRow = { agent_id: string; feedback_index: string; client_address: string; value: string; value_decimals: number; block_number: number }
  type RevokedKey = { agent_id: string; feedback_index: string }

  const newRows: NewRow[] = []
  const revokedKeys: RevokedKey[] = []

  for (const log of logs) {
    const block = Number(log.blockNumber ?? 0n)
    if (log.eventName === 'NewFeedback') {
      const a = log.args as { agentId: bigint; clientAddress: string; feedbackIndex: bigint; value: bigint; valueDecimals: number }
      newRows.push({
        agent_id: a.agentId.toString(),
        feedback_index: a.feedbackIndex.toString(),
        client_address: a.clientAddress,
        value: a.value.toString(),
        value_decimals: a.valueDecimals,
        block_number: block,
      })
    } else if (log.eventName === 'FeedbackRevoked') {
      const a = log.args as { agentId: bigint; feedbackIndex: bigint }
      revokedKeys.push({
        agent_id: a.agentId.toString(),
        feedback_index: a.feedbackIndex.toString(),
      })
    }
  }

  const touchedAgentIds = new Set<string>()

  if (newRows.length > 0) {
    const { error } = await supabase.from('arc_feedback_events').upsert(newRows, { onConflict: 'agent_id,feedback_index', ignoreDuplicates: true })
    if (error) throw error
    for (const row of newRows) touchedAgentIds.add(row.agent_id)
  }

  for (const key of revokedKeys) {
    await supabase.from('arc_feedback_events')
      .update({ revoked: true })
      .eq('agent_id', key.agent_id)
      .eq('feedback_index', key.feedback_index)
    touchedAgentIds.add(key.agent_id)
  }

  await recomputeAgentScores(supabase, [...touchedAgentIds])
}
