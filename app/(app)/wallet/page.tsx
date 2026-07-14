'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { isOnboardingComplete } from '@/app/lib/onboarding'
import { useAuthStore } from '@/app/store/auth'
import { useWalletStore } from '@/app/store/wallet'
import type { Transaction, TokenBalance } from '@/app/lib/types'
import { isPendingTx, isFailedTx, txStatusLabel } from '@/app/lib/types'
import TransactionDetailModal from '@/app/components/TransactionDetailModal'
import TransactionHistoryModal from '@/app/components/TransactionHistoryModal'
import { mergeWithLocalTransactions } from '@/app/lib/local-tx'
import VerifiedBadge from '@/app/components/VerifiedBadge'
import SRSModal, { type ModalMode } from '@/app/components/SRSModal'

function formatUSD(n: number) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Per-wallet analytics (shared shape for Main Wallet + Agent Wallet cards) ───
// Best/Worst were removed intentionally — those are trading-dashboard concepts,
// not wallet concepts (see redesign spec, Part "Remove Best and Worst").
interface WalletStats {
  tokenCount: number
  verifiedCount: number
  txCount24h: number
  volume24h: number
  pendingCount: number
  lastActivityAt: string | null
}

function computeWalletStats(tokenList: TokenBalance[], transactions: Transaction[]): WalletStats {
  const priceBySymbol: Record<string, number> = {}
  tokenList.forEach(t => {
    const amt = parseFloat(t.amount)
    if (t.usdValue != null && amt > 0) priceBySymbol[t.symbol] = t.usdValue / amt
  })
  function txUsd(t: Transaction) {
    if (t.tokenSymbol === 'USDC' || t.tokenSymbol === 'USDT') return t.amount
    return priceBySymbol[t.tokenSymbol] != null ? t.amount * priceBySymbol[t.tokenSymbol] : t.amount
  }
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  // Failed transactions never moved funds — don't count them toward volume.
  const txs24h = transactions.filter(t => new Date(t.created_at) > cutoff24h && !isFailedTx(t))

  return {
    tokenCount: tokenList.length,
    verifiedCount: tokenList.filter(t => t.isVerified).length,
    txCount24h: txs24h.length,
    volume24h: txs24h.reduce((s, t) => s + txUsd(t), 0),
    pendingCount: transactions.filter(isPendingTx).length,
    lastActivityAt: transactions.length
      ? transactions.reduce((latest, t) => t.created_at > latest ? t.created_at : latest, transactions[0].created_at)
      : null,
  }
}

