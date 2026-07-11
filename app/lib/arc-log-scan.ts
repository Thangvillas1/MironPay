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

// The RPC sometimes returns a "suggested" range when the result limit is
// exceeded (e.g. "query exceeds max results 20000, retry with the range
// 49822286-49826768") but VERIFIED LIVE that suggestion isn't reliable —
// retrying that exact range can still exceed again (tested 2026-07-02, in a
// dense block region around ~45.84M). So we ignore the suggestion and always
// halve the remaining range ourselves — guaranteed to converge to 0 within
// ~14 iterations max (log2(10000)).

// Logs are decoded by viem (via `events` — NOT raw `topics`, which getLogs()
// silently ignores if not paired with event/events, see arc-chain.ts).
export interface DecodedLog {
  eventName: string
  args: Record<string, unknown>
  blockNumber: bigint | null
}

/**
 * Scans logs in chunks, auto-shrinking the range whenever the RPC reports the
 * limit exceeded (10,000 blocks/call, 20,000 results/call — verified live on
 * rpc.testnet.arc.network on 2026-07-02). Calls onChunk() as soon as each
 * chunk's results are ready so the caller can persist progress incrementally
 * instead of buffering everything in memory. Supports a deadline so the
 * caller can cap run time (used by a cron route that runs within one
 * request) and resume on the next call.
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
  // Remember the last "safe" span between chunks instead of always resetting
  // to MAX_LOG_RANGE — in dense block regions (high density near the tip),
  // re-probing from scratch every chunk wastes RPC round-trips (verified
  // live: ~10-20s/chunk if reset, vs a few seconds if the span is remembered).
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
        // Success — ramp the span up gradually (x1.5) instead of jumping straight back to MAX_LOG_RANGE.
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
          // Other error (network, RPC down...) — wait then retry the same range
          await new Promise(r => setTimeout(r, Math.min(1000 * attempt, 8000)))
        }
      }
    }

    await opts.onChunk(logs, end)
    cursor = end + 1n
  }

  return { resumeFrom: cursor, done: true }
}
