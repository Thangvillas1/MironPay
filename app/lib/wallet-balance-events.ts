import { decodeEventLog, parseAbiItem, type Hash, type TransactionReceipt } from 'viem'
import { arcPublicClient, USDC_TOKEN } from './arc-chain'

// The dashboard's balance sparkline is rebuilt backwards from the current
// balance using each transaction's effect. Circle's transaction list can't
// supply that effect on its own: a contract call (payroll approve/payBatch,
// launchpad contribute, …) is reported as amount 0 and /api/wallet drops it,
// and gas — paid in USDC on Arc — is never in `amounts`. That once drew a
// +$1 jump for a day where the wallet really lost $0.045 (paid 1.001 USDC
// into a payroll run, claimed 1 back, plus gas). The receipt is the source of
// truth: every ERC-20 Transfer in/out of this wallet, plus the gas it paid.

const TRANSFER = parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')

/** Arc gas is metered in native USDC with 18 decimals. */
const NATIVE_DECIMALS = 18

// Receipts of mined transactions never change; cache per warm instance.
const receiptCache = new Map<string, Promise<TransactionReceipt | null>>()

function receiptFor(txHash: string): Promise<TransactionReceipt | null> {
  let pending = receiptCache.get(txHash)
  if (!pending) {
    pending = arcPublicClient()
      .getTransactionReceipt({ hash: txHash as Hash })
      .catch(() => {
        receiptCache.delete(txHash) // transient RPC failure — retry next time
        return null
      })
    receiptCache.set(txHash, pending)
  }
  return pending
}

export interface BalanceEvent {
  created_at: string
  /** Net change of this wallet per token symbol, in whole token units. */
  change: Record<string, number>
}

interface CircleTx {
  txHash?: string
  state?: string
  createDate?: string
}

/**
 * Exact per-transaction balance changes for `walletAddress`, for completed
 * transactions created at or after `sinceMs`. `tokens` maps a lowercased
 * token contract address to its symbol and decimals; transfers of any other
 * token are ignored (they aren't in the wallet total either). Returns null if
 * any receipt in the window couldn't be read, so the caller can fall back
 * rather than draw a chart with a silent hole in it.
 */
export async function walletBalanceEvents(
  txs: CircleTx[],
  walletAddress: string,
  tokens: Map<string, { symbol: string; decimals: number }>,
  sinceMs: number,
): Promise<BalanceEvent[] | null> {
  const wallet = walletAddress.toLowerCase()
  const inWindow = txs.filter((tx) =>
    tx.txHash && tx.state === 'COMPLETE' && tx.createDate && Date.parse(tx.createDate) >= sinceMs
  )
  // One Circle record per leg can share a tx hash; count each hash once.
  const unique = Array.from(new Map(inWindow.map((tx) => [tx.txHash!.toLowerCase(), tx])).values())

  const receipts = await Promise.all(unique.map((tx) => receiptFor(tx.txHash!)))
  if (receipts.some((r) => r === null)) return null

  return unique.map((tx, i) => {
    const receipt = receipts[i]!
    const change: Record<string, number> = {}
    const add = (symbol: string, amount: number) => { change[symbol] = (change[symbol] ?? 0) + amount }

    for (const log of receipt.logs) {
      const token = tokens.get(log.address.toLowerCase())
      if (!token) continue
      try {
        const { args } = decodeEventLog({ abi: [TRANSFER], data: log.data, topics: log.topics, strict: true })
        const value = Number(args.value) / 10 ** token.decimals
        if (args.from.toLowerCase() === wallet) add(token.symbol, -value)
        if (args.to.toLowerCase() === wallet) add(token.symbol, value)
      } catch {
        // not a Transfer log
      }
    }

    // Gas is paid by the sender only (a relayer-submitted claim costs us nothing).
    if (receipt.from.toLowerCase() === wallet) {
      const usdcSymbol = tokens.get(USDC_TOKEN.toLowerCase())?.symbol ?? 'USDC'
      add(usdcSymbol, -Number(receipt.gasUsed * receipt.effectiveGasPrice) / 10 ** NATIVE_DECIMALS)
    }

    return { created_at: tx.createDate!, change }
  })
}
