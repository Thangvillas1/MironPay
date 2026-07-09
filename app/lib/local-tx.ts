import type { Transaction } from './types'

const KEY = 'mp_local_txs'
// Optimistic local tx chỉ tồn tại để lấp khoảng trống trước khi server bắt kịp (polling/refresh).
// Quá thời gian này mà chưa khớp được với server thì coi như đã lỗi thời, không cộng dồn mãi.
const MAX_AGE_MS = 10 * 60 * 1000

export function getLocalTransactions(): Transaction[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Transaction[]
  } catch {
    return []
  }
}

export function addLocalTransaction(tx: Transaction) {
  const existing = getLocalTransactions()
  // Deduplicate by id
  const filtered = existing.filter((t) => t.id !== tx.id)
  localStorage.setItem(KEY, JSON.stringify([tx, ...filtered].slice(0, 100)))
}

export function clearLocalTransactions() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(KEY)
}

// Gộp tx từ server với local tx đang "pending", loại bỏ local tx đã có mặt ở server
// (theo txHash) hoặc đã quá cũ — tránh đếm trùng 1 giao dịch 2 lần (local + server).
export function mergeWithLocalTransactions(serverTxs: Transaction[]): Transaction[] {
  const local = getLocalTransactions()
  const serverHashes = new Set(serverTxs.filter(t => t.txHash).map(t => t.txHash))
  const pending = local.filter(t => {
    if (t.txHash && serverHashes.has(t.txHash)) return false
    return Date.now() - new Date(t.created_at).getTime() < MAX_AGE_MS
  })
  if (pending.length !== local.length && typeof window !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(pending))
  }
  return [...serverTxs, ...pending].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}
