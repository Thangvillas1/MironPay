export const TOKEN_USD_PRICE: Record<string, number> = {
  USDC: 1.0,
  EURC: 1.09,
  USDT: 1.0,
  USDP: 1.0,
}

export type Wallet = {
  id: string
  balance: number
  currency: string
}

export type TokenBalance = {
  symbol: string
  name: string
  amount: string
  usdValue: number | null
  change24hPct: number | null
  logoUrl: string | null
  isVerified: boolean
  tokenAddress: string | null
}

export type Transaction = {
  id: string
  type: 'credit' | 'debit'
  amount: number
  tokenSymbol: string
  description: string
  created_at: string
  state?: string
  txHash?: string
  blockchain?: string
  sourceAddress?: string
  destinationAddress?: string
  networkFee?: string
  memo?: string
}

// Circle transaction states that mean "still in flight" — same taxonomy already
// used in TransactionDetailModal's STATE_LABEL. A transaction with no `state` at
// all is a local optimistic entry (see app/lib/local-tx.ts) not yet matched to a
// server record, which is also "pending" from the user's point of view.
export const PENDING_TX_STATES = new Set(['SENT', 'QUEUED', 'INITIATED', 'PENDING_RISK_SCREENING'])
export function isPendingTx(t: Transaction): boolean {
  return !t.state || PENDING_TX_STATES.has(t.state)
}

const FAILED_TX_STATES = new Set(['FAILED', 'CANCELLED', 'DENIED'])
export function isFailedTx(t: Transaction): boolean {
  return !!t.state && FAILED_TX_STATES.has(t.state)
}
export function txStatusLabel(t: Transaction): { text: string; tone: 'success' | 'warning' | 'danger' } {
  if (isFailedTx(t)) return { text: 'Failed', tone: 'danger' }
  if (isPendingTx(t)) return { text: 'Pending', tone: 'warning' }
  return { text: 'Confirmed', tone: 'success' }
}
