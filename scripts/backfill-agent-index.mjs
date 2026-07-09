/**
 * Backfill toàn bộ lịch sử feedback on-chain (ERC-8004 ReputationRegistry) trên ARC
 * Testnet thành bảng xếp hạng arc_agent_leaderboard trong Supabase.
 *
 * Chạy 1 lần (~30-90+ phút tuỳ tải mạng — dữ liệu thật rất nhiều, hàng triệu dòng),
 * an toàn để Ctrl-C và chạy lại (resume từ arc_index_state, upsert idempotent).
 *
 * Usage: node --env-file=.env.local scripts/backfill-agent-index.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { createPublicClient, http, parseAbiItem } from 'viem'

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
}

const REPUTATION_REGISTRY = '0x8004B663056A597Dffe9eCcC1965A193B7388713'
const REPUTATION_REGISTRY_DEPLOY_BLOCK = 29_241_344n
const MAX_LOG_RANGE = 10_000n

// event ABIs — verify thật trên chain (decode được log thật, value/valueDecimals
// khớp đúng ý nghĩa). Dùng `events:` chứ KHÔNG dùng `topics:` thô — viem's getLogs()
// chỉ đọc address/event/events/args/strict/fromBlock/toBlock/blockHash, `topics` bị
// lặng lẽ bỏ qua nếu truyền trực tiếp.
const NEW_FEEDBACK_EVENT = parseAbiItem(
  'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'
)
const FEEDBACK_REVOKED_EVENT = parseAbiItem(
  'event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)'
)

function errorDetail(err) {
  return err?.details ?? err?.shortMessage ?? err?.message ?? String(err)
}

// Lớp bọc chống lỗi mạng chập chờn (vd "fetch failed" khi gọi Supabase) — không
// phải lỗi logic, retry lại là xong. scanChunk() đã tự retry riêng cho lỗi RPC
// range/max-results, đây là an toàn thêm cho các bước còn lại (ghi Supabase).
async function withRetry(fn, label, maxAttempts = 5) {
  let attempt = 0
  while (true) {
    try {
      return await fn()
    } catch (err) {
      attempt += 1
      if (attempt >= maxAttempts) throw err
      const wait = Math.min(2000 * attempt, 15000)
      console.warn(`  [retry] ${label} failed (${errorDetail(err)}), thử lại ${attempt}/${maxAttempts} sau ${wait}ms`)
      await new Promise(r => setTimeout(r, wait))
    }
  }
}

function decodeNewFeedback(log) {
  const a = log.args
  return {
    agent_id: a.agentId.toString(),
    feedback_index: a.feedbackIndex.toString(),
    client_address: a.clientAddress,
    value: a.value.toString(),
    value_decimals: a.valueDecimals,
    block_number: Number(log.blockNumber),
  }
}

function decodeFeedbackRevoked(log) {
  const a = log.args
  return {
    agent_id: a.agentId.toString(),
    feedback_index: a.feedbackIndex.toString(),
    block_number: Number(log.blockNumber),
  }
}

function normalizedScore(value, decimals) {
  return Number(BigInt(value)) / 10 ** decimals
}

// spanState.value = span (block) ước tính "an toàn" hiện tại — nhớ giữa các lần gọi
// thay vì luôn reset về MAX_LOG_RANGE mỗi chunk. Vùng block dày (density cao gần tip)
// cứ reset về 10,000 rồi chia đôi lại từ đầu mỗi lần rất lãng phí round-trip RPC.
async function scanChunk(client, fromBlock, toBlock, spanState) {
  let span = spanState.value < MAX_LOG_RANGE ? spanState.value : MAX_LOG_RANGE
  let end = fromBlock + span - 1n > toBlock ? toBlock : fromBlock + span - 1n
  let attempt = 0
  while (true) {
    try {
      const logs = await client.getLogs({
        address: REPUTATION_REGISTRY,
        fromBlock,
        toBlock: end,
        events: [NEW_FEEDBACK_EVENT, FEEDBACK_REVOKED_EVENT],
        strict: false,
      })
      // Thành công — ramp span lên dần (x1.5) để không bị kẹt ở size nhỏ mãi nếu
      // mật độ giảm lại, nhưng không reset thẳng về MAX_LOG_RANGE (tránh lãng phí
      // round-trip dò lại nếu vẫn đang trong vùng dày).
      spanState.value = (end - fromBlock + 1n) * 3n / 2n
      if (spanState.value > MAX_LOG_RANGE) spanState.value = MAX_LOG_RANGE
      if (spanState.value < 1n) spanState.value = 1n
      return { logs, end }
    } catch (err) {
      attempt += 1
      if (attempt > 20) throw err
      const detail = errorDetail(err)
      // RPC gợi ý "retry with the range X-Y" nhưng ĐÃ VERIFY THẬT gợi ý này không
      // đáng tin (retry đúng range đó vẫn có thể exceeds lần nữa — test thật ngày
      // 2026-07-02, vùng block ~45.84M). Bỏ qua gợi ý, luôn tự chia đôi — hội tụ
      // chắc chắn về 0 trong tối đa ~14 lần (log2(10000)).
      if (detail.includes('10,000 range') || detail.includes('max results')) {
        const curSpan = end - fromBlock
        end = fromBlock + (curSpan / 2n > 0n ? curSpan / 2n : 0n)
        spanState.value = end - fromBlock + 1n
      } else {
        await new Promise(r => setTimeout(r, Math.min(1000 * attempt, 8000)))
      }
    }
  }
}

// Tính lại total_score/feedback_count của 1 nhóm agent TRỰC TIẾP từ arc_feedback_events
// (nguồn dữ liệu gốc) thay vì cộng dồn delta vào giá trị cũ — an toàn tuyệt đối khi
// gọi lại nhiều lần (idempotent), vì luôn ghi đè bằng tổng tính lại từ đầu chứ không
// phụ thuộc giá trị đã đọc trước đó. Fix bug "lost update": cách cộng dồn cũ (đọc
// total_score hiện tại rồi ghi total_score+delta) bị mất dữ liệu khi 1 lần ghi trước
// đó không được xác nhận (network blip) — lần sau đọc lại giá trị CŨ rồi ghi đè,
// xoá mất phần đã cộng trước đó (phát hiện thật: agent #840671 có 30 feedback on-chain
// nhưng leaderboard chỉ còn 1 — do bug này).
async function recomputeAgentScores(supabase, agentIds) {
  if (agentIds.length === 0) return
  const { data: rows, error } = await supabase
    .from('arc_feedback_events')
    .select('agent_id, value, value_decimals, revoked, block_number')
    .in('agent_id', agentIds)
    .eq('revoked', false)
  if (error) throw error

  const byAgent = new Map()
  for (const row of rows ?? []) {
    const key = String(row.agent_id)
    const cur = byAgent.get(key) ?? { score: 0, count: 0, lastBlock: 0 }
    cur.score += normalizedScore(row.value, row.value_decimals)
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

async function applyChunk(supabase, logs) {
  const newRows = []
  const revokedKeys = []
  for (const log of logs) {
    if (log.eventName === 'NewFeedback') newRows.push(decodeNewFeedback(log))
    else if (log.eventName === 'FeedbackRevoked') revokedKeys.push(decodeFeedbackRevoked(log))
  }

  const touchedAgentIds = new Set()

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

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY chưa cấu hình trong .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const client = createPublicClient({ chain: arcTestnet, transport: http() })

  const { data: state } = await supabase
    .from('arc_index_state')
    .select('last_scanned_block')
    .eq('contract_key', 'reputation_registry')
    .maybeSingle()

  const startBlock = state ? BigInt(state.last_scanned_block) + 1n : REPUTATION_REGISTRY_DEPLOY_BLOCK
  let cursor = startBlock
  const tip = await client.getBlockNumber()
  const totalBlocks = tip - startBlock + 1n

  console.log(`Backfill reputation_registry: block ${cursor} → ${tip} (${totalBlocks} blocks)`)

  let chunks = 0
  const startTime = Date.now()
  const spanState = { value: MAX_LOG_RANGE }

  while (cursor <= tip) {
    const { logs, end } = await withRetry(() => scanChunk(client, cursor, tip, spanState), 'scanChunk')
    await withRetry(() => applyChunk(supabase, logs), 'applyChunk')
    await withRetry(() => supabase.from('arc_index_state').upsert({
      contract_key: 'reputation_registry',
      last_scanned_block: Number(end),
      updated_at: new Date().toISOString(),
    }), 'checkpoint upsert')

    chunks += 1
    cursor = end + 1n

    if (chunks % 10 === 0 || cursor > tip) {
      const pct = (Number(cursor - startBlock) / Number(totalBlocks) * 100).toFixed(1)
      const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1)
      console.log(`  block ${cursor}/${tip} (~${pct}%) — ${chunks} chunks, ${elapsedMin} min elapsed`)
    }
  }

  console.log(`Done. Scanned up to block ${cursor - 1n}.`)
}

main().catch(err => {
  console.error('Backfill failed:', err.message ?? err)
  console.error('An toàn để chạy lại — sẽ resume từ arc_index_state.last_scanned_block')
  process.exit(1)
})