// ── Portfolio trend chart (area + line, matches design's hero chart) ──────────
interface ChartPoint { value: number; date: Date }
function TrendChart({ points, dateFormat }: { points: ChartPoint[]; dateFormat: Intl.DateTimeFormatOptions }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  if (points.length < 2) return null
  const values = points.map(p => p.value)
  const w = 600, h = 130, padTop = 8
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || max * 0.02 || 1
  const xs = values.map((_, i) => (i / (values.length - 1)) * w)
  const ys = values.map(v => h - padTop - ((v - min) / span) * (h - padTop * 2))
  const pts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`)
  const linePath = `M${pts.join(' L')}`
  const fillPath = `M0,${h} L${pts.join(' L')} L${w},${h} Z`

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * w
    let closest = 0
    let closestDist = Infinity
    xs.forEach((x, i) => {
      const dist = Math.abs(x - relX)
      if (dist < closestDist) { closestDist = dist; closest = i }
    })
    setHoverIdx(closest)
  }

  const hovered = hoverIdx != null ? points[hoverIdx] : null
  const hoverXPct = hoverIdx != null ? (xs[hoverIdx] / w) * 100 : null

  return (
    <div style={{ position: 'relative', marginTop: 14 }}>
      {hovered && hoverXPct != null && (
        <div
          style={{
            position: 'absolute', top: 0, transform: hoverXPct > 75 ? 'translateX(-100%)' : hoverXPct < 5 ? 'translateX(0)' : 'translateX(-50%)',
            left: `${hoverXPct}%`, pointerEvents: 'none', zIndex: 1,
            background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.14)', borderRadius: 8,
            padding: '5px 9px', boxShadow: '0 4px 16px rgba(0,0,0,.3)', whiteSpace: 'nowrap' as const,
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>${formatUSD(hovered.value)}</div>
          <div style={{ fontSize: 10, color: 'var(--c-muted2)' }}>{hovered.date.toLocaleString('en-US', dateFormat)}</div>
        </div>
      )}
      <svg
        viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 120, display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMove} onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="walletTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#818cf8" stopOpacity=".40" />
            <stop offset="1" stopColor="#818cf8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#walletTrendFill)" />
        <path d={linePath} fill="none" stroke="var(--c-indigo-light)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        {hoverIdx != null && (
          <>
            <line x1={xs[hoverIdx]} y1={0} x2={xs[hoverIdx]} y2={h} stroke="rgba(var(--c-fg-rgb),.18)" strokeWidth={1} />
            <circle cx={xs[hoverIdx]} cy={ys[hoverIdx]} r={4} fill="var(--c-indigo-light)" stroke="var(--c-page)" strokeWidth={2} />
          </>
        )}
      </svg>
    </div>
  )
}

// ── Wallet Card ───────────────────────────────────────────────────────────────
// All 3 cards share the exact same glass background as the "Total portfolio
// value" hero above them — only the accent (blur glow + status color) still
// varies per card, for a subtle hint of identity without a mismatched card color.
const CARD_GLASS = {
  background: 'linear-gradient(165deg,rgba(99,102,241,.10),transparent 56%),color-mix(in srgb, var(--c-panel) 55%, transparent)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(var(--c-fg-rgb),.10)',
  boxShadow: '0 8px 30px rgba(99,102,241,.42),inset 0 1px 0 rgba(var(--c-fg-rgb),.07)',
}
const CARD_THEME = {
  blue:   { accent: '#6366f1' },
  purple: { accent: '#8b7cff' },
}

// Label above value, each on its own line — cards in this row are narrow
// (they share width with the portfolio hero), so a tile gets the full card
// width for its value instead of splitting one line between label + value.
function StatTile({ label, value, color = 'var(--c-text)' }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '5px 8px', borderRadius: 7, background: 'rgba(var(--c-fg-rgb),.05)' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase' as const, color: 'var(--c-muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{label}</div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{value}</div>
    </div>
  )
}

type CardTile = { label: string; value: string; color?: string }

function WalletCard({ variant, label, balance, symbol, address, status, locked = false, onCopy, copied, tiles }: {
  variant: 'blue' | 'purple'
  label: string
  balance: number
  symbol: string
  address: string | null
  status: string
  locked?: boolean
  onCopy?: () => void
  copied?: boolean
  tiles?: CardTile[]
}) {
  const th = CARD_THEME[variant]
  const showCopy = !!address && !!onCopy && !locked
  return (
    <div
      className="mp-wallet-card"
      style={{
        padding: '18px 16px', borderRadius: 14,
        ...CARD_GLASS,
        WebkitBackdropFilter: CARD_GLASS.backdropFilter,
        display: 'flex', flexDirection: 'column', gap: 10,
        opacity: locked ? 0.55 : 1, position: 'relative', overflow: 'hidden',
        transition: 'transform .2s, box-shadow .2s',
      }}
    >
      <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: th.accent, opacity: 0.12, filter: 'blur(20px)', pointerEvents: 'none' }} />
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: 'var(--c-muted)' }}>{label}</div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>
          {locked ? '—' : `$${formatUSD(balance)}`}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--c-muted)', marginTop: 2 }}>{symbol}</div>
      </div>
      {tiles && !locked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tiles.map(t => <StatTile key={t.label} label={t.label} value={t.value} color={t.color} />)}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1, fontSize: 11.5, fontFamily: 'monospace', color: 'var(--c-muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
          {address ? `${address.slice(0, 6)}···${address.slice(-4)}` : '—'}
        </span>
        {showCopy && (
          <button
            onClick={e => { e.stopPropagation(); onCopy?.() }}
            title="Copy address"
            style={{ flexShrink: 0, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--c-fg-rgb),.06)', border: `1px solid ${copied ? th.accent : 'rgba(var(--c-fg-rgb),.14)'}`, borderRadius: 6, cursor: 'pointer', color: copied ? th.accent : 'var(--c-muted2)', padding: 0, transition: 'all .15s' }}
          >
            {copied
              ? <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
              : <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>
            }
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: locked ? 'var(--c-muted2)' : th.accent }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: locked ? 'var(--c-muted2)' : th.accent, display: 'inline-block' }} />
        {status}
      </div>
    </div>
  )
}

// ── Activity Row ──────────────────────────────────────────────────────────────
// Icon + tint per activity type. Bridge/Yield aren't live features yet (see
// project_pending_features memory) — their detection/icon exist so the row
// already knows how to render them the day either feature ships, but no real
// transaction produces that description today, so nothing here is fabricated.
function activityIcon(tx: Transaction) {
  const desc = tx.description?.toLowerCase() ?? ''
  const isCredit = tx.type === 'credit'
  if (desc.includes('bridge')) return {
    bg: 'rgba(96,165,250,.16)', color: 'var(--c-blue-accent)',
    icon: <path d="M3 21V10l9-6 9 6v11M7 21v-7h10v7" />,
  }
  if (desc.includes('yield')) return {
    bg: 'rgba(34,197,94,.14)', color: '#22c55e',
    icon: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  }
  if (desc.includes('swap')) return {
    bg: 'rgba(139,124,255,.16)', color: 'var(--c-purple-accent)',
    icon: <path d="M6 3h12M6 21h12M7 3c0 4 3 5 5 7 2-2 5-3 5-7M7 21c0-4 3-5 5-7 2 2 5 3 5 7" />,
  }
  if (isCredit) return {
    bg: 'rgba(45,212,191,.14)', color: '#2dd4bf',
    icon: <path d="M12 5v14M19 12l-7 7-7-7" />,
  }
  return {
    bg: 'rgba(251,111,132,.14)', color: '#fb6f84',
    icon: <path d="M12 19V5M5 12l7-7 7 7" />,
  }
}

function ActivityRow({ tx, onClick }: { tx: Transaction; onClick: () => void }) {
  const isCredit = tx.type === 'credit'
  const isAgent = !!tx.description?.toLowerCase().includes('agent')
  const hasMemo = !!tx.memo
  const { bg: iconBg, color: iconColor, icon } = activityIcon(tx)
  const amtColor = isCredit ? '#2dd4bf' : '#fb6f84'
  const status = txStatusLabel(tx)
  const statusColor = status.tone === 'success' ? '#2dd4bf' : status.tone === 'warning' ? 'var(--c-warning)' : '#fb6f84'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid rgba(var(--c-fg-rgb),.05)' }}>
      <span onClick={onClick} style={{
        width: 30, height: 30, borderRadius: 9,
        background: hasMemo ? 'rgba(124,107,245,.18)' : iconBg,
        border: hasMemo ? '1px solid rgba(124,107,245,.35)' : '1px solid transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        color: hasMemo ? 'var(--c-purple-accent)' : iconColor, cursor: 'pointer',
      }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>
      <div onClick={onClick} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</span>
          {hasMemo && (
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--c-purple-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          )}
          {isAgent && (
            <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, color: 'var(--c-purple-accent)', background: 'rgba(139,124,255,.14)', padding: '1px 5px', borderRadius: 9999 }}>AI</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--c-muted2)' }}>
          <span style={{ color: statusColor }}>{status.text}</span>
          · {new Date(tx.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 600, color: amtColor }}>
          {isCredit ? '+' : '−'}{tx.amount.toFixed(2)}
        </div>
        {tx.txHash && (
          <a
            href={`https://testnet.arcscan.app/tx/${tx.txHash}`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ fontSize: 10.5, color: 'var(--c-indigo-light)', textDecoration: 'none' }}
          >
            explorer ↗
          </a>
        )}
      </div>
    </div>
  )
}

