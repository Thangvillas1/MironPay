import type { AbiEvent, PublicClient } from 'viem'
import { MAX_LOG_RANGE } from './arc-chain'

interface RpcLikeError {
  details?: string
  shortMessage?: string
  message?: string
}

function errorDetail(err: unknown): string {
  const e = err as RpcLikeError
  return e?.details ?? e?.shortMessage ?? e?.message ?? String(err)
}

// RPC có trả kèm 1 range "gợi ý" khi vượt quá kết quả tối đa (vd: "query exceeds
// max results 20000, retry with the range 49822286-49826768") nhưng ĐÃ VERIFY THẬT
// gợi ý này không đáng tin — retry đúng range đó vẫn có thể exceeds lần nữa (test
// thật ngày 2026-07-02, agent id vùng dày block ~45.84M). Nên bỏ qua gợi ý, luôn
// tự chia đôi range còn lại — hội tụ chắc chắn về 0 trong tối đa ~14 lần (log2(10000)).

// Log đã decode bởi viem (qua `events` — KHÔNG dùng `topics` thô, param đó bị
// getLogs() lặng lẽ bỏ qua nếu không đi kèm event/events, xem arc-chain.ts).
export interface DecodedLog {
  eventName: string
  args: Record<string, unknown>
  blockNumber: bigint | null
}

/**
 * Quét log theo chunk, tự thu hẹp range khi RPC báo vượt giới hạn (10,000 block/lần,
 * 20,000 kết quả/lần — verify thật trên rpc.testnet.arc.network ngày 2026-07-02),
 * gọi onChunk() ngay khi có kết quả từng chunk để caller lưu tiến độ dần dần thay vì
 * gom hết vào bộ nhớ. Hỗ trợ deadline để caller tự giới hạn thời gian chạy (dùng cho
 * route cron chạy trong 1 request) và resume ở lần gọi tiếp theo.
 */
export async function scanLogs(opts: {
  client: PublicClient
  address: `0x${string}`
  events: AbiEvent[]
  fromBlock: bigint
  toBlock: bigint
  onChunk: (logs: DecodedLog[], chunkToBlock: bigint) => Promise<void>
  deadline?: number
  maxRetries?: number
}): Promise<{ resumeFrom: bigint; done: boolean }> {
  const maxRetries = opts.maxRetries ?? 20
  let cursor = opts.fromBlock
  // Nhớ span "an toàn" gần nhất giữa các chunk thay vì luôn reset về MAX_LOG_RANGE —
  // vùng block dày (density cao gần tip) cứ dò lại từ đầu mỗi chunk rất lãng phí
  // round-trip RPC (verify thật: ~10-20s/chunk nếu reset, so với vài giây nếu nhớ span).
  let span = MAX_LOG_RANGE

  while (cursor <= opts.toBlock) {
    if (opts.deadline && Date.now() > opts.deadline) {
      return { resumeFrom: cursor, done: false }
    }

    let end = cursor + (span < MAX_LOG_RANGE ? span : MAX_LOG_RANGE) - 1n
    if (end > opts.toBlock) end = opts.toBlock
    let attempt = 0
    let logs: DecodedLog[] | null = null

    while (logs === null) {
      try {
        logs = await opts.client.getLogs({
          address: opts.address,
          fromBlock: cursor,
          toBlock: end,
          events: opts.events,
          strict: false,
        }) as unknown as DecodedLog[]
        // Thành công — ramp span lên dần (x1.5), không reset thẳng về MAX_LOG_RANGE.
        span = (end - cursor + 1n) * 3n / 2n
        if (span > MAX_LOG_RANGE) span = MAX_LOG_RANGE
        if (span < 1n) span = 1n
      } catch (err) {
        attempt += 1
        if (attempt > maxRetries) throw err
        const detail = errorDetail(err)
        if (detail.includes('10,000 range') || detail.includes('max results')) {
          const curSpan = end - cursor
          end = cursor + (curSpan / 2n > 0n ? curSpan / 2n : 0n)
          span = end - cursor + 1n
        } else {
          // Lỗi khác (mạng, RPC down...) — chờ rồi thử lại cùng range
          await new Promise(r => setTimeout(r, Math.min(1000 * attempt, 8000)))
        }
      }
    }

    await opts.onChunk(logs, end)
    cursor = end + 1n
  }

  return { resumeFrom: cursor, done: true }
}
