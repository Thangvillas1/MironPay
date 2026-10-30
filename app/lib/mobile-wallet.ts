import QRCode from 'qrcode'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/app/lib/supabase'
import { PENDING_TX_STATES, type TokenBalance, type Transaction } from '@/app/lib/types'

// Shape the phone app (public/demo/mobile-app.html) reads in applyRealWallet().
type MockToken = { sym: string; name: string; bal: number; price: number | null; ch24: number | null; logo: string | null }
type MockTx = {
  who: string; kind: 'in' | 'out' | 'swap'; meta: string; amt: number; tok: string; memo?: string
  hash?: string; from?: string; to?: string; dateLine: string; timeStr: string
}
export type MockWallet = {
  tokens: MockToken[]; txs: MockTx[]
  username: string | null; email: string; address: string; qr: string | null
}

function shortAddr(a?: string) {
  return a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : (a ?? '')
}

function toMockToken(t: TokenBalance): MockToken {
  const bal = parseFloat(t.amount) || 0
  return {
    sym: t.symbol,
    name: t.name,
    bal,
    // Same per-unit price the desktop wallet values this holding at.
    price: t.usdValue != null && bal > 0 ? t.usdValue / bal : null,
    ch24: t.change24hPct,
    logo: t.logoUrl,
  }
}

function toMockTx(tx: Transaction, myAddress: string): MockTx {
  const d = new Date(tx.created_at)
  const label = tx.description || (tx.type === 'credit' ? 'Received' : 'Sent')
  const kind: MockTx['kind'] = label === 'Swap' ? 'swap' : tx.type === 'credit' ? 'in' : 'out'
  const counterparty = tx.type === 'credit' ? tx.sourceAddress : tx.destinationAddress
  const generic = label === 'Received' || label === 'Sent'
  const pending = tx.state && PENDING_TX_STATES.has(tx.state) ? ' · Pending' : ''
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return {
    who: generic ? shortAddr(counterparty) || label : label,
    kind,
    meta: `${day} · ${label}${pending}`,
    amt: tx.type === 'credit' ? Math.abs(tx.amount) : -Math.abs(tx.amount),
    tok: tx.tokenSymbol,
    memo: tx.memo,
    hash: tx.txHash,
    from: shortAddr(tx.sourceAddress ?? (tx.type === 'credit' ? undefined : myAddress)) || undefined,
    to: shortAddr(tx.destinationAddress ?? (tx.type === 'credit' ? myAddress : undefined)) || undefined,
    dateLine: `${date} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
    timeStr: `${date} · ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
  }
}

// Same sources as the desktop wallet: /api/wallet for balances, prices and
// history, profiles for the @username, the session for the email.
export async function loadMockWallet(session: Session): Promise<MockWallet | null> {
  const token = session.access_token
  const [res, profileRes] = await Promise.all([
    fetch('/api/wallet', { headers: { Authorization: `Bearer ${token}` } }),
    supabase.from('profiles').select('username').eq('id', session.user.id).single(),
  ])
  if (!res.ok) return null
  const d = await res.json()
  const address: string = d.walletAddress ?? ''
  // Desktop Receive encodes the bare wallet address; level H so the app's
  // centered logo overlay doesn't break scanning.
  const qr = address
    ? await QRCode.toDataURL(address, { errorCorrectionLevel: 'H', margin: 1, width: 388 }).catch(() => null)
    : null
  return {
    tokens: ((d.tokenList ?? []) as TokenBalance[]).map(toMockToken),
    txs: ((d.transactions ?? []) as Transaction[]).map((tx) => toMockTx(tx, address)),
    username: profileRes.data?.username ?? null,
    email: session.user.email ?? '',
    address,
    qr,
  }
}

// @username → wallet address, same lookup the desktop Send form uses.
export async function resolveUsername(username: string): Promise<string | null> {
  const { data } = await supabase.rpc('resolve_username', { p_username: username.toLowerCase() })
  return typeof data === 'string' && data ? data : null
}
