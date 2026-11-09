/**
 * Minimal client for the Arc Testnet block explorer (Blockscout v2 API,
 * https://explorer.testnet.arc.io — testnet.arcscan.app 301-redirects here).
 * No API key. Cloudflare rejects some default user agents, so send a normal
 * one. Pagination is cursor-based: pass every key of `next_page_params` back.
 *
 * Verified 2026-11-09 with live calls (see ACTIVITY_DATA_SOURCES.md in the
 * mobile repo): /addresses/{a}/token-transfers?type=ERC-20 returns 50 rows +
 * next_page_params; /addresses/{a}/transactions has fee.value ==
 * gas_used * gas_price in wei (18 dp) — i.e. the fee in USDC on Arc.
 */
const EXPLORER_API = 'https://explorer.testnet.arc.io/api/v2'
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; MironPay/1.0)', Accept: 'application/json' }

export interface ExplorerAddressRef {
  hash: string
  name: string | null
  is_contract: boolean
  is_scam?: boolean
}

export interface ExplorerTokenTransfer {
  transaction_hash: string
  log_index: number
  block_number: number
  timestamp: string
  from: ExplorerAddressRef
  to: ExplorerAddressRef
  method: string | null
  token: { address_hash: string; symbol: string; decimals: string | number | null; type: string }
  total: { value: string; decimals: string | number | null }
}

export interface ExplorerTransaction {
  hash: string
  status: 'ok' | 'error' | null
  result: string
  fee: { value: string } | null
  from: ExplorerAddressRef
  timestamp: string
}

export type ExplorerPage<T> = { items: T[]; next_page_params: Record<string, unknown> | null }

async function get<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v))
  }
  const url = `${EXPLORER_API}${path}${qs.toString() ? `?${qs}` : ''}`
  const res = await fetch(url, { headers: HEADERS, cache: 'no-store' })
  if (!res.ok) throw new Error(`Arc explorer ${res.status} for ${path}`)
  return res.json() as Promise<T>
}

export function getTokenTransfers(address: string, cursor: Record<string, unknown> | null) {
  return get<ExplorerPage<ExplorerTokenTransfer>>(`/addresses/${address}/token-transfers`, { type: 'ERC-20', ...(cursor ?? {}) })
}

export function getAddressTransactions(address: string) {
  return get<ExplorerPage<ExplorerTransaction>>(`/addresses/${address}/transactions`)
}

export function getTransaction(hash: string) {
  return get<ExplorerTransaction>(`/transactions/${hash}`)
}

/** Exact base-unit integer string → decimal string, no float rounding. */
export function unitsToDecimal(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw)) return '0'
  if (decimals <= 0) return raw
  const padded = raw.padStart(decimals + 1, '0')
  const whole = padded.slice(0, -decimals).replace(/^0+(?=\d)/, '')
  const frac = padded.slice(-decimals).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

/** Opaque cursor for clients: base64url(JSON next_page_params). */
export function encodeCursor(p: Record<string, unknown> | null): string | null {
  return p ? Buffer.from(JSON.stringify(p)).toString('base64url') : null
}

export function decodeCursor(c: string | null): Record<string, unknown> | null {
  if (!c) return null
  try {
    const v = JSON.parse(Buffer.from(c, 'base64url').toString('utf8'))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}
