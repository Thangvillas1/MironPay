import {
  decodeEventLog,
  hexToString,
  parseAbiItem,
  type Hash,
  type Hex,
} from 'viem'
import { arcPublicClient } from './arc-chain'

export const ARC_MEMO_CONTRACT = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505' as const

export const ARC_MEMO_EVENT = parseAbiItem(
  'event Memo(address indexed sender,address indexed target,bytes32 callDataHash,bytes32 indexed memoId,bytes memo,uint256 memoIndex)'
)

const ERC20_TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from,address indexed to,uint256 value)'
)

export interface ArcTransactionMemo {
  memo: string
  senderAddress: string
  recipientAddress: string
  tokenAddress: string
}

// Wallet history is requested often. Cache both hits and misses per warm
// server instance so old non-memo transfers do not trigger the same RPC read
// on every refresh.
const receiptMemoCache = new Map<string, Promise<ArcTransactionMemo | null>>()

function sameAddress(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

function readableMemo(value: Hex): string | null {
  // Keep an arbitrary public memo from making the wallet response/UI huge.
  if ((value.length - 2) / 2 > 1_024) return null
  try {
    const text = hexToString(value).replace(/\0/g, '').trim()
    return text ? text.slice(0, 500) : null
  } catch {
    // Memo bytes are allowed to be non-text. The current UI only renders text,
    // so do not show corrupt replacement characters or pretend it decoded.
    return null
  }
}

/**
 * Reads an Arc-standard transaction memo from a successful receipt.
 *
 * A memo is accepted only when its event sender + token target match an ERC-20
 * Transfer in the same transaction whose recipient is this wallet. This lets
 * MironPay read memos written by other apps using Arc's Memo predeploy while
 * avoiding an unsafe sender/time-based guess between separate transactions.
 */
async function fetchArcTransactionMemo(
  txHash: string,
  recipientAddress: string
): Promise<ArcTransactionMemo | null> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return null

  const receipt = await arcPublicClient().getTransactionReceipt({ hash: txHash as Hash })
  if (receipt.status !== 'success') return null

  const transfers: Array<{ token: string; from: string; to: string }> = []
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: [ERC20_TRANSFER_EVENT],
        data: log.data,
        topics: log.topics,
        strict: true,
      })
      const args = decoded.args as { from: string; to: string }
      if (sameAddress(args.to, recipientAddress)) {
        transfers.push({ token: log.address, from: args.from, to: args.to })
      }
    } catch {
      // Not an ERC-20 Transfer log.
    }
  }

  if (transfers.length === 0) return null

  const candidates: ArcTransactionMemo[] = []
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, ARC_MEMO_CONTRACT)) continue
    try {
      const decoded = decodeEventLog({
        abi: [ARC_MEMO_EVENT],
        data: log.data,
        topics: log.topics,
        strict: true,
      })
      const args = decoded.args as { sender: string; target: string; memo: Hex }
      const matchingTransfers = transfers.filter(
        transfer => sameAddress(transfer.token, args.target) && sameAddress(transfer.from, args.sender)
      )
      if (matchingTransfers.length !== 1) continue

      const memo = readableMemo(args.memo)
      if (!memo) continue
      candidates.push({
        memo,
        senderAddress: args.sender,
        recipientAddress: matchingTransfers[0].to,
        tokenAddress: args.target,
      })
    } catch {
      // Not a Memo event emitted by the official predeploy.
    }
  }

  // Multiple matching memos in one batch cannot be associated reliably from
  // the event fields alone, so fail closed instead of showing the wrong note.
  return candidates.length === 1 ? candidates[0] : null
}

export function readArcTransactionMemo(
  txHash: string,
  recipientAddress: string
): Promise<ArcTransactionMemo | null> {
  const key = `${txHash.toLowerCase()}:${recipientAddress.toLowerCase()}`
  const cached = receiptMemoCache.get(key)
  if (cached) return cached

  const pending = fetchArcTransactionMemo(txHash, recipientAddress)
  receiptMemoCache.set(key, pending)
  pending.catch(() => receiptMemoCache.delete(key))

  // Keep memory bounded on a long-lived server instance.
  if (receiptMemoCache.size > 500) {
    const oldestKey = receiptMemoCache.keys().next().value as string | undefined
    if (oldestKey) receiptMemoCache.delete(oldestKey)
  }
  return pending
}
