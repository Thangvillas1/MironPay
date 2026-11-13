import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseAbiItem, type Hash } from 'viem'
import { arcPublicClient } from '@/app/lib/arc-chain'
import { PAYMENT_ROUTER_ADDRESS } from '@/app/lib/payment-router'

// Incremental index of MironPaymentRouter events into public.router_events
// (see supabase/migrations/20261113_store_revenue_index.sql). The Revenue
// screen reads only these rows, and each row is a copy of an on-chain event
// plus its receipt's gas, so revenue figures come from the chain.

export const ROUTER_DEPLOY_BLOCK = BigInt(71_910_573)
const CURSOR_ID = 'mironpay_router_v1'
// Arc RPC caps eth_getLogs at 10,000 blocks per call.
const WINDOW = BigInt(9_999)
// Bound the work per request (~40 calls ≈ 400k blocks ≈ 2.3 days of Arc).
const MAX_WINDOWS_PER_SYNC = 40
// Stay a couple of blocks behind head so we never index a block twice-differently.
const CONFIRMATIONS = BigInt(2)

const SETTLED = parseAbiItem('event Settled(bytes32 indexed orderKey, bytes32 indexed orderId, address indexed merchant, address token, uint256 credited, uint256 fee, uint256 net, uint256 excess, uint8 status)')
const REFUNDED = parseAbiItem('event ExcessRefunded(bytes32 indexed orderKey, bytes32 indexed orderId, address indexed to, uint256 amount)')

type Row = {
  tx_hash: string
  log_index: number
  block_number: number
  block_time: string
  kind: 'settled' | 'refunded'
  order_key: string
  router_order_id: string
  merchant_address: string | null
  token: string | null
  credited_units: string
  fee_units: string
  net_units: string
  excess_units: string
  refund_units: string
  refund_to: string | null
  status: number | null
  tx_from: string
  gas_wei: string
}

/**
 * Catches the index up to (head - CONFIRMATIONS). Safe to run concurrently:
 * rows upsert on (tx_hash, log_index) and the cursor only moves forward.
 * Returns the last indexed block.
 */
export async function syncRouterEvents(admin: SupabaseClient): Promise<bigint> {
  const client = arcPublicClient()
  const { data: cursor } = await admin.from('router_index_cursor').select('last_block').eq('id', CURSOR_ID).maybeSingle()
  let from = cursor ? BigInt(cursor.last_block) + BigInt(1) : ROUTER_DEPLOY_BLOCK
  const head = (await client.getBlockNumber()) - CONFIRMATIONS
  let last = from - BigInt(1)

  for (let w = 0; w < MAX_WINDOWS_PER_SYNC && from <= head; w++) {
    const to = from + WINDOW > head ? head : from + WINDOW
    const logs = await client.getLogs({ address: PAYMENT_ROUTER_ADDRESS, events: [SETTLED, REFUNDED], fromBlock: from, toBlock: to })

    if (logs.length > 0) {
      const txHashes = [...new Set(logs.map((l) => l.transactionHash as Hash))]
      const blockNums = [...new Set(logs.map((l) => l.blockNumber as bigint))]
      const [receipts, blocks] = await Promise.all([
        Promise.all(txHashes.map((hash) => client.getTransactionReceipt({ hash }))),
        Promise.all(blockNums.map((n) => client.getBlock({ blockNumber: n }))),
      ])
      const receiptBy = new Map(receipts.map((r) => [r.transactionHash.toLowerCase(), r]))
      const timeBy = new Map(blocks.map((b) => [b.number, new Date(Number(b.timestamp) * 1000).toISOString()]))

      // Refund events carry no merchant; take it from the order's settle.
      const merchantByKey = new Map<string, string>()
      for (const l of logs) {
        if (l.eventName === 'Settled') merchantByKey.set(String(l.args.orderKey).toLowerCase(), String(l.args.merchant).toLowerCase())
      }
      const missing = logs
        .filter((l) => l.eventName === 'ExcessRefunded' && !merchantByKey.has(String(l.args.orderKey).toLowerCase()))
        .map((l) => String(l.args.orderKey).toLowerCase())
      if (missing.length > 0) {
        const { data } = await admin
          .from('router_events')
          .select('order_key, merchant_address')
          .eq('kind', 'settled')
          .in('order_key', [...new Set(missing)])
        for (const r of data ?? []) if (r.merchant_address) merchantByKey.set(r.order_key, r.merchant_address)
      }

      const gasCounted = new Set<string>()
      const rows: Row[] = logs.map((l) => {
        const hash = String(l.transactionHash).toLowerCase()
        const receipt = receiptBy.get(hash)!
        const firstInTx = !gasCounted.has(hash)
        gasCounted.add(hash)
        const key = String(l.args.orderKey).toLowerCase()
        const base = {
          tx_hash: hash,
          log_index: Number(l.logIndex),
          block_number: Number(l.blockNumber),
          block_time: timeBy.get(l.blockNumber as bigint)!,
          order_key: key,
          router_order_id: String(l.args.orderId).toLowerCase(),
          tx_from: receipt.from.toLowerCase(),
          gas_wei: firstInTx ? (receipt.gasUsed * receipt.effectiveGasPrice).toString() : '0',
        }
        if (l.eventName === 'Settled') {
          const a = l.args
          return {
            ...base,
            kind: 'settled',
            merchant_address: String(a.merchant).toLowerCase(),
            token: String(a.token).toLowerCase(),
            credited_units: String(a.credited),
            fee_units: String(a.fee),
            net_units: String(a.net),
            excess_units: String(a.excess),
            refund_units: '0',
            refund_to: null,
            status: Number(a.status),
          }
        }
        const a = l.args
        return {
          ...base,
          kind: 'refunded',
          merchant_address: merchantByKey.get(key) ?? null,
          token: null,
          credited_units: '0',
          fee_units: '0',
          net_units: '0',
          excess_units: '0',
          refund_units: String(a.amount),
          refund_to: String(a.to).toLowerCase(),
          status: null,
        }
      })
      const { error } = await admin.from('router_events').upsert(rows, { onConflict: 'tx_hash,log_index', ignoreDuplicates: true })
      if (error) throw new Error(`router_events upsert failed: ${error.message}`)
    }

    last = to
    from = to + BigInt(1)
  }

  if (!cursor || last > BigInt(cursor.last_block)) {
    await admin.from('router_index_cursor').upsert({ id: CURSOR_ID, last_block: Number(last), updated_at: new Date().toISOString() })
  }
  return last
}