// ── Token Logo ────────────────────────────────────────────────────────────────
function TokenLogo({ symbol, logoUrl }: { symbol: string; logoUrl: string | null }) {
  const [err, setErr] = useState(false)
  if (!logoUrl || err) return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-indigo-light)' }}>{symbol.slice(0, 2)}</span>
    </div>
  )
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logoUrl} alt={symbol} width={36} height={36} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={() => setErr(true)} />
}

// ── Page ──────────────────────────────────────────────────────────────────────
type TxFilter = 'all' | 'send' | 'receive' | 'swap'
type RangeKey = '24H' | '7D' | '1M' | 'All'
const RANGES: RangeKey[] = ['24H', '7D', '1M', 'All']
// Reconstructed from transaction history (no real balance-snapshot history
// exists yet), so accuracy is bounded by how many transactions are fetched
// (see pageSize in /api/wallet and /api/agent/wallet) — fine for these
// short windows, not for "All" (would need full history since account
// creation), which stays disabled below.
const RANGE_BUCKETS: Record<Exclude<RangeKey, 'All'>, { count: number; stepMs: number; label: string }> = {
  '24H': { count: 24, stepMs: 60 * 60 * 1000, label: '24-hour' },
  '7D': { count: 7, stepMs: 24 * 60 * 60 * 1000, label: '7-day' },
  '1M': { count: 30, stepMs: 24 * 60 * 60 * 1000, label: '30-day' },
}

export default function WalletPage() {
  const router = useRouter()
  const { user, setUser } = useAuthStore()
  const { wallet, transactions, tokenList, walletAddress,
    setWallet, setTransactions, setTokenList,
    setWalletAddress: storeSetAddr, setLastFetched } = useWalletStore()

  const [loading, setLoading] = useState(tokenList.length === 0)
  const [username, setUsername] = useState<string | null>(null)
  const [hasPIN, setHasPIN] = useState(false)
  const [accessToken, setAccessToken] = useState('')
  const [copiedCard, setCopiedCard] = useState<'main' | 'agent' | null>(null)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [showTxHistory, setShowTxHistory] = useState(false)
  const [activityTab, setActivityTab] = useState<'all' | 'tx' | 'agent'>('all')
  const [range, setRange] = useState<RangeKey>('7D')
  const [agentWallet, setAgentWallet] = useState<{
    balance: number       // USDC on-chain balance
    totalUsd: number      // full portfolio in USD
    address: string | null
    dailyLimit: number | null
    dailySpent: number | null
    gatewayReserved: number
    gatewayOnline: boolean
    tokenList: TokenBalance[]
    transactions: Transaction[]
  } | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // ── SRS Modal (Send / Receive / Swap) ─────────────────────────────────────────
  const [srsMode, setSrsMode] = useState<ModalMode>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/'); return }
      if (!(await isOnboardingComplete(session.user.id))) { router.replace('/'); return }
      if (!user) setUser(session.user)
      setAccessToken(session.access_token)

      const [walletRes, profileRes] = await Promise.all([
        fetch('/api/wallet', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        supabase.from('profiles').select('username, pin_hash').eq('id', session.user.id).single(),
      ])
      if (walletRes.ok) {
        const d = await walletRes.json()
        setWallet({ id: d.circleWalletId, balance: d.balance, currency: d.currency })
        setTransactions(mergeWithLocalTransactions((d.transactions ?? []) as Transaction[]))
        setTokenList(d.tokenList ?? [])
        storeSetAddr(d.walletAddress)
        setLastFetched(Date.now())
      }
      setUsername(profileRes.data?.username ?? null)
      setHasPIN(!!profileRes.data?.pin_hash)
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // ── Agent wallet fetch ────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyAgentData(d: any) {
    setAgentWallet({
      balance: d.balance ?? 0,        // USDC-only from on-chain
      totalUsd: d.total_usd ?? d.balance ?? 0,   // full portfolio value
      address: d.wallet_address ?? null,
      dailyLimit: d.daily_limit ?? null,
      dailySpent: d.daily_spent ?? null,
      gatewayReserved: d.gateway_reserved ?? 0,
      gatewayOnline: d.gateway_online ?? false,
      tokenList: d.tokenList ?? [],
      transactions: d.transactions ?? [],
    })
  }

  useEffect(() => {
    if (!accessToken) return
    fetch('/api/agent/wallet', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) applyAgentData(d) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  // ── Real-time refresh every 30s (both wallets) ────────────────────────────────
  async function refreshWallet(tok?: string) {
    const t = tok ?? accessToken
    if (!t) return
    setRefreshing(true)
    try {
      const [res, agentRes] = await Promise.all([
        fetch('/api/wallet', { headers: { Authorization: `Bearer ${t}` } }),
        fetch('/api/agent/wallet', { headers: { Authorization: `Bearer ${t}` } }),
      ])
      if (res.ok) {
        const d = await res.json()
        setWallet({ id: d.circleWalletId, balance: d.balance, currency: d.currency })
        setTransactions(mergeWithLocalTransactions((d.transactions ?? []) as Transaction[]))
        setTokenList(d.tokenList ?? [])
        storeSetAddr(d.walletAddress)
        setLastFetched(Date.now())
      }
      if (agentRes.ok) applyAgentData(await agentRes.json())
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!accessToken) return
    const id = setInterval(() => refreshWallet(), 30_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  async function copyCardAddr(addr: string, card: 'main' | 'agent') {
    await navigator.clipboard.writeText(addr)
    setCopiedCard(card)
    setTimeout(() => setCopiedCard(null), 2000)
  }

  // ── Computed ──────────────────────────────────────────────────────────────────
  const totalUsd = tokenList.reduce((s, t) => s + (t.usdValue ?? 0), 0)
  const mainBalance = totalUsd || (wallet?.balance ?? 0)
  const agentBalance = agentWallet?.totalUsd ?? 0
  const combinedBalance = mainBalance + agentBalance

  // Portfolio-wide USD-value history — reverse-derived from real transactions,
  // same technique already used on the dashboard (no stored balance-history table
  // exists anywhere in the app). Combines Main + Agent Wallet transactions now
  // that both are loaded on this page, so the headline delta and the chart both
  // genuinely represent the whole portfolio (not just Main Wallet).
  const priceBySymbol: Record<string, number> = {}
  ;[...tokenList, ...(agentWallet?.tokenList ?? [])].forEach(t => {
    const amt = parseFloat(t.amount)
    if (t.usdValue != null && amt > 0 && !priceBySymbol[t.symbol]) priceBySymbol[t.symbol] = t.usdValue / amt
  })
  function txUsd(t: Transaction) {
    if (t.tokenSymbol === 'USDC' || t.tokenSymbol === 'USDT') return t.amount
    return priceBySymbol[t.tokenSymbol] != null ? t.amount * priceBySymbol[t.tokenSymbol] : t.amount
  }
  // Failed transactions never actually moved funds, so they're excluded from
  // every USD delta/volume calc below (a real accuracy fix surfaced while
  // testing Part 8's status detection — failed txs were previously counted
  // as if they'd succeeded).
  const allTransactions = [...transactions, ...(agentWallet?.transactions ?? [])].filter(t => !isFailedTx(t))
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const mainDelta24h = allTransactions
    .filter(t => new Date(t.created_at) > cutoff24h)
    .reduce((s, t) => t.type === 'credit' ? s + txUsd(t) : s - txUsd(t), 0)
  const mainBalanceBefore24h = combinedBalance - mainDelta24h
  const mainDeltaPct = mainBalanceBefore24h !== 0 ? (mainDelta24h / Math.abs(mainBalanceBefore24h)) * 100 : 0
  const rangeBucket = range === 'All' ? RANGE_BUCKETS['7D'] : RANGE_BUCKETS[range]
  const chartPoints: ChartPoint[] = Array.from({ length: rangeBucket.count }, (_, i) => {
    const cutoff = new Date(Date.now() - (rangeBucket.count - 1 - i) * rangeBucket.stepMs)
    const futureNet = allTransactions
      .filter(t => new Date(t.created_at) > cutoff)
      .reduce((s, t) => t.type === 'credit' ? s + txUsd(t) : s - txUsd(t), 0)
    return { value: Math.max(0, combinedBalance - futureNet), date: cutoff }
  })
  const chartDateFormat: Intl.DateTimeFormatOptions = range === '24H'
    ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric' }

  // Part 1 — Portfolio Card: asset count, wallet count, allocation split.
  // PnL is intentionally NOT computed — there's no cost-basis (avg buy price)
  // data anywhere in this app, so a real PnL number doesn't exist yet.
  const totalAssetCount = new Set([...tokenList, ...(agentWallet?.tokenList ?? [])].map(t => t.symbol)).size
  const walletCount = 1 + (agentWallet?.address ? 1 : 0)
  const mainAllocPct = combinedBalance > 0 ? (mainBalance / combinedBalance) * 100 : 0
  const agentAllocPct = combinedBalance > 0 ? 100 - mainAllocPct : 0

  function priority(t: TokenBalance) {
    const hasValue = (t.usdValue ?? 0) > 0
    if (t.isVerified && hasValue) return 0
    if (!t.isVerified && hasValue) return 1
    if (t.isVerified && !hasValue) return 2
    return 3
  }
  const sortedTokenList = [...tokenList].sort((a, b) => {
    const pd = priority(a) - priority(b)
    return pd !== 0 ? pd : (b.usdValue ?? 0) - (a.usdValue ?? 0)
  })
  // Per-wallet analytics for the Main Wallet card
  const mainStats = computeWalletStats(tokenList, transactions)

  // Main Wallet card tiles (Part 2 of the redesign) — Balance/Address already
  // shown elsewhere on the card; these four fill in the rest: what's held, what's
  // in flight, when it last moved, and which chain it's on. Best/Worst removed
  // per spec (those are trading-dashboard concepts, not wallet concepts).
  const mainTiles: CardTile[] = [
    { label: 'Assets', value: `${mainStats.verifiedCount}/${mainStats.tokenCount} ✓` },
    { label: 'Pending', value: mainStats.pendingCount > 0 ? `${mainStats.pendingCount} tx` : 'None', color: mainStats.pendingCount > 0 ? '#f5b748' : 'var(--c-muted2)' },
    { label: 'Last Tx', value: mainStats.lastActivityAt ? timeAgo(mainStats.lastActivityAt) : '—' },
    { label: 'Network', value: 'ARC' },
  ]
  // Agent Wallet card (Part 3) — reframed as "AI activity" rather than a second
  // wallet. Current Capital = the big balance number (unchanged). Status stays
  // in its existing footer slot (real: Not configured / Needs funding / Auto-pilot).
  // Strategy and Running Tasks are REAL current facts about this app's
  // architecture, not placeholders: there is no autonomous trading/strategy
  // engine and no background task queue — the agent only acts synchronously
  // when the user sends a chat message. Gateway/Reserve (merged in from the
  // former standalone Gateway card — it was its own full-width column for just
  // 2 meaningful facts, wasteful; the reserve is conceptually the agent's own
  // x402 spending fund anyway) are real too: online/offline surfaces the same
  // try/catch the API already had around the gateway call, and Reserved is the
  // actual Circle Gateway escrow balance (see gateway_online/gateway_reserved
  // in /api/agent/wallet).
  const agentTiles: CardTile[] = [
    { label: 'Strategy', value: 'Manual' },
    { label: 'Tasks', value: 'Idle' },
    {
      label: 'X402',
      value: agentWallet?.gatewayOnline ? 'Online' : 'Offline',
      color: agentWallet?.gatewayOnline ? '#2dd4bf' : '#fb6f84',
    },
    { label: 'Reserve', value: `$${(agentWallet?.gatewayReserved ?? 0).toFixed(2)}` },
  ]

  // Activity grouping
  const nowDate = new Date()
  const todayStr = nowDate.toDateString()

  // Part 12 — Pending Transactions. Real data: any transaction whose state is
  // still in flight (see isPendingTx / PENDING_TX_STATES), across both
  // wallets, shown before the day-grouped history below.
  const pendingTxs = allTransactions.filter(isPendingTx).slice(0, 5)
  const ydayDate = new Date(nowDate); ydayDate.setDate(ydayDate.getDate() - 1)
  const ydayStr = ydayDate.toDateString()
  // "All / Tx / Agent" filter for the Recent Activity panel — Tx = Main
  // Wallet's own transactions, Agent = Agent Wallet's own transactions
  // (Dashboard's equivalent tabs split tx-vs-chat-message instead, since
  // this page has no chat feed to mix in).
  const agentTxList = agentWallet?.transactions ?? []
  const recentSlice =
    activityTab === 'agent' ? agentTxList :
    activityTab === 'tx' ? transactions :
    [...transactions, ...agentTxList].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const todayTxs = recentSlice.filter(t => new Date(t.created_at).toDateString() === todayStr)
  const ydayTxs  = recentSlice.filter(t => new Date(t.created_at).toDateString() === ydayStr)
  const olderTxs = recentSlice.filter(t => {
    const d = new Date(t.created_at).toDateString()
    return d !== todayStr && d !== ydayStr
  })

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-page)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #6366f1', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ fontSize: 14, color: 'var(--c-muted)' }}>Loading wallet...</p>
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: 'radial-gradient(900px 480px at 18% -8%,rgba(99,102,241,.16),transparent 60%),radial-gradient(700px 480px at 102% -4%,rgba(139,124,255,.09),transparent 56%),var(--c-page)',
      color: 'var(--c-text)',
    }}>

      {/* ── 2-col grid ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, padding: '24px 24px 24px', minHeight: 0, overflow: 'hidden' }}>

        {/* ── LEFT COLUMN ── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, overflowY: 'auto', paddingRight: 4 }}>

          {/* Actions — merged header buttons + Quick Actions into one row.
              "Deposit" was removed as a duplicate of "Receive" (both mean
              getting funds into the wallet). Everything styled like the
              original Send/Receive/Swap buttons; logic/flow unchanged —
              Bridge/Earn stay disabled with a real tooltip (not live
              features), Withdraw/Manage AI still route to /agent. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' as const }}>
            <button onClick={() => refreshWallet()} disabled={refreshing} title="Refresh" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: refreshing ? '#6366f1' : 'var(--c-muted)', cursor: refreshing ? 'default' : 'pointer' }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ animation: refreshing ? 'srsSpin 0.8s linear infinite' : 'none' }}>
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
            </button>
            <button onClick={() => setSrsMode('send')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', boxShadow: '0 8px 30px rgba(99,102,241,.42)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="m21 3-9.5 9.5" /><path d="M21 3 14 21l-3.5-7.5L3 10z" /></svg>
              Send
            </button>
            <button onClick={() => setSrsMode('receive')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v13" /><path d="m6 11 6 6 6-6" /></svg>
              Receive
            </button>
            <button onClick={() => setSrsMode('swap')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 21h12M7 3c0 4 3 5 5 7 2-2 5-3 5-7M7 21c0-4 3-5 5-7 2 2 5 3 5 7" /></svg>
              Swap
            </button>
            {[
              { label: 'Bridge', disabled: true, reason: 'Coming soon — cross-chain bridge isn’t live yet', icon: <path d="M3 21V10l9-6 9 6v11M7 21v-7h10v7" /> },
              { label: 'Earn', disabled: true, reason: 'Coming soon — yield features aren’t live yet', icon: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></> },
            ].map(a => (
              <button
                key={a.label}
                disabled={a.disabled}
                title={a.reason}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10,
                  border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)',
                  color: a.disabled ? 'var(--c-muted2)' : 'var(--c-text)', fontSize: 13, fontWeight: 600,
                  cursor: a.disabled ? 'not-allowed' : 'pointer', opacity: a.disabled ? 0.6 : 1,
                }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">{a.icon}</svg>
                {a.label}
              </button>
            ))}
          </div>

          {/* Portfolio hero + Wallet Cards — one row; hero spans as wide as the 3 cards combined */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr', gap: 14, alignItems: 'stretch' }}>
          <div style={{ position: 'relative', overflow: 'hidden', padding: 22, borderRadius: 16, background: 'linear-gradient(165deg,rgba(99,102,241,.10),transparent 56%),color-mix(in srgb, var(--c-panel) 55%, transparent)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(var(--c-fg-rgb),.10)', boxShadow: '0 8px 30px rgba(99,102,241,.42),inset 0 1px 0 rgba(var(--c-fg-rgb),.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--c-muted2)' }}>Total portfolio value</div>
              <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
                {RANGES.map(r => {
                  const active = r === range
                  const disabled = r === 'All'
                  return (
                    <span
                      key={r}
                      onClick={() => !disabled && setRange(r)}
                      title={disabled ? 'Coming soon — needs full transaction history since account creation' : undefined}
                      style={{
                        fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 9999,
                        color: disabled ? 'var(--c-muted2)' : active ? '#fff' : 'var(--c-muted)',
                        background: active ? '#6366f1' : 'transparent',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {r}
                    </span>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>${formatUSD(combinedBalance)}</span>
              {mainDelta24h !== 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: mainDelta24h >= 0 ? '#2dd4bf' : '#fb6f84' }}>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor">{mainDelta24h >= 0 ? <path d="M12 7l8 9H4z" /> : <path d="M12 20L4 4h16z" transform="rotate(180 12 12)" />}</svg>
                  {mainDelta24h >= 0 ? '+' : ''}{formatUSD(mainDelta24h)} ({mainDeltaPct.toFixed(2)}%)
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-muted2)', marginTop: 4 }}>
              {rangeBucket.label} trend · Main + Agent Wallet combined
            </div>
            <TrendChart points={chartPoints} dateFormat={chartDateFormat} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: 'var(--c-muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>Main</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>${formatUSD(mainBalance)}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: 'var(--c-muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>Agent</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>${formatUSD(agentBalance)}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: 'var(--c-muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>Assets</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{totalAssetCount}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: 'var(--c-muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>Wallets</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{walletCount}</div>
              </div>
            </div>

            {/* Allocation — Main vs Agent Wallet share of combined balance */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--c-muted2)' }}>
                <span>Allocation</span>
                <span>
                  <span style={{ color: '#6366f1', fontWeight: 600 }}>Main {mainAllocPct.toFixed(0)}%</span>
                  {' · '}
                  <span style={{ color: '#8b7cff', fontWeight: 600 }}>Agent {agentAllocPct.toFixed(0)}%</span>
                </span>
              </div>
              <div style={{ display: 'flex', height: 6, borderRadius: 9999, overflow: 'hidden', marginTop: 6, background: 'rgba(var(--c-fg-rgb),.07)' }}>
                <div style={{ width: `${mainAllocPct}%`, background: '#6366f1' }} />
                <div style={{ width: `${agentAllocPct}%`, background: '#8b7cff' }} />
              </div>
            </div>

            {/* TODO: real PnL requires cost-basis (avg buy price) tracking — not
                available from Circle wallet data yet, so it's a placeholder. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 10.5, color: 'var(--c-muted2)' }}>
              <span>PnL (all-time)</span>
              <span>Coming soon</span>
            </div>
          </div>
            <WalletCard
              variant="blue" label="Main Wallet"
              balance={mainBalance}
              symbol={tokenList.length === 1 ? (tokenList[0]?.symbol ?? 'USD') : 'Total USD'}
              address={walletAddress} status="Primary · ARC"
              onCopy={() => walletAddress && copyCardAddr(walletAddress, 'main')}
              copied={copiedCard === 'main'}
              tiles={mainTiles}
            />
            <WalletCard
              variant="purple" label="Agent AI"
              balance={agentWallet?.totalUsd ?? 0}
              symbol={agentWallet?.totalUsd === agentWallet?.balance ? 'USDC' : 'Total USD'}
              address={agentWallet?.address ?? null}
              status={
                !agentWallet?.address ? 'Not configured' :
                (agentWallet.totalUsd ?? 0) === 0 ? 'Needs funding' :
                agentWallet.dailyLimit ? `Auto-pilot on · $${agentWallet.dailyLimit}/day` :
                'Auto-pilot on'
              }
              locked={!agentWallet?.address}
              onCopy={() => agentWallet?.address && copyCardAddr(agentWallet.address, 'agent')}
              copied={copiedCard === 'agent'}
              tiles={agentTiles}
            />
          </div>

          {/* Holdings — fills remaining left-column space, fixed frame with its own internal scroll */}
          <div style={{ borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>Holdings</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--c-muted)', background: 'rgba(var(--c-fg-rgb),.05)', padding: '2px 9px', borderRadius: 9999 }}>{tokenList.length} assets</span>
              </div>
            </div>
            {sortedTokenList.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '32px 0', color: 'var(--c-muted2)', fontSize: 14 }}>No assets yet</p>
            ) : (
              <>
                {/* Header row — Token/Balance/USD Value/24H/Allocation, scales to as
                    many assets as the wallet ends up holding. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) 1fr 1fr 0.7fr 0.7fr', gap: 8, padding: '0 18px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' as const, color: 'var(--c-muted2)', flexShrink: 0 }}>
                  <span>Token</span>
                  <span style={{ textAlign: 'right' }}>Balance</span>
                  <span style={{ textAlign: 'right' }}>USD Value</span>
                  <span style={{ textAlign: 'right' }}>24H</span>
                  <span style={{ textAlign: 'right' }}>Alloc.</span>
                </div>
                <div className="scrollbar-hide" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  {sortedTokenList.map((token) => {
                    const allocPct = totalUsd > 0 ? ((token.usdValue ?? 0) / totalUsd) * 100 : 0
                    return (
                      <div key={token.symbol}
                        style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) 1fr 1fr 0.7fr 0.7fr', gap: 8, alignItems: 'center', padding: '11px 18px', borderTop: '1px solid rgba(var(--c-fg-rgb),.06)', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--c-fg-rgb),.03)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <TokenLogo symbol={token.symbol} logoUrl={token.logoUrl} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{token.symbol}</span>
                            {token.isVerified && <VerifiedBadge />}
                          </div>
                        </div>
                        <span style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                          {parseFloat(parseFloat(token.amount).toFixed(4))}
                        </span>
                        <span style={{ textAlign: 'right', fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>
                          {token.usdValue !== null ? `$${formatUSD(token.usdValue)}` : '—'}
                        </span>
                        <span style={{ textAlign: 'right', fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: token.change24hPct == null ? 'var(--c-muted2)' : token.change24hPct >= 0 ? '#2dd4bf' : '#fb6f84' }}>
                          {token.change24hPct != null ? `${token.change24hPct >= 0 ? '+' : ''}${token.change24hPct}%` : '0.0%'}
                        </span>
                        <span style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {allocPct.toFixed(0)}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── RIGHT RAIL ── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, overflowY: 'auto', paddingRight: 4 }}>

          {/* Recent Activity — fills the whole right column, fixed-height frame with its own internal scroll */}
          <div style={{ padding: 18, borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--c-muted2)' }}>Recent activity</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {(['all', 'tx', 'agent'] as const).map(k => (
                  <button key={k} onClick={() => setActivityTab(k)} className="mp-btn-ghost" style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 9999, border: 'none', cursor: 'pointer', background: activityTab === k ? '#6366f1' : 'transparent', color: activityTab === k ? '#fff' : 'var(--c-muted)' }}>
                    {k === 'all' ? 'All' : k === 'tx' ? 'Wallet' : 'Agent'}
                  </button>
                ))}
              </div>
            </div>

            <div className="scrollbar-hide" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {/* Pending Transactions (Part 12) — shown before history, only
                  when something is actually in flight. */}
              {pendingTxs.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--c-warning)', padding: '8px 0 4px' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--c-warning)' }} />
                    PENDING · {pendingTxs.length}
                  </div>
                  {pendingTxs.map(tx => <ActivityRow key={`pending-${tx.id}`} tx={tx} onClick={() => setSelectedTx(tx)} />)}
                </>
              )}

              {recentSlice.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '24px 0', color: 'var(--c-muted2)', fontSize: 13 }}>No transactions yet</p>
              ) : (
                [...todayTxs, ...ydayTxs, ...olderTxs].map(tx => <ActivityRow key={tx.id} tx={tx} onClick={() => setSelectedTx(tx)} />)
              )}
            </div>
          </div>

        </aside>
      </div>

      {/* ── Modals ── */}
      {selectedTx && <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />}
      {showTxHistory && <TransactionHistoryModal transactions={transactions} onClose={() => setShowTxHistory(false)} />}

      <SRSModal
        mode={srsMode}
        onClose={() => setSrsMode(null)}
        accessToken={accessToken}
        tokenList={tokenList}
        walletAddress={walletAddress}
        username={username}
        hasPIN={hasPIN}
        onPINSet={() => setHasPIN(true)}
        onSuccess={() => {
          fetch('/api/wallet', { headers: { Authorization: `Bearer ${accessToken}` } })
            .then(r => r.json())
            .then(d => {
              setWallet({ id: d.circleWalletId, balance: d.balance, currency: d.currency })
              setTransactions(mergeWithLocalTransactions((d.transactions ?? []) as Transaction[]))
              setTokenList(d.tokenList ?? [])
              storeSetAddr(d.walletAddress)
            })
            .catch(() => {})
        }}
      />
    </div>
  )
}
