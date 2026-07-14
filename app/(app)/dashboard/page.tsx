'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { isOnboardingComplete } from '@/app/lib/onboarding'
import { useAuthStore } from '@/app/store/auth'
import { useWalletStore } from '@/app/store/wallet'
import type { Transaction, TokenBalance } from '@/app/lib/types'
import TransactionHistoryModal from '@/app/components/TransactionHistoryModal'
import TransactionDetailModal from '@/app/components/TransactionDetailModal'
import { mergeWithLocalTransactions } from '@/app/lib/local-tx'
import SRSModal, { type ModalMode } from '@/app/components/SRSModal'
import VerifiedBadge from '@/app/components/VerifiedBadge'
import AgentAvatar from '@/app/components/AgentAvatar'
import { TokenPriceChart } from '@/app/components/TokenPriceChart'
import { SentimentMeter } from '@/app/components/SentimentMeter'
import { TrendingTable } from '@/app/components/TrendingTable'
import { DefiDataCard } from '@/app/components/DefiDataCard'
import { StablecoinDataCard } from '@/app/components/StablecoinDataCard'
import { WalletLookupCard } from '@/app/components/WalletLookupCard'
import { TypewriterText } from '@/app/components/TypewriterText'
import { AgentPinModal } from '@/app/components/AgentPinModal'
import { fmtUsd } from '@/app/lib/launchpad-data'

// ── Constants ─────────────────────────────────────────────────────────────────
const STALE_MS = 30_000

// ── Types ─────────────────────────────────────────────────────────────────────
interface AgentWalletData {
  balance: number
  total_usd: number
  daily_spent: number
  daily_limit: number
  msg_cost: number
  wallet_address: string | null
  gateway_reserved?: number
  tokenList?: TokenBalance[]
}

interface LiveIdo {
  id: string; name: string; sym: string; mark: string; accent: string
  raised: number; target: number; price: number; minContribution: number
}

interface TxResult {
  success: boolean
  type: 'send' | 'swap' | 'gateway_deposit' | 'gateway_withdraw' | 'launchpad_contribute'
  amountIn?: string
  tokenIn?: string
  amountOut?: string
  tokenOut?: string
  to?: string
  projectId?: string
  sym?: string
  tokensEstimate?: string
  txHash?: string
  txId?: string
  error?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  cost?: number
  inputFeeTxHash?: string | null
  time: string
  created_at: string
  txResult?: TxResult
  dataFee?: { amount: number; txHash: string | null } | null
  chart?: { symbol: string; points: Array<[number, number]> } | null
  trending?: { coins: Array<{ symbol: string; name: string; market_cap_rank: number | null; price_usd: number | null; change_24h_pct: number | null }> } | null
  defi?:
    | { mode: 'protocol'; name: string; category: string | null; chains: string[]; tvl_usd: number | null; change_1d_pct: number | null; change_7d_pct: number | null }
    | { mode: 'top_yield'; pools: Array<{ project: string; symbol: string; chain: string; apy_pct: number; tvl_usd: number }> }
    | { mode: 'protocol_yield'; protocol: string; pools: Array<{ symbol: string; chain: string; apy_pct: number; tvl_usd: number }> }
    | null
  sentiment?: { value: number; classification: string } | null
  stablecoin?:
    | { mode: 'top'; coins: Array<{ symbol: string; name: string; price_usd: number; peg_type: string; market_cap_usd: number }> }
    | { mode: 'single'; coin: { symbol: string; name: string; price_usd: number; peg_type: string; market_cap_usd: number } }
    | null
  walletLookup?: {
    address: string
    chains: Array<{ blockchain: string; total_usd: number; tokens: Array<{ symbol: string; name: string; amount: number; usd_value: number; rank: number | null }> }>
    total_usd: number
  } | null
  animate?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatUSD(n: number) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function truncateAddr(a: string) { return `${a.slice(0, 6)}...${a.slice(-4)}` }

// ── Wallet sparkline (with gradient fill, used for wallet cards) ──────────────
function SparklineChart({ values, color, id }: { values: number[]; color: string; id: string }) {
  const w = 100, h = 50
  const data = values.length >= 2 ? values : [0, 0]
  const max = Math.max(...data)
  const min = Math.min(...data)
  // If flat (balance unchanged): draw a horizontal line at 60% height
  const range = max - min
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = range === 0
      ? h * 0.4                                           // flat → centered
      : h - ((v - min) / range) * (h * 0.75) - h * 0.1  // has variation
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const fillPts = `0,${h} ${pts} ${w},${h}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Mini line chart ───────────────────────────────────────────────────────────
function MiniLineChart({ values, color = '#22c55e' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const w = 120, h = 40
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  )
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Send', sub: 'Send USDC to anyone', href: 'modal:send', accent: 'var(--mpm-text)', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M7 17L17 7M17 7H9M17 7v8" /></svg> },
  { label: 'Receive', sub: 'Receive USDC from anyone', href: 'modal:receive', accent: 'var(--mpm-success)', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M17 7L7 17M7 17h8M7 17V9" /></svg> },
  { label: 'Swap', sub: 'Exchange tokens instantly', href: 'modal:swap', accent: 'var(--mpm-blue-accent)', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M7 4v12M7 16l-3-3M7 16l3-3" /><path d="M17 20V8M17 8l-3 3M17 8l3 3" /></svg> },
  { label: 'Scan QR', sub: 'Scan & Pay — coming soon', href: '#', disabled: true, accent: 'var(--mpm-purple-accent)', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M14 21h3M21 14v3M21 21v.01" /></svg> },
]

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()
  const { user, setUser } = useAuthStore()
  const {
    wallet, transactions, tokenList,
    walletAddress: storedAddress, lastFetched,
    setWallet, setTransactions, setTokenList,
    setWalletAddress: storeSetWalletAddress, setLastFetched,
  } = useWalletStore()

  const hasCache = tokenList.length > 0
  const [loading, setLoading] = useState(!hasCache)
  const [walletAddress, setWalletAddress] = useState<string | null>(storedAddress)
  const [username, setUsername] = useState<string | null>(null)
  const [hasPIN, setHasPIN] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'tx' | 'agent'>('all')
  const [mobileIsDark, setMobileIsDark] = useState(true)
  useEffect(() => { setMobileIsDark(localStorage.getItem('theme') !== 'light') }, [])
  function toggleMobileTheme() {
    const newDark = !mobileIsDark
    setMobileIsDark(newDark)
    localStorage.setItem('theme', newDark ? 'dark' : 'light')
    document.documentElement.classList.toggle('light', !newDark)
  }

  // Agent on-chain identity
  const [agentIdentity, setAgentIdentity] = useState<{ agent_id: number; tx_hash: string } | null>(null)
  const [arcRank, setArcRank] = useState<number | null>(null)
  useEffect(() => {
    if (!agentIdentity?.agent_id) return
    fetch(`/api/agent/leaderboard-public?agentId=${agentIdentity.agent_id}`)
      .then(r => r.json())
      .then(d => setArcRank(d.rank ?? null))
      .catch(() => setArcRank(null))
  }, [agentIdentity?.agent_id])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Agent + chat
  const [accessToken, setAccessToken] = useState('')
  const [agentWallet, setAgentWallet] = useState<AgentWalletData | null>(null)
  const [liveIdo, setLiveIdo] = useState<LiveIdo | null>(null)
  const [idoAmount, setIdoAmount] = useState(100)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  useEffect(() => {
    const prefill = sessionStorage.getItem('mp_agent_prefill')
    if (prefill) {
      sessionStorage.removeItem('mp_agent_prefill')
      setInput(prefill)
    }
  }, [])
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const [chatError, setChatError] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingMainAction, setPendingMainAction] = useState<{ action: any; token: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // SRS Modal (Send / Receive / Swap)
  const [srsMode, setSrsMode] = useState<ModalMode>(null)

  // Agent wallet modals
  const [showFund, setShowFund] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [showLimit, setShowLimit] = useState(false)
  const [showAgentInfo, setShowAgentInfo] = useState(false)
  const [agentExcited, setAgentExcited] = useState(false)
  const [reputation, setReputation] = useState<{ totalFeedback: number; totalScore: number; byTag: Record<string, { count: number; score: number }> } | null>(null)
  const [reputationChecked, setReputationChecked] = useState(false)
  const [agentStats, setAgentStats] = useState<{ replyCount: number; txSuccessCount: number } | null>(null)
  const [modalAmount, setModalAmount] = useState('')
  const [modalLimit, setModalLimit] = useState('')
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')
  const [limitPhase, setLimitPhase] = useState<'form' | 'pending' | 'success' | 'error'>('form')
  const [limitResult, setLimitResult] = useState<{ daily_limit: number; onChain: boolean; txHash?: string | null; error?: string } | null>(null)
  const [fundPhase, setFundPhase] = useState<'form' | 'pending' | 'success' | 'error'>('form')
  const [fundResult, setFundResult] = useState<{ amount: number; transactionId?: string; error?: string } | null>(null)
  const [agentFunded24h, setAgentFunded24h] = useState(0)
  const [withdrawPhase, setWithdrawPhase] = useState<'form' | 'pending' | 'success' | 'error'>('form')
  const [withdrawResult, setWithdrawResult] = useState<{ amount: number; transactionId?: string; error?: string } | null>(null)
  const [withdrawToken, setWithdrawToken] = useState('USDC')

  useEffect(() => {
    if (!showAgentInfo || !accessToken || reputationChecked) return
    fetch('/api/agent/reputation', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.json())
      .then(d => { if (d.registered && !d.error) setReputation(d) })
      .finally(() => setReputationChecked(true))
  }, [showAgentInfo, accessToken, reputationChecked])
  const [withdrawTokenStep, setWithdrawTokenStep] = useState<'form' | 'token'>('form')

  async function handleFund() {
    const amt = parseFloat(modalAmount)
    if (isNaN(amt) || amt < 0.01) { setModalError('Minimum 0.01 USDC'); return }
    setFundPhase('pending'); setModalError('')
    try {
      const res = await fetch('/api/agent/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ amount: amt }),
      })
      const d = await res.json()
      if (!res.ok) {
        setFundResult({ amount: amt, error: d.error ?? 'Deposit failed' })
        setFundPhase('error'); return
      }
      const deposited = d.deposited ?? amt
      setFundResult({ amount: deposited, transactionId: d.transactionId })
      setAgentFunded24h(prev => prev + deposited)
      setFundPhase('success')
      setTimeout(() => refreshAgentWallet(accessToken), 3000)
    } catch (e) {
      setFundResult({ amount: amt, error: e instanceof Error ? e.message : 'Connection error' })
      setFundPhase('error')
    }
  }

  function closeFundModal() {
    setShowFund(false); setModalAmount(''); setModalError('')
    setFundPhase('form'); setFundResult(null)
  }

  async function handleWithdraw() {
    const amt = parseFloat(modalAmount)
    if (isNaN(amt) || amt < 0.01) { setModalError('Minimum 0.01 USDC'); return }
    setWithdrawPhase('pending'); setModalError('')
    try {
      const res = await fetch('/api/agent/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ amount: amt, token: withdrawToken }),
      })
      const d = await res.json()
      if (!res.ok) {
        setWithdrawResult({ amount: amt, error: d.error ?? 'Withdrawal failed' })
        setWithdrawPhase('error'); return
      }
      setWithdrawResult({ amount: d.withdrawn ?? amt, transactionId: d.transactionId })
      setWithdrawPhase('success')
      setTimeout(() => { refreshAgentWallet(accessToken); refreshMainWallet(accessToken) }, 3000)
    } catch (e) {
      setWithdrawResult({ amount: amt, error: e instanceof Error ? e.message : 'Connection error' })
      setWithdrawPhase('error')
    }
  }

  function closeWithdrawModal() {
    setShowWithdraw(false); setModalAmount(''); setModalError('')
    setWithdrawPhase('form'); setWithdrawResult(null)
    setWithdrawToken('USDC'); setWithdrawTokenStep('form')
  }

  async function handleSetLimit() {
    const lmt = parseFloat(modalLimit)
    if (isNaN(lmt) || lmt < 0.01) { setModalError('Minimum 0.01 USDC'); return }
    setLimitPhase('pending'); setModalError('')
    try {
      const res = await fetch('/api/agent/wallet/limit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ daily_limit: lmt }),
      })
      const d = await res.json()
      if (!res.ok) {
        setLimitResult({ daily_limit: lmt, onChain: false, error: d.error ?? 'Update failed' })
        setLimitPhase('error')
        return
      }
      setAgentWallet(prev => prev ? { ...prev, daily_limit: lmt } : prev)
      setLimitResult({ daily_limit: d.daily_limit, onChain: d.onChain, txHash: d.txHash })
      setLimitPhase('success')
    } catch (e) {
      setLimitResult({ daily_limit: lmt, onChain: false, error: e instanceof Error ? e.message : 'Connection error' })
      setLimitPhase('error')
    }
  }

  function closeLimitModal() {
    setShowLimit(false)
    setModalLimit('')
    setModalError('')
    setLimitPhase('form')
    setLimitResult(null)
  }

  // ── Helper: refresh main wallet from Circle ──────────────────────────────────
  async function refreshMainWallet(token: string) {
    const res = await fetch('/api/wallet', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const d = await res.json()
    setWallet({ id: d.circleWalletId, balance: d.balance, currency: d.currency })
    setTransactions(mergeWithLocalTransactions((d.transactions ?? []) as Transaction[]))
    setTokenList(d.tokenList ?? [])
    storeSetWalletAddress(d.walletAddress)
    setWalletAddress(d.walletAddress)
    setLastFetched(Date.now())
  }

  // ── Helper: refresh agent wallet ────────────────────────────────────────────
  async function refreshAgentWallet(token: string) {
    const res = await fetch('/api/agent/wallet', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setAgentWallet(await res.json())
  }

  async function refreshAgentStats(token: string) {
    const res = await fetch('/api/agent/stats', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setAgentStats(await res.json())
  }

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/'); return }
      if (!(await isOnboardingComplete(session.user.id))) { router.replace('/'); return }
      if (!user) setUser(session.user)
      setAccessToken(session.access_token)

      const now = Date.now()
      if (hasCache && lastFetched && now - lastFetched < STALE_MS) {
        const { data: p } = await supabase.from('profiles').select('username, pin_hash').eq('id', session.user.id).single()
        setUsername(p?.username ?? null); setHasPIN(!!p?.pin_hash)
        setLoading(false)
      } else {
        const [profileRes] = await Promise.all([
          supabase.from('profiles').select('username, pin_hash').eq('id', session.user.id).single(),
          refreshMainWallet(session.access_token),
        ])
        setUsername(profileRes.data?.username ?? null)
        setHasPIN(!!profileRes.data?.pin_hash)
        setLoading(false)
      }

      // Load agent on-chain identity
      supabase.from('miron_agent_identity').select('agent_id, tx_hash').single()
        .then(({ data }) => { if (data) setAgentIdentity(data) })

      // Load the featured live Launchpad sale, if any (real on-chain data)
      fetch('/api/launchpad/sales')
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const live = (d?.projects as any[])?.find(p => p.status === 'live')
          if (live) setLiveIdo({ id: live.id, name: live.name, sym: live.sym, mark: live.mark, accent: live.accent, raised: live.raised, target: live.target, price: live.price ?? 0, minContribution: live.minContribution ?? 1 })
        })
        .catch(() => {})

      const [msgRes] = await Promise.all([
        supabase.from('agent_messages').select('id, role, content, cost, input_fee_tx_hash, created_at, data_fee_amount, data_fee_tx_hash, chart_symbol, chart_points, trending_data, defi_data, sentiment_data, stablecoin_data, wallet_lookup_data')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }).limit(100), // load the 100 most recent, then reverse to display
        refreshAgentWallet(session.access_token),
        refreshAgentStats(session.access_token),
      ])
      if (msgRes.data) {
        // Reverse to display in the correct order (oldest → newest)
        setMessages([...msgRes.data].reverse().map(m => {
          // Parse JSON txResult if present
          let txResult: TxResult | undefined
          try {
            const parsed = JSON.parse(m.content)
            if (parsed.__txResult) txResult = parsed
          } catch { /* plain text */ }
          return {
            id: m.id, role: m.role as 'user' | 'assistant',
            content: m.content, cost: m.cost,
            inputFeeTxHash: m.input_fee_tx_hash,
            time: new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            created_at: m.created_at,
            txResult,
            dataFee: m.data_fee_amount != null ? { amount: m.data_fee_amount, txHash: m.data_fee_tx_hash } : null,
            chart: m.chart_symbol && m.chart_points ? { symbol: m.chart_symbol, points: m.chart_points } : null,
            trending: m.trending_data ?? null,
            defi: m.defi_data ?? null,
            sentiment: m.sentiment_data ?? null,
            stablecoin: m.stablecoin_data ?? null,
            walletLookup: m.wallet_lookup_data ?? null,
          }
        }))
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // ── Polling: Main Wallet every 30s ───────────────────────────────────────────
  useEffect(() => {
    if (!accessToken) return
    const id = setInterval(() => refreshMainWallet(accessToken), 10_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  // ── Supabase Realtime: agent_wallets (balance updates instantly during chat) ─
  useEffect(() => {
    if (!user) return
    const ch = supabase.channel('rt-agent-wallet')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'agent_wallets',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.new) setAgentWallet(prev => prev ? { ...prev, ...(payload.new as AgentWalletData) } : payload.new as AgentWalletData)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user])

  // ── Auto-refresh access token khi Supabase renew session ──────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token) {
        setAccessToken(session.access_token)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Supabase Realtime: agent_messages (new messages) ───────────────────────
  useEffect(() => {
    if (!user) return
    const ch = supabase.channel('rt-agent-messages')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'agent_messages',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        if (!payload.new) return
        const m = payload.new as { id: string; role: string; content: string; cost: number; created_at: string }
        setMessages(prev => {
          if (prev.some(x => x.id === m.id)) return prev // dedup against a previous delivery of this same row
          const incoming = {
            id: m.id, role: m.role as 'user' | 'assistant',
            content: m.content, cost: m.cost,
            time: new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            created_at: m.created_at,
          }
          // The tab that sent this message may already have appended a local
          // copy under a temp id before this DB row existed — reconcile onto
          // that placeholder instead of adding a duplicate bubble.
          const placeholderIdx = prev.findIndex(x =>
            (x.id.startsWith('tmp_') || x.id.startsWith('a_')) && x.role === m.role && x.content === m.content)
          if (placeholderIdx !== -1) {
            const next = prev.slice()
            next[placeholderIdx] = { ...next[placeholderIdx], ...incoming }
            return next
          }
          return [...prev, incoming]
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function runExecuteAction(action: any, token: string, pin?: string) {
    const execRes = await fetch('/api/agent/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...(pin ? { pin } : {}) }),
    })
    const execData = await execRes.json()
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    const nowISO = new Date().toISOString()

    const txResult: TxResult = !execRes.ok ? {
      success: false,
      type: action.type,
      amountIn: action.amount,
      tokenIn: action.tokenIn ?? action.token ?? 'USDC',
      tokenOut: action.tokenOut,
      to: action.to,
      projectId: action.projectId,
      sym: action.sym,
      tokensEstimate: action.tokensEstimate,
      error: execData.error ?? 'Unknown error',
    } : {
      success: true,
      type: action.type,
      amountIn: action.amount,
      tokenIn: action.tokenIn ?? action.token ?? 'USDC',
      amountOut: execData.amountOut,
      tokenOut: action.tokenOut,
      to: action.to,
      projectId: action.projectId,
      sym: action.sym,
      tokensEstimate: action.tokensEstimate,
      txHash: execData.txHash,
      txId: execData.txId,
    }

    // Save to Supabase so it's still there after an F5
    const txContent = JSON.stringify({ __txResult: true, ...txResult })
    const { data: inserted } = await supabase.from('agent_messages').insert({
      user_id: user?.id,
      role: 'assistant',
      content: txContent,
      cost: 0,
    }).select('id').single()

    setMessages(prev => [...prev, {
      id: inserted?.id ?? `exec_${Date.now()}`,
      role: 'assistant',
      content: txContent,
      txResult,
      time: now, created_at: nowISO,
    }])

    if (txResult.success) setTimeout(() => refreshAgentWallet(token), 3000)
  }

  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if (!text || sending || sendingRef.current) return
    sendingRef.current = true
    setInput(''); setChatError(''); setSending(true)

    // Always fetch the freshest token to avoid it being expired
    const { data: { session: freshSession } } = await supabase.auth.getSession()
    if (!freshSession) { setChatError('Session expired. Please log in again.'); setSending(false); sendingRef.current = false; return }
    const token = freshSession.access_token
    setAccessToken(token)
    const userMsg: ChatMessage = {
      id: `tmp_${Date.now()}`, role: 'user', content: text,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    try {
      const walletContext = tokenList.length > 0
        ? `Balance: ${tokenList.map(t => `${parseFloat(parseFloat(t.amount).toFixed(4))} ${t.symbol}`).join(', ')}`
        : ''
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, walletContext }),
      })
      const data = await res.json()
      if (!res.ok) { setChatError(data.message ?? data.error ?? 'Connection error'); setSending(false); sendingRef.current = false; return }

      // Show the agent's reply
      const agentMsgId = `a_${Date.now()}`
      setMessages(prev => {
        const withUserCost = prev.map(m => m.id === userMsg.id ? { ...m, cost: data.cost, inputFeeTxHash: data.input_fee_tx_hash ?? null } : m)
        // The realtime subscription (rt-agent-messages) can win the race and
        // append this exact assistant row (real DB id, inserted server-side
        // in /api/agent/chat) before this fetch's own continuation runs —
        // don't add a second copy under a local a_ id.
        const alreadyArrivedViaRealtime = withUserCost.some(m =>
          !m.id.startsWith('tmp_') && !m.id.startsWith('a_') && m.role === 'assistant' && m.content === data.reply)
        if (alreadyArrivedViaRealtime) return withUserCost
        return [
          ...withUserCost,
          {
            id: agentMsgId, role: 'assistant' as const, content: data.reply,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            created_at: new Date().toISOString(),
            dataFee: data.data_fee ?? null,
            chart: data.token_chart ?? null,
            trending: data.trending_data ?? null,
            defi: data.defi_data ?? null,
            sentiment: data.sentiment_data ?? null,
            stablecoin: data.stablecoin_data ?? null,
            walletLookup: data.wallet_lookup_data ?? null,
            animate: true,
          },
        ]
      })
      if (agentWallet) setAgentWallet(prev => prev ? { ...prev, balance: data.balance_after, daily_spent: prev.daily_spent + (data.cost ?? 0) } : prev)

      // If there's an action → execute it and show the full result. Main Wallet actions
      // need a PIN first — the server enforces it, so ask before calling execute
      // rather than letting it fail with "PIN required".
      if (data.action) {
        if (data.action.walletSource === 'main') {
          setPendingMainAction({ action: data.action, token })
        } else {
          await runExecuteAction(data.action, token)
        }
      }
    } catch { setChatError('Connection error. Please try again.') }
    finally { setSending(false); sendingRef.current = false }
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const firstName = user?.user_metadata?.full_name?.split(' ').pop() ?? user?.email?.split('@')[0] ?? 'there'
  const totalUsd = tokenList.reduce((s, t) => s + (t.usdValue ?? 0), 0)
  const mainBalance = tokenList.find(t => t.symbol === 'USDC')?.usdValue ?? totalUsd ?? (wallet?.balance ?? 0)
  const agentBalance = agentWallet?.balance ?? 0
  const agentTotalUsd = agentWallet?.total_usd ?? agentBalance
  const msgCost = agentWallet?.msg_cost ?? 0.005
  const spentPct = agentWallet ? Math.min(100, (agentWallet.daily_spent / agentWallet.daily_limit) * 100) : 0

  // Most recent successful swap/send — powers the personalized suggestion
  // chips below the chat instead of a hardcoded "Swap USDC → EURC".
  const lastSwap = [...messages].reverse().find(m => m.txResult?.success && m.txResult.type === 'swap')?.txResult
  const lastSend = [...messages].reverse().find(m => m.txResult?.success && m.txResult.type === 'send')?.txResult

  const todayStr = new Date().toDateString()
  const todayTxs = transactions.filter(t => new Date(t.created_at).toDateString() === todayStr)
  const todayMsgs = messages.filter(m => new Date(m.created_at).toDateString() === todayStr)
  const todayVol = todayTxs.reduce((s, t) => s + t.amount, 0)

  // tx.amount is the raw token quantity (e.g. 0.01 ETH), not USD — convert using
  // each token's current price (from tokenList) before summing; USDC/USDT are treated as pegged 1:1.
  const priceBySymbol: Record<string, number> = {}
  tokenList.forEach(t => {
    const amt = parseFloat(t.amount)
    if (t.usdValue != null && amt > 0) priceBySymbol[t.symbol] = t.usdValue / amt
  })
  function txUsd(t: Transaction) {
    if (t.tokenSymbol === 'USDC' || t.tokenSymbol === 'USDT') return t.amount
    return priceBySymbol[t.tokenSymbol] != null ? t.amount * priceBySymbol[t.tokenSymbol] : t.amount
  }

  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000)
  const mainDelta24h = transactions
    .filter(t => new Date(t.created_at) > cutoff24h)
    .reduce((s, t) => t.type === 'credit' ? s + txUsd(t) : s - txUsd(t), 0)
  const mainBalanceBefore24h = totalUsd - mainDelta24h
  const mainDeltaPct = mainBalanceBefore24h !== 0 ? (mainDelta24h / Math.abs(mainBalanceBefore24h)) * 100 : 0

  const agentDelta24h = agentFunded24h - (agentWallet?.daily_spent ?? 0)
  const agentBalanceBefore24h = agentTotalUsd - agentDelta24h
  const agentDeltaPct = agentBalanceBefore24h !== 0 ? (agentDelta24h / Math.abs(agentBalanceBefore24h)) * 100 : 0


  // Main wallet: 7-day balance history (computed backwards from the current balance — uses
  // totalUsd to match the $ figure shown on the card, not mainBalance which is USDC-only)
  const chartValues: number[] = Array.from({ length: 7 }, (_, i) => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - (6 - i))
    cutoff.setHours(23, 59, 59, 999)
    const futureNet = transactions
      .filter(t => new Date(t.created_at) > cutoff)
      .reduce((s: number, t) => t.type === 'credit' ? s + txUsd(t) : s - txUsd(t), 0 as number)
    return Math.max(0, totalUsd - futureNet)
  })

  // Combined recent activity
  const agentMsgs = messages.filter(m => m.role === 'assistant' && (m.cost ?? 0) > 0)
  // Exact full-history counts come from /api/agent/stats — messages only keeps the last 100, so this is a temporary fallback until stats load
  const agentTxSuccessCount = agentStats?.txSuccessCount ?? messages.filter(m => m.txResult?.success).length
  const agentReplyCount = agentStats?.replyCount ?? messages.filter(m => m.role === 'assistant').length
  const recentActivity = [
    ...transactions.slice(0, 8).map(t => ({ kind: 'tx' as const, tx: t, id: t.id, date: t.created_at })),
    ...agentMsgs.slice(-4).map(m => ({ kind: 'agent' as const, msg: m, id: m.id, date: m.created_at })),
    ...messages.filter(m => m.role === 'user').slice(-3).map(m => ({ kind: 'msg' as const, msg: m, id: m.id, date: m.created_at })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10)

  const filteredActivity = activeTab === 'tx'
    ? recentActivity.filter(a => a.kind === 'tx')
    : activeTab === 'agent'
    ? recentActivity.filter(a => a.kind === 'agent' || a.kind === 'msg')
    : recentActivity

  // Agent wallet: 7-day balance history (computed backwards from the current balance)
  const agentChartValues: number[] = Array.from({ length: 7 }, (_, i) => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - (6 - i))
    cutoff.setHours(23, 59, 59, 999)
    const futureCosts = messages
      .filter(m => m.role === 'assistant' && new Date(m.created_at) > cutoff)
      .reduce((s: number, m) => s + (m.cost ?? 0), 0 as number)
    return Math.max(0, agentBalance + futureCosts)
  })

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
  const userInitial = (user?.user_metadata?.full_name ?? user?.email ?? 'U').slice(0, 1).toUpperCase()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--c-page)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#6d4ff0', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--c-muted)' }}>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ══════════════════════ MOBILE ══════════════════════ */}
      <div className="lg:hidden min-h-screen flex flex-col" style={{ background: 'var(--mpm-page)' }}>
        <div className="px-[18px] pb-1 flex items-center justify-between" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 24px)' }}>
          <div className="flex items-center gap-[11px]">
            <span className="p-[2px] rounded-full inline-flex shrink-0" style={{ background: 'var(--mpm-grad-primary)' }}>
              <span className="w-[42px] h-[42px] rounded-full flex items-center justify-center overflow-hidden" style={{ background: 'var(--mpm-panel)' }}>
                {avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  : <span style={{ color: 'var(--mpm-text)', fontSize: 15, fontWeight: 700 }}>{userInitial}</span>}
              </span>
            </span>
            <div>
              <div style={{ fontSize: 12.5, color: 'var(--mpm-muted)' }}>Welcome back</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--mpm-text)' }}>{username ? `@${username}` : firstName}</div>
            </div>
          </div>
          <button onClick={toggleMobileTheme} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--mpm-input)', color: 'var(--mpm-muted)' }}>
            {mobileIsDark
              ? <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              : <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>}
          </button>
        </div>

        <div className="px-[18px]" style={{ paddingBottom: 90 }}>
          {/* Total balance + Agent Wallet — one swipeable row. Total fills the
              screen at rest; Agent Wallet sits just off the right edge,
              revealed by swiping (same peek pattern as the old Main+Agent
              wallet-cards row). */}
          <div className="flex overflow-x-auto scrollbar-hide mt-4" style={{ gap: 12, margin: '16px -18px 0', padding: '0 18px 4px', scrollSnapType: 'x mandatory' }}>

            {/* Total balance — full viewport width */}
            <div className="relative overflow-hidden flex flex-col shrink-0" style={{
              width: 'calc(100vw - 36px)', scrollSnapAlign: 'start',
              padding: '26px 24px 22px', borderRadius: 'var(--mpm-radius-xl)',
              background: 'linear-gradient(150deg, rgba(47,107,255,0.24), rgba(109,108,255,0.06) 55%), var(--mpm-glass-bg)',
              backdropFilter: 'blur(var(--mpm-glass-blur))', WebkitBackdropFilter: 'blur(var(--mpm-glass-blur))',
              border: '1px solid var(--mpm-glass-border)', boxShadow: 'var(--mpm-glow-blue), var(--mpm-shadow-lg), inset 0 1px 0 var(--mpm-glass-hi)',
            }}>
              <div className="absolute pointer-events-none" style={{ top: -60, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(109,108,255,0.28), transparent 70%)' }} />
              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--mpm-muted)', letterSpacing: '0.03em' }}>Total balance</div>
              <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.03em', color: 'var(--mpm-text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
                ${formatUSD(totalUsd + agentTotalUsd + (agentWallet?.gateway_reserved ?? 0))}
              </div>
              {mainDelta24h !== 0 && (
                <span className="inline-flex items-center gap-1 self-start" style={{
                  marginTop: 8, padding: '4px 9px', borderRadius: 'var(--mpm-radius-full)', fontSize: 12.5, fontWeight: 600,
                  background: mainDelta24h > 0 ? 'rgba(43,212,164,0.16)' : 'rgba(255,93,108,0.14)',
                  color: mainDelta24h > 0 ? 'var(--mpm-success)' : 'var(--mpm-error)',
                }}>
                  {mainDelta24h > 0 ? '+' : ''}{mainDeltaPct.toFixed(2)}%
                </span>
              )}
              {/* X402 Gateway reserve is folded into the total above but not
                  broken out here, kept invisible per instruction. */}
              <div className="flex items-center gap-3" style={{ marginTop: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--mpm-muted2)' }}>Main <b style={{ color: 'var(--mpm-muted)', fontWeight: 600 }}>${formatUSD(totalUsd)}</b></span>
                <span style={{ fontSize: 11, color: 'var(--mpm-muted2)' }}>Agent <b style={{ color: 'var(--mpm-muted)', fontWeight: 600 }}>${formatUSD(agentTotalUsd)}</b></span>
              </div>
            </div>

            {/* Agent Wallet — peeks in from the right, swipe to reveal */}
            <div className="flex flex-col shrink-0" style={{ width: 220, scrollSnapAlign: 'start', padding: '18px 16px', borderRadius: 'var(--mpm-radius-xl)', background: 'linear-gradient(135deg,rgba(109,108,255,0.16),rgba(13,28,64,0.04))', border: '1px solid rgba(109,108,255,0.28)' }}>
              <div className="flex items-center justify-between">
                <div style={{ fontSize: 11.5, color: 'var(--mpm-muted)', fontWeight: 600 }}>Agent Wallet</div>
                <span className="inline-flex items-center gap-1" style={{ fontSize: 10, fontWeight: 600, color: 'var(--mpm-success)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--mpm-success)' }} />Active
                </span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--mpm-text)', marginTop: 6, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>${formatUSD(agentTotalUsd)}</div>
              <div style={{ marginTop: 8 }}>
                <div className="flex justify-between" style={{ fontSize: 10, color: 'var(--mpm-muted)', marginBottom: 5 }}>
                  <span>Daily spent</span><span>${formatUSD(agentWallet?.daily_spent ?? 0)}/${formatUSD(agentWallet?.daily_limit ?? 5)}</span>
                </div>
                <div style={{ height: 5, borderRadius: 9999, background: 'var(--mpm-input)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(spentPct, 100)}%`, height: '100%', borderRadius: 9999, background: 'linear-gradient(90deg,#6d6cff,#2f6bff)' }} />
                </div>
              </div>
              <div className="flex gap-1.5" style={{ marginTop: 'auto', paddingTop: 10 }}>
                <button onClick={() => { setShowFund(true); setModalAmount(''); setModalError('') }} title="Fund" className="flex-1 flex items-center justify-center rounded-[8px]" style={{ height: 30, background: 'var(--mpm-input)', color: 'var(--mpm-text)' }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                </button>
                <button onClick={() => { setShowWithdraw(true); setModalAmount(''); setModalError('') }} title="Withdraw" className="flex-1 flex items-center justify-center rounded-[8px]" style={{ height: 30, background: 'var(--mpm-input)', color: 'var(--mpm-text)' }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5-7 7 7 7" /></svg>
                </button>
                <button onClick={() => setShowLimit(true)} title="Limit" className="flex-1 flex items-center justify-center rounded-[8px]" style={{ height: 30, background: 'var(--mpm-input)', color: 'var(--mpm-text)' }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                </button>
              </div>
            </div>

          </div>

          {/* Quick actions */}
          <div className="mt-5 mb-2 px-1.5">
            <div className="flex justify-between">
              {QUICK_ACTIONS.map(a => (
                <button key={a.label} disabled={a.disabled} title={a.disabled ? a.sub : undefined} onClick={() => {
                  if (a.disabled) return
                  if (a.href === 'modal:send') setSrsMode('send')
                  else if (a.href === 'modal:receive') setSrsMode('receive')
                  else if (a.href === 'modal:swap') setSrsMode('swap')
                  else if (a.href !== '#') router.push(a.href)
                }}
                  className="flex flex-col items-center gap-1.5" style={{ opacity: a.disabled ? 0.4 : 1 }}>
                  <div className="w-12 h-12 rounded-[12px] flex items-center justify-center"
                    style={{ background: 'var(--mpm-input)', color: a.accent }}>
                    {a.icon}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--mpm-text)' }}>{a.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Miron Score — hidden until public launch; scoring still runs server-side */}

          {/* Holdings — moved above Recent activity */}
          {tokenList.length > 0 && (
            <>
              <div className="flex items-center justify-between mt-6 mb-2.5 mx-1">
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--mpm-text)' }}>Holdings</h3>
              </div>
              <div className="scrollbar-hide" style={{
                background: 'var(--mpm-glass-bg)', backdropFilter: 'blur(var(--mpm-glass-blur))', WebkitBackdropFilter: 'blur(var(--mpm-glass-blur))',
                borderRadius: 'var(--mpm-radius-lg)', border: '1px solid var(--mpm-glass-border)', boxShadow: 'inset 0 1px 0 var(--mpm-glass-hi)', padding: 6,
                maxHeight: 260, overflowY: 'auto',
              }}>
                {tokenList.map((t, i) => (
                  <div key={t.symbol} className="flex items-center gap-3 px-2.5 py-2.5" style={{ borderBottom: i < tokenList.length - 1 ? '1px solid var(--mpm-border)' : 'none' }}>
                    {t.logoUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={t.logoUrl} alt={t.symbol} className="w-9 h-9 rounded-full shrink-0" />
                      : <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--mpm-input)', fontSize: 11, fontWeight: 700, color: 'var(--mpm-text)' }}>{t.symbol.slice(0, 2)}</span>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5" style={{ fontSize: 14, fontWeight: 600, color: 'var(--mpm-text)' }}>
                        {t.symbol}
                        {t.isVerified && <VerifiedBadge size="sm" />}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--mpm-muted)' }}>{t.name}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mpm-text)', fontVariantNumeric: 'tabular-nums' }}>{parseFloat(t.amount).toFixed(4)}</div>
                      <div style={{ fontSize: 12, color: 'var(--mpm-muted)' }}>${(t.usdValue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Recent activity — moved below Holdings */}
          <div className="flex items-center justify-between mt-6 mb-2.5 mx-1">
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--mpm-text)' }}>Recent activity</h3>
          </div>
          <div className="scrollbar-hide" style={{
            background: 'var(--mpm-glass-bg)', backdropFilter: 'blur(var(--mpm-glass-blur))', WebkitBackdropFilter: 'blur(var(--mpm-glass-blur))',
            borderRadius: 'var(--mpm-radius-lg)', border: '1px solid var(--mpm-glass-border)', boxShadow: 'inset 0 1px 0 var(--mpm-glass-hi)', padding: 6,
            maxHeight: 260, overflowY: 'auto',
          }}>
            {transactions.slice(0, 5).map(tx => {
              const hasMemo = !!tx.memo
              return (
                <div key={tx.id} className="flex items-center gap-3 px-2.5 py-2.5" style={{ borderBottom: '1px solid var(--mpm-border)' }}>
                  <span className="w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0" style={{
                    background: hasMemo ? 'rgba(109,108,255,0.16)' : tx.type === 'credit' ? 'rgba(43,212,164,0.14)' : 'var(--mpm-input)',
                    color: hasMemo ? 'var(--mpm-purple-accent)' : tx.type === 'credit' ? 'var(--mpm-success)' : 'var(--mpm-muted)',
                  }}>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      {tx.type === 'credit' ? <path d="M12 2v14M7 12l5 5 5-5" /> : <path d="M12 22V8M7 12l5-5 5 5" />}
                    </svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mpm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</div>
                    <div style={{ fontSize: 12, color: 'var(--mpm-muted)' }}>
                      {new Date(tx.created_at).toLocaleDateString('en-US')}
                      {hasMemo && <span style={{ color: 'var(--mpm-purple-accent)', opacity: .8 }}> · {tx.memo}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 14.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: tx.type === 'credit' ? 'var(--mpm-success)' : 'var(--mpm-text)', flexShrink: 0 }}>
                    {tx.type === 'credit' ? '+' : '-'}{tx.amount.toFixed(2)} USDC
                  </span>
                </div>
              )
            })}
            {transactions.length === 0 && <p className="text-sm text-center py-8" style={{ color: 'var(--mpm-muted)' }}>No transactions</p>}
          </div>
        </div>
      </div>

      {/* ══════════════════════ DESKTOP ══════════════════════ */}
      <div className="hidden lg:flex overflow-hidden" style={{ height: '100vh', background: 'radial-gradient(1000px 520px at 16% -8%,rgba(99,102,241,.18),transparent 60%),radial-gradient(760px 520px at 102% -4%,rgba(139,124,255,.10),transparent 56%),var(--c-page)' }}>

        {/* Main: 2-col grid (content + right rail) */}
        <main style={{ flex: 1, minWidth: 0, padding: '24px 26px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 344px', gap: 22, height: '100vh', overflow: 'hidden' }}>

          {/* ── CONTENT COLUMN ── */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>

            {/* Wallet row: 3 cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>

              {/* MAIN WALLET */}
              <div style={{ position: 'relative', overflow: 'hidden', padding: '18px 20px', borderRadius: 14, background: 'var(--wc-blue-grad)', border: '1px solid var(--wc-blue-border)', boxShadow: '0 8px 32px rgba(99,102,241,.28)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'absolute', top: -36, right: -36, width: 110, height: 110, borderRadius: '50%', background: '#6366f1', opacity: .14, filter: 'blur(30px)', pointerEvents: 'none' }} />
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.005em', color: 'var(--c-muted)' }}>Main Wallet</div>
                <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em', marginTop: 8 }}>${formatUSD(totalUsd)}</div>
                {mainDelta24h !== 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: mainDelta24h > 0 ? '#2dd4bf' : '#fb6f84', marginTop: 3 }}>
                    <svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor"><path d={mainDelta24h > 0 ? 'M12 4l8 16H4z' : 'M12 20L4 4h16z'} /></svg>
                    {mainDelta24h > 0 ? '+' : ''}{formatUSD(mainDelta24h)} ({mainDeltaPct.toFixed(2)}%)
                    <span style={{ color: 'var(--c-muted2)', fontWeight: 400 }}>· 24h</span>
                  </div>
                )}
                <div style={{ height: 46, marginTop: 10 }}>
                  <SparklineChart values={chartValues} color={mainDelta24h >= 0 ? '#2dd4bf' : '#fb6f84'} id="spk-main" />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 12 }}>
                  <button onClick={() => setSrsMode('send')} className="mp-btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', boxShadow: '0 6px 20px rgba(99,102,241,.38)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m21 3-9.5 9.5" /><path d="M21 3 14 21l-3.5-7.5L3 10z" /></svg>Send
                  </button>
                  <button onClick={() => setSrsMode('receive')} className="mp-btn-ghost" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v13" /><path d="m6 11 6 6 6-6" /></svg>Receive
                  </button>
                </div>
              </div>

              {/* AGENT WALLET */}
              <div style={{ position: 'relative', overflow: 'hidden', padding: '18px 20px', borderRadius: 14, background: 'var(--wc-purple-grad)', border: '1px solid var(--wc-purple-border)', boxShadow: '0 8px 32px rgba(139,124,255,.28)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'absolute', top: -36, right: -36, width: 110, height: 110, borderRadius: '50%', background: '#8b7cff', opacity: .14, filter: 'blur(30px)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.005em', color: 'var(--c-muted)' }}>Agent Wallet</div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#2dd4bf' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2dd4bf', boxShadow: '0 0 6px #2dd4bf', display: 'inline-block' }} />Active
                  </span>
                </div>
                <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em', marginTop: 8 }}>${formatUSD(agentTotalUsd)}</div>
                <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 3 }}>Auto-pilot on</div>
                <div style={{ height: 46, marginTop: 10 }}>
                  <SparklineChart values={agentChartValues} color="#8b8aff" id="spk-agent" />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 12 }}>
                  <button onClick={() => { setShowFund(true); setModalAmount(''); setModalError('') }} className="mp-btn-ghost" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>Fund
                  </button>
                  <button onClick={() => { setShowWithdraw(true); setModalAmount(''); setModalError('') }} className="mp-btn-ghost" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5-7 7 7 7" /></svg>Withdraw
                  </button>
                  <button onClick={() => { setShowLimit(true); setModalLimit(''); setModalError('') }} className="mp-btn-ghost" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>Limit
                  </button>
                </div>
              </div>

              {/* AGENT STATUS */}
              <div style={{ position: 'relative', overflow: 'hidden', padding: '18px 20px', borderRadius: 14, background: 'linear-gradient(150deg,rgba(34,198,224,.12),transparent 58%),color-mix(in srgb, var(--c-panel) 55%, transparent)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(var(--c-fg-rgb),.10)', boxShadow: '0 10px 40px rgba(34,198,224,.22),inset 0 1px 0 rgba(var(--c-fg-rgb),.07)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: '50%', background: '#22c6e0', opacity: .14, filter: 'blur(28px)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 700, letterSpacing: '-.005em', color: 'var(--c-muted)' }}>
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#22c6e0" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>
                    Agent status
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#2dd4bf' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2dd4bf', display: 'inline-block' }} />Online
                  </span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', color: 'var(--c-muted2)', textTransform: 'uppercase' as const }}>Used today</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 3 }}>
                  <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--c-text)' }}>${formatUSD(agentWallet?.daily_spent ?? 0)}</span>
                  <span style={{ fontSize: 12, color: 'var(--c-muted)', fontWeight: 500 }}>/ ${formatUSD(agentWallet?.daily_limit ?? 5)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.06)', overflow: 'hidden', marginTop: 10 }}>
                  <div style={{ width: `${Math.min(spentPct, 100)}%`, height: '100%', borderRadius: 9999, background: 'linear-gradient(90deg,#5ad6ea,#22c6e0)', transition: 'width .4s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-muted)', marginTop: 6 }}>
                  <span>{spentPct.toFixed(0)}% used</span>
                  <span>${formatUSD((agentWallet?.daily_limit ?? 5) - (agentWallet?.daily_spent ?? 0))} left</span>
                </div>
              </div>

            </div>

            {/* Agent Chat */}
            <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 16, background: 'linear-gradient(180deg,rgba(47,107,255,.05),transparent 22%),var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.14)', boxShadow: '0 8px 28px rgba(3,8,20,.45),inset 0 1px 0 rgba(var(--c-fg-rgb),.07)', overflow: 'hidden', flex: 1, minHeight: 0 }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '15px 18px', borderBottom: '1px solid rgba(var(--c-fg-rgb),.07)', background: 'rgba(var(--c-fg-rgb),.015)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <AgentAvatar size={42} glow excited={agentExcited} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>Miron Agent</span>
                      <VerifiedBadge size="sm" source="ARC" />
                      {agentIdentity && (
                        <a href={`https://testnet.arcscan.app/tx/${agentIdentity.tx_hash}`} target="_blank" rel="noopener noreferrer"
                          style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--c-indigo-light)', background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.10)', padding: '2px 8px', borderRadius: 9999, textDecoration: 'none' }}>
                          ID #{agentIdentity.agent_id}
                        </a>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 2 }}>
                      Online · on-chain verified
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="mp-chat-body scrollbar-hide" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', touchAction: 'pan-y', padding: '18px 18px 10px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {messages.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, gap: 18, padding: '40px 20px' }}>
                    <AgentAvatar size={68} showStatusDot={false} bg={false} />
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', marginBottom: 5 }}>Hi {username ? `@${username}` : firstName}</p>
                      <p style={{ fontSize: 13.5, color: 'var(--c-muted)', lineHeight: 1.55 }}>Send, swap, or check balances — just ask.</p>
                    </div>
                  </div>
                ) : (
                  messages.map(msg => (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
                      {msg.txResult ? (
                        <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${msg.txResult.success ? 'rgba(45,212,191,.30)' : 'rgba(251,111,132,.30)'}`, minWidth: 220, maxWidth: 300 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', background: msg.txResult.success ? 'rgba(45,212,191,.10)' : 'rgba(251,111,132,.10)', borderBottom: `1px solid ${msg.txResult.success ? 'rgba(45,212,191,.20)' : 'rgba(251,111,132,.20)'}` }}>
                            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={msg.txResult.success ? '#2dd4bf' : '#fb6f84'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d={msg.txResult.success ? 'm8.5 12 2.5 2.5L16 9' : 'M15 9l-6 6M9 9l6 6'} /></svg>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: msg.txResult.success ? '#2dd4bf' : '#fb6f84' }}>
                              {msg.txResult.success
                                ? (msg.txResult.type === 'swap' ? 'Swap successful' : msg.txResult.type === 'gateway_deposit' ? 'X402 deposit successful' : msg.txResult.type === 'gateway_withdraw' ? 'X402 withdrawal successful' : msg.txResult.type === 'launchpad_contribute' ? 'Contribution successful' : 'Transfer successful')
                                : (msg.txResult.type === 'swap' ? 'Swap failed' : msg.txResult.type === 'gateway_deposit' ? 'X402 deposit failed' : msg.txResult.type === 'gateway_withdraw' ? 'X402 withdrawal failed' : msg.txResult.type === 'launchpad_contribute' ? 'Contribution failed' : 'Transfer failed')}
                            </span>
                          </div>
                          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--c-panel-2)' }}>
                            {msg.txResult.success ? (
                              <>
                                {msg.txResult.type === 'swap' ? (
                                  <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>You paid</span><span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>−{msg.txResult.amountIn} {msg.txResult.tokenIn}</span></div>
                                    {msg.txResult.amountOut && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>You received</span><span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#2dd4bf' }}>+{msg.txResult.amountOut} {msg.txResult.tokenOut}</span></div>}
                                  </>
                                ) : msg.txResult.type === 'gateway_deposit' || msg.txResult.type === 'gateway_withdraw' ? (
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>{msg.txResult.type === 'gateway_deposit' ? 'Deposited' : 'Withdrawn'}</span>
                                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: msg.txResult.type === 'gateway_deposit' ? 'var(--c-text)' : '#2dd4bf' }}>
                                      {msg.txResult.type === 'gateway_deposit' ? '−' : '+'}{msg.txResult.amountIn} USDC
                                    </span>
                                  </div>
                                ) : msg.txResult.type === 'launchpad_contribute' ? (
                                  <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>Contributed</span><span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>−{msg.txResult.amountIn} USDC</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>Project</span><span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)' }}>{msg.txResult.projectId}</span></div>
                                    {msg.txResult.tokensEstimate && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>Received</span><span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#2dd4bf' }}>~{msg.txResult.tokensEstimate} {msg.txResult.sym}</span></div>}
                                  </>
                                ) : (
                                  <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>Amount</span><span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>−{msg.txResult.amountIn} {msg.txResult.tokenIn}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>To</span><span style={{ fontSize: 11.5, fontFamily: 'monospace', color: 'var(--c-text)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg.txResult.to}</span></div>
                                  </>
                                )}
                                {msg.txResult.txHash && (
                                  <a href={`https://testnet.arcscan.app/tx/${msg.txResult.txHash}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 3, padding: '7px 11px', borderRadius: 7, background: 'rgba(99,102,241,.10)', border: '1px solid rgba(99,102,241,.20)', textDecoration: 'none' }}>
                                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--c-indigo-light)' }}>{msg.txResult.txHash.slice(0, 8)}...{msg.txResult.txHash.slice(-6)}</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-indigo-light)' }}>View TX ↗</span>
                                  </a>
                                )}
                              </>
                            ) : (
                              <p style={{ fontSize: 12, color: '#fb6f84' }}>{msg.txResult.error}</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ maxWidth: '75%', borderRadius: 14, padding: '12px 15px', fontSize: 14, lineHeight: 1.55, ...(msg.role === 'user' ? { background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', boxShadow: '0 6px 20px rgba(99,102,241,.28)', color: '#fff', borderBottomRightRadius: 5 } : { background: 'var(--c-panel-2)', border: '1px solid rgba(var(--c-fg-rgb),.07)', color: 'var(--c-text)', borderBottomLeftRadius: 5 }) }}>
                          {msg.role === 'assistant' && msg.animate ? <TypewriterText text={msg.content} /> : msg.content}
                        </div>
                      )}
                      {msg.role === 'assistant' && msg.chart && (
                        <TokenPriceChart chart={msg.chart} />
                      )}
                      {msg.role === 'assistant' && msg.trending && (
                        <TrendingTable coins={msg.trending.coins} />
                      )}
                      {msg.role === 'assistant' && msg.defi && (
                        <DefiDataCard data={msg.defi} />
                      )}
                      {msg.role === 'assistant' && msg.stablecoin && (
                        <StablecoinDataCard data={msg.stablecoin} />
                      )}
                      {msg.role === 'assistant' && msg.walletLookup && (
                        <WalletLookupCard data={msg.walletLookup} />
                      )}
                      {msg.role === 'assistant' && msg.sentiment && (
                        <SentimentMeter value={msg.sentiment.value} classification={msg.sentiment.classification} />
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 3px' }}>
                        <span style={{ fontSize: 11, color: 'var(--c-muted2)' }}>{msg.time}</span>
                        {msg.role === 'user' && (msg.cost ?? 0) > 0 && (
                          <span style={{ fontSize: 11, color: '#2dd4bf', fontWeight: 600 }}>−{msg.cost} USDC ✓</span>
                        )}
                        {msg.role === 'user' && msg.inputFeeTxHash && (
                          <a
                            href={`https://testnet.arcscan.app/tx/${msg.inputFeeTxHash}`}
                            target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--c-indigo-light)', textDecoration: 'none' }}
                          >
                            {msg.inputFeeTxHash.slice(0, 6)}...{msg.inputFeeTxHash.slice(-4)} · View TX ↗
                          </a>
                        )}
                        {msg.role === 'assistant' && msg.dataFee && (
                          <span style={{ fontSize: 11, color: 'var(--c-indigo-light)', fontWeight: 600 }} title={msg.dataFee.txHash ?? undefined}>
                            🔎 −{msg.dataFee.amount} USDC (live data via x402)
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {sending && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ padding: '11px 14px', borderRadius: 14, borderBottomLeftRadius: 5, background: 'var(--c-panel-2)', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[0, 150, 300].map(d => <span key={d} className="animate-bounce" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-muted)', animationDelay: `${d}ms`, display: 'inline-block' }} />)}
                      </div>
                    </div>
                  </div>
                )}
                {chatError && <p style={{ fontSize: 12, textAlign: 'center' as const, color: '#fb6f84' }}>{chatError}</p>}
                <div ref={messagesEndRef} />
              </div>

              {/* Suggestion chips */}
              <div style={{ display: 'flex', gap: 7, padding: '0 18px 10px', flexWrap: 'wrap' as const, flexShrink: 0 }}>
                {[
                  { text: 'Check my balance', fn: () => setInput('Check my balance') },
                  ...(lastSwap?.tokenIn && lastSwap?.tokenOut
                    ? [{ text: `Swap ${lastSwap.tokenIn} → ${lastSwap.tokenOut} again`, fn: () => setInput(`Swap ${lastSwap.tokenIn} → ${lastSwap.tokenOut}`) }]
                    : tokenList.some(t => t.symbol === 'USDC' && (t.usdValue ?? 0) > 0)
                    ? [{ text: 'Swap USDC → EURC', fn: () => setInput('Swap USDC → EURC') }]
                    : []),
                  ...(agentBalance < 1
                    ? [{ text: 'Fund my Agent Wallet', fn: () => setInput('Fund my Agent Wallet with 5 USDC') }]
                    : lastSend?.to
                    ? [{ text: `Send to ${lastSend.to} again`, fn: () => setInput(`Send USDC to ${lastSend.to}`) }]
                    : [{ text: 'Send USDC to a friend', fn: () => setInput('Send USDC to @') }]),
                ].map(c => (
                  <button key={c.text} onClick={c.fn} className="mp-btn-ghost" style={{ padding: '6px 12px', borderRadius: 9999, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-muted)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>{c.text}</button>
                ))}
              </div>

              {/* Input bar */}
              <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(var(--c-fg-rgb),.07)', background: 'rgba(var(--c-fg-rgb),.015)', flexShrink: 0 }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 5px 5px 15px', borderRadius: 13, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)' }}
                >
                  <input
                    value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    onFocus={() => setAgentExcited(true)} onBlur={() => setAgentExcited(false)}
                    placeholder="Ask Miron Agent anything…" disabled={sending} className="flex-1 bg-transparent text-sm outline-none" style={{ color: 'var(--c-text)' }}
                  />
                  <button onClick={() => handleSend()} disabled={sending || !input.trim()} style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', boxShadow: '0 6px 24px rgba(99,102,241,.42)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: (sending || !input.trim()) ? .4 : 1 }}>
                    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m21 3-9.5 9.5" /><path d="M21 3 14 21l-3.5-7.5L3 10z" /></svg>
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-muted2)', marginTop: 8, padding: '0 3px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>
                    Message fee: {msgCost} USDC / msg
                  </span>
                  <span>Agent limit: ${agentWallet ? formatUSD(agentWallet.daily_limit) : '5.00'} USDC / day</span>
                </div>
              </div>

            </div>

          </section>

          {/* ── RIGHT RAIL ── */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>

            {/* Miron Agent */}
            <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', boxShadow: '0 1px 3px rgba(3,8,20,.42)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--c-muted2)', textTransform: 'uppercase' as const }}>Your AI agent</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {arcRank && (
                    <a href="/leaderboard" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-indigo-light)', background: 'rgba(165,180,252,.1)', border: '1px solid rgba(165,180,252,.2)', borderRadius: 9999, padding: '2px 8px', textDecoration: 'none' }}>
                      #{arcRank} on ARC
                    </a>
                  )}
                  {agentIdentity && (
                    <a href={`https://testnet.arcscan.app/tx/${agentIdentity.tx_hash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-indigo-light)', textDecoration: 'none' }}>View on-chain</a>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AgentAvatar size={44} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>Miron Agent</span>
                    <VerifiedBadge size="sm" source="ARC" />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 2 }}>AI wallet agent · ARC Testnet</div>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--c-muted)', marginBottom: 6 }}>Agent status</div>
                <div style={{ display: 'flex', gap: 7 }}>
                  {[
                    [agentIdentity ? `#${agentIdentity.agent_id}` : '—', 'agent id'],
                    [String(agentTxSuccessCount), 'tx count'],
                    [String(agentReplyCount), 'messages'],
                  ].map(([val, unit]) => (
                    <div key={unit} style={{ flex: 1, textAlign: 'center' as const, padding: '8px 0', borderRadius: 10, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                      <div style={{ fontSize: 10, color: 'var(--c-muted2)', marginTop: 1 }}>{unit}</div>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setShowAgentInfo(true)} className="mp-btn-primary" style={{ width: '100%', height: 40, marginTop: 14, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', boxShadow: '0 6px 24px rgba(99,102,241,.38)', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>View details</button>
            </div>

            {/* Live IDO — real-time on-chain raise progress */}
            {liveIdo && (
              <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', boxShadow: '0 1px 3px rgba(3,8,20,.42)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--c-muted2)', textTransform: 'uppercase' as const }}>Live IDO</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#2dd4bf', background: 'rgba(45,212,191,.12)', padding: '2px 8px', borderRadius: 9999 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#2dd4bf' }} />Live
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: '#fff', background: `linear-gradient(140deg, ${liveIdo.accent}, ${liveIdo.accent}bb)` }}>{liveIdo.mark}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{liveIdo.name} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-muted)', fontWeight: 500 }}>${liveIdo.sym}</span></div>
                    <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{fmtUsd(liveIdo.raised)} raised of {fmtUsd(liveIdo.target)}</div>
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.05)', marginTop: 12, overflow: 'hidden', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
                  <div style={{ height: '100%', width: `${liveIdo.target ? Math.min(100, Math.round(liveIdo.raised / liveIdo.target * 100)) : 0}%`, borderRadius: 9999, background: `linear-gradient(90deg, ${liveIdo.accent}, ${liveIdo.accent}cc)` }} />
                </div>
                {(() => {
                  const idoMax = Math.max(agentBalance, liveIdo.minContribution)
                  const idoVal = Math.min(idoAmount, idoMax)
                  const idoTokens = liveIdo.price > 0 ? idoVal / liveIdo.price : 0
                  return (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-muted2)', marginBottom: 4 }}>
                        <span>${idoVal.toFixed(0)} USDC</span>
                        <span>~{idoTokens.toLocaleString('en-US', { maximumFractionDigits: 2 })} {liveIdo.sym}</span>
                      </div>
                      <input
                        type="range" min={0} max={idoMax} step={1} value={idoVal}
                        onChange={e => setIdoAmount(Number(e.target.value))}
                        style={{ width: '100%', accentColor: liveIdo.accent }}
                        aria-label={`Amount to contribute to ${liveIdo.name}`}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button onClick={() => router.push(`/launchpad/${liveIdo.id}`)} style={{ flex: 1, height: 36, borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                          View details →
                        </button>
                        <button onClick={() => handleSend(`Contribute $${idoVal} to ${liveIdo.name}`)} disabled={sending || idoVal <= 0} style={{ flex: 1, height: 36, borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${liveIdo.accent}, ${liveIdo.accent}cc)`, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: sending ? 'default' : 'pointer', opacity: (sending || idoVal <= 0) ? .6 : 1 }}>
                          Buy ${idoVal.toFixed(0)} now
                        </button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Miron Score — hidden until public launch; scoring still runs server-side */}

            {/* Recent Activity */}
            <div style={{ display: 'flex', flexDirection: 'column', padding: '16px 18px 12px', borderRadius: 14, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--c-muted2)', textTransform: 'uppercase' as const }}>Recent activity</span>
                <div style={{ display: 'flex', gap: 3 }}>
                  {(['all', 'tx', 'agent'] as const).map(k => (
                    <button key={k} onClick={() => setActiveTab(k)} className="mp-btn-ghost" style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 9999, border: 'none', cursor: 'pointer', background: activeTab === k ? '#6366f1' : 'transparent', color: activeTab === k ? '#fff' : 'var(--c-muted)' }}>
                      {k === 'all' ? 'All' : k === 'tx' ? 'Wallet' : 'Agent'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable items list — hidden scrollbar */}
              <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {filteredActivity.length === 0 ? (
                  <p style={{ fontSize: 12, textAlign: 'center' as const, padding: '22px 0', color: 'var(--c-muted2)' }}>No activity yet</p>
                ) : (
                  filteredActivity.map(item => {
                    if (item.kind === 'tx') {
                      const tx = item.tx
                      const hasMemo = !!tx.memo
                      return (
                        <div key={item.id} onClick={() => setSelectedTx(tx)} className="activity-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', margin: '0 -8px', borderTop: '1px solid rgba(var(--c-fg-rgb),.07)', cursor: 'pointer' }}>
                          <span style={{
                            width: 30, height: 30, borderRadius: 9,
                            background: hasMemo ? 'rgba(124,107,245,.18)' : tx.type === 'credit' ? 'rgba(45,212,191,.12)' : 'rgba(251,111,132,.12)',
                            border: hasMemo ? '1px solid rgba(124,107,245,.35)' : '1px solid transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: hasMemo ? 'var(--c-purple-accent)' : tx.type === 'credit' ? '#2dd4bf' : '#fb6f84', flexShrink: 0
                          }}>
                            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                              {tx.type === 'credit' ? <path d="M12 19V5M5 12l7 7 7-7" /> : <path d="M12 5v14M5 12l7-7 7 7" />}
                            </svg>
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{tx.description}</div>
                              {hasMemo && (
                                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--c-purple-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--c-muted2)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                              {new Date(tx.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                              {hasMemo && <span style={{ color: 'var(--c-purple-accent)', opacity: 0.8 }}> · {tx.memo}</span>}
                            </div>
                          </div>
                          <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 600, color: tx.type === 'credit' ? '#2dd4bf' : '#fb6f84', flexShrink: 0 }}>
                            {tx.type === 'credit' ? '+' : '−'}{tx.amount.toFixed(2)}
                          </span>
                        </div>
                      )
                    }
                    const msg = item.msg
                    const fullText = item.kind === 'msg' ? `You: ${msg.content}` : msg.content
                    const marqueeDuration = Math.min(40, Math.max(12, fullText.length * 0.3))
                    return (
                      <div key={item.id} className="activity-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', margin: '0 -8px', borderTop: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: item.kind === 'agent' ? 'rgba(99,102,241,.15)' : 'rgba(var(--c-fg-rgb),.05)', color: item.kind === 'agent' ? 'var(--c-indigo-light)' : 'var(--c-muted2)', flexShrink: 0 }}>
                          {item.kind === 'agent' ? 'Agent' : 'Msg'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                          <div className="activity-track" style={{ display: 'inline-flex', whiteSpace: 'nowrap' as const, animation: `mpMarquee ${marqueeDuration}s linear infinite` }}>
                            <span style={{ fontSize: 12, color: 'var(--c-muted)', paddingRight: 32 }}>{fullText}</span>
                            <span style={{ fontSize: 12, color: 'var(--c-muted)', paddingRight: 32 }} aria-hidden="true">{fullText}</span>
                          </div>
                        </div>
                        {item.kind === 'agent' && <span style={{ fontSize: 11.5, color: '#fb6f84', flexShrink: 0 }}>−{msg.cost?.toFixed(3)}</span>}
                      </div>
                    )
                  })
                )}
              </div>

              <a href="/wallet" onClick={e => { e.preventDefault(); router.push('/wallet') }} style={{ display: 'block', textAlign: 'center' as const, marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(var(--c-fg-rgb),.07)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-indigo-light)', textDecoration: 'none', flexShrink: 0 }}>View all activity →</a>
            </div>

          </aside>

        </main>

      </div>


      {showHistory && (
        <TransactionHistoryModal transactions={transactions} onClose={() => setShowHistory(false)} />
      )}

      {selectedTx && (
        <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
      )}

      {pendingMainAction && (
        <AgentPinModal
          onSuccess={(pin) => {
            const { action, token } = pendingMainAction
            setPendingMainAction(null)
            runExecuteAction(action, token, pin)
          }}
          onCancel={() => setPendingMainAction(null)}
        />
      )}

      <SRSModal
        mode={srsMode}
        onClose={() => setSrsMode(null)}
        accessToken={accessToken}
        tokenList={tokenList}
        walletAddress={walletAddress}
        username={username}
        hasPIN={hasPIN}
        onPINSet={() => setHasPIN(true)}
        onSuccess={() => refreshMainWallet(accessToken)}
      />

      {/* ── FUND MODAL ── */}
      {showFund && (
        <div
          onClick={fundPhase === 'form' ? closeFundModal : undefined}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(6,4,16,.66)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'srsScrim .2s ease' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 432, maxWidth: '94vw', maxHeight: '90vh', borderRadius: 22, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.14)', boxShadow: '0 30px 80px rgba(3,8,20,.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'srsUp 340ms cubic-bezier(.22,1,.36,1)' }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid rgba(var(--c-fg-rgb),.07)', flexShrink: 0 }}>
              <div style={{ width: 34 }} />
              <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: 'var(--c-text)', textAlign: 'center', marginRight: 34 }}>Fund Agent Wallet</span>
              {fundPhase !== 'pending'
                ? <button onClick={closeFundModal} style={{ display: 'flex', width: 34, height: 34, alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(var(--c-fg-rgb),.07)', background: 'rgba(var(--c-fg-rgb),.05)', borderRadius: 10, color: 'var(--c-muted)', cursor: 'pointer', flexShrink: 0 }}>
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                : <div style={{ width: 34 }} />}
            </div>

            {/* Body */}
            <div className="srs-pad" style={{ flex: 1, overflowY: 'auto', padding: '22px 20px' }}>

              {/* FORM */}
              {fundPhase === 'form' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'srsStep .25s ease' }}>
                  <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase' as const, color: 'var(--c-muted2)', marginBottom: 10 }}>Amount</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                      <input
                        type="number" value={modalAmount} onChange={e => setModalAmount(e.target.value)}
                        placeholder="0.00" min="0.01" step="0.01" autoFocus
                        style={{ width: 180, textAlign: 'center', background: 'transparent', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 48, fontWeight: 700, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }}
                      />
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)', fontSize: 14, fontWeight: 700, color: 'var(--c-text)' }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#2775ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff', flexShrink: 0 }}>US</span>
                        USDC
                      </span>
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--c-muted2)', marginTop: 8 }}>{msgCost} USDC per message</p>
                    {modalError && <p style={{ fontSize: 12, color: '#fb6f84', marginTop: 5 }}>{modalError}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['25%', 0.25], ['50%', 0.5], ['75%', 0.75], ['100%', 1]].map(([label, pct]) => (
                      <button key={label as string} onClick={() => setModalAmount((mainBalance * (pct as number)).toFixed(4).replace(/\.?0+$/, ''))} style={{ flex: 1, height: 38, borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
                    ))}
                  </div>
                  <button
                    onClick={handleFund}
                    style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', background: parseFloat(modalAmount) > 0 ? 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)' : 'rgba(var(--c-fg-rgb),.07)', boxShadow: parseFloat(modalAmount) > 0 ? '0 8px 30px rgba(99,102,241,.42)' : 'none', color: parseFloat(modalAmount) > 0 ? '#fff' : 'var(--c-muted2)', fontSize: 15, fontWeight: 600, cursor: parseFloat(modalAmount) > 0 ? 'pointer' : 'not-allowed', marginTop: 4, transition: 'all .15s' }}
                  >
                    Deposit USDC
                  </button>
                </div>
              )}

              {/* PENDING */}
              {fundPhase === 'pending' && (
                <div style={{ textAlign: 'center', padding: '16px 0', animation: 'srsStep .25s ease' }}>
                  <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 20px' }}>
                    <svg width={72} height={72} viewBox="0 0 72 72" style={{ animation: 'srsSpin 1s linear infinite' }}>
                      <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(var(--c-fg-rgb),.07)" strokeWidth={5} />
                      <circle cx="36" cy="36" r="30" fill="none" stroke="#6366f1" strokeWidth={5} strokeLinecap="round" strokeDasharray="60 200" />
                    </svg>
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-text)' }}>Processing deposit...</p>
                  <p style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 6 }}>Transferring {parseFloat(modalAmount || '0').toFixed(2)} USDC → Agent Wallet</p>
                </div>
              )}

              {/* SUCCESS */}
              {fundPhase === 'success' && fundResult && (
                <div style={{ textAlign: 'center', padding: '8px 0', animation: 'srsStep .25s ease' }}>
                  <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'rgba(45,212,191,.12)', border: '1px solid rgba(45,212,191,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', animation: 'srsPop 400ms cubic-bezier(.22,1,.36,1)' }}>
                    <svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p style={{ fontSize: 22, fontWeight: 700, marginTop: 16, color: 'var(--c-text)' }}>Deposit Submitted!</p>
                  <p style={{ fontSize: 13.5, color: 'var(--c-muted)', marginTop: 6 }}>+{fundResult.amount.toFixed(2)} USDC → Agent Wallet</p>
                  <p style={{ fontSize: 12, color: 'var(--c-muted2)', marginTop: 4 }}>Will appear in ~30 seconds</p>
                  {fundResult.transactionId && (
                    <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 12, background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)', textAlign: 'left' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase' as const, color: 'var(--c-muted2)', marginBottom: 4 }}>Transaction ID</p>
                      <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--c-indigo-light)', wordBreak: 'break-all' }}>{fundResult.transactionId}</p>
                    </div>
                  )}
                  <button onClick={closeFundModal} style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', boxShadow: '0 8px 30px rgba(99,102,241,.42)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 20 }}>
                    Done
                  </button>
                </div>
              )}

              {/* ERROR */}
              {fundPhase === 'error' && fundResult && (
                <div style={{ animation: 'srsStep .25s ease' }}>
                  <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(251,111,132,.1)', border: '1px solid rgba(251,111,132,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                      <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#fb6f84" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </div>
                    <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)' }}>Deposit Failed</p>
                  </div>
                  <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(251,111,132,.08)', border: '1px solid rgba(251,111,132,.2)', marginBottom: 16 }}>
                    <p style={{ fontSize: 13, color: '#fb6f84' }}>{fundResult.error}</p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button onClick={closeFundModal} style={{ height: 52, borderRadius: 14, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => { setFundPhase('form'); setFundResult(null) }} style={{ height: 52, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', boxShadow: '0 8px 30px rgba(99,102,241,.42)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── WITHDRAW MODAL ── */}
      {showWithdraw && (
        <div
          onClick={withdrawPhase === 'form' ? closeWithdrawModal : undefined}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(6,4,16,.66)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'srsScrim .2s ease' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 432, maxWidth: '94vw', maxHeight: '90vh', borderRadius: 22, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.14)', boxShadow: '0 30px 80px rgba(3,8,20,.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'srsUp 340ms cubic-bezier(.22,1,.36,1)' }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid rgba(var(--c-fg-rgb),.07)', flexShrink: 0 }}>
              {withdrawPhase === 'form' && withdrawTokenStep === 'token'
                ? <button onClick={() => setWithdrawTokenStep('form')} style={{ display: 'flex', width: 34, height: 34, alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(var(--c-fg-rgb),.07)', background: 'rgba(var(--c-fg-rgb),.05)', borderRadius: 10, color: 'var(--c-muted)', cursor: 'pointer', flexShrink: 0 }}>
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                : <div style={{ width: 34 }} />}
              <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: 'var(--c-text)', textAlign: 'center' }}>
                {withdrawTokenStep === 'token' ? 'Select Token' : 'Withdraw to Main Wallet'}
              </span>
              {withdrawPhase !== 'pending'
                ? <button onClick={closeWithdrawModal} style={{ display: 'flex', width: 34, height: 34, alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(var(--c-fg-rgb),.07)', background: 'rgba(var(--c-fg-rgb),.05)', borderRadius: 10, color: 'var(--c-muted)', cursor: 'pointer', flexShrink: 0 }}>
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                : <div style={{ width: 34 }} />}
            </div>

            <div className="srs-pad" style={{ flex: 1, overflowY: 'auto', padding: '22px 20px' }}>

              {/* TOKEN PICKER */}
              {withdrawPhase === 'form' && withdrawTokenStep === 'token' && (() => {
                const agentTokenList = agentWallet?.tokenList ?? []
                const tokens = agentTokenList.length > 0 ? agentTokenList : [{ symbol: 'USDC', name: 'USD Coin', amount: String(agentBalance), usdValue: agentBalance, change24hPct: null, logoUrl: null, isVerified: true, tokenAddress: null }]
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, animation: 'srsStep .25s ease' }}>
                    <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 9, lineHeight: 1.5 }}>Choose which token to withdraw from the agent wallet.</p>
                    {tokens.map(t => {
                      const bal = parseFloat(t.amount)
                      const balStr = bal < 1 ? bal.toFixed(4) : bal.toFixed(2)
                      const fiat = t.usdValue != null ? `$${t.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
                      const isSelected = t.symbol === withdrawToken
                      return (
                        <button key={t.symbol} onClick={() => { setWithdrawToken(t.symbol); setModalAmount(''); setWithdrawTokenStep('form') }}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 14, background: isSelected ? 'rgba(99,102,241,.07)' : 'rgba(var(--c-fg-rgb),.05)', border: `1px solid ${isSelected ? '#6366f1' : 'rgba(var(--c-fg-rgb),.07)'}`, cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'border-color .15s' }}>
                          {t.logoUrl
                            ? <img src={t.logoUrl} alt={t.symbol} style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
                            : <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.symbol === 'USDC' ? '#2775ca' : 'rgba(99,102,241,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{t.symbol.slice(0, 2)}</div>}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', margin: 0 }}>{t.symbol}</p>
                            <p style={{ fontSize: 12, color: 'var(--c-muted2)', margin: '2px 0 0' }}>{t.name}</p>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', margin: 0 }}>{balStr}</p>
                            <p style={{ fontSize: 11, color: 'var(--c-muted2)', margin: '2px 0 0' }}>{fiat}</p>
                          </div>
                          {isSelected && <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
                        </button>
                      )
                    })}
                  </div>
                )
              })()}

              {/* FORM */}
              {withdrawPhase === 'form' && withdrawTokenStep === 'form' && (() => {
                const selToken = agentWallet?.tokenList?.find(t => t.symbol === withdrawToken)
                const withdrawBal = withdrawToken === 'USDC' ? agentBalance : parseFloat(selToken?.amount ?? '0')
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'srsStep .25s ease' }}>
                    <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase' as const, color: 'var(--c-muted2)', marginBottom: 10 }}>Amount</p>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                        <input
                          type="number" value={modalAmount} onChange={e => setModalAmount(e.target.value)}
                          placeholder="0.00" min="0.01" step="0.01" autoFocus
                          style={{ width: 180, textAlign: 'center', background: 'transparent', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 48, fontWeight: 700, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }}
                        />
                        <button onClick={() => setWithdrawTokenStep('token')}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)', fontSize: 14, fontWeight: 700, color: 'var(--c-text)', cursor: 'pointer', transition: 'border-color .15s' }}>
                          {selToken?.logoUrl
                            ? <img src={selToken.logoUrl} alt={withdrawToken} style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0 }} />
                            : <span style={{ width: 22, height: 22, borderRadius: '50%', background: withdrawToken === 'USDC' ? '#2775ca' : 'rgba(99,102,241,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{withdrawToken.slice(0, 2)}</span>}
                          {withdrawToken}
                          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .5 }}><path d="M6 9l6 6 6-6" /></svg>
                        </button>
                      </div>
                      <p style={{ fontSize: 12.5, color: 'var(--c-muted2)', marginTop: 8 }}>Balance: {withdrawToken === 'USDC' ? formatUSD(agentBalance) : parseFloat(selToken?.amount ?? '0').toFixed(4)} {withdrawToken}</p>
                      {modalError && <p style={{ fontSize: 12, color: '#fb6f84', marginTop: 5 }}>{modalError}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[['25%', 0.25], ['50%', 0.5], ['75%', 0.75], ['100%', 1]].map(([label, pct]) => (
                        <button key={label as string} onClick={() => setModalAmount((withdrawBal * (pct as number)).toFixed(4).replace(/\.?0+$/, ''))} style={{ flex: 1, height: 38, borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
                      ))}
                    </div>
                    <button
                      onClick={handleWithdraw}
                      style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', background: parseFloat(modalAmount) > 0 ? 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)' : 'rgba(var(--c-fg-rgb),.07)', boxShadow: parseFloat(modalAmount) > 0 ? '0 8px 30px rgba(99,102,241,.42)' : 'none', color: parseFloat(modalAmount) > 0 ? '#fff' : 'var(--c-muted2)', fontSize: 15, fontWeight: 600, cursor: parseFloat(modalAmount) > 0 ? 'pointer' : 'not-allowed', marginTop: 4, transition: 'all .15s' }}
                    >
                      Withdraw {withdrawToken}
                    </button>
                  </div>
                )
              })()}

              {/* PENDING */}
              {withdrawPhase === 'pending' && (
                <div style={{ textAlign: 'center', padding: '16px 0', animation: 'srsStep .25s ease' }}>
                  <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 20px' }}>
                    <svg width={72} height={72} viewBox="0 0 72 72" style={{ animation: 'srsSpin 1s linear infinite' }}>
                      <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(var(--c-fg-rgb),.07)" strokeWidth={5} />
                      <circle cx="36" cy="36" r="30" fill="none" stroke="#6366f1" strokeWidth={5} strokeLinecap="round" strokeDasharray="60 200" />
                    </svg>
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-text)' }}>Processing withdrawal...</p>
                  <p style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 6 }}>Transferring {parseFloat(modalAmount || '0').toFixed(2)} {withdrawToken} → Main Wallet</p>
                </div>
              )}

              {/* SUCCESS */}
              {withdrawPhase === 'success' && withdrawResult && (
                <div style={{ textAlign: 'center', padding: '8px 0', animation: 'srsStep .25s ease' }}>
                  <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'rgba(45,212,191,.12)', border: '1px solid rgba(45,212,191,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', animation: 'srsPop 400ms cubic-bezier(.22,1,.36,1)' }}>
                    <svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p style={{ fontSize: 22, fontWeight: 700, marginTop: 16, color: 'var(--c-text)' }}>Withdrawal Submitted!</p>
                  <p style={{ fontSize: 13.5, color: 'var(--c-muted)', marginTop: 6 }}>-{withdrawResult.amount.toFixed(2)} {withdrawToken} → Main Wallet</p>
                  <p style={{ fontSize: 12, color: 'var(--c-muted2)', marginTop: 4 }}>Will appear in ~30 seconds</p>
                  {withdrawResult.transactionId && (
                    <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 12, background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)', textAlign: 'left' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase' as const, color: 'var(--c-muted2)', marginBottom: 4 }}>Transaction ID</p>
                      <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--c-indigo-light)', wordBreak: 'break-all' }}>{withdrawResult.transactionId}</p>
                    </div>
                  )}
                  <button onClick={closeWithdrawModal} style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', boxShadow: '0 8px 30px rgba(99,102,241,.42)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 20 }}>
                    Done
                  </button>
                </div>
              )}

              {/* ERROR */}
              {withdrawPhase === 'error' && withdrawResult && (
                <div style={{ animation: 'srsStep .25s ease' }}>
                  <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(251,111,132,.1)', border: '1px solid rgba(251,111,132,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                      <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#fb6f84" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </div>
                    <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)' }}>Withdrawal Failed</p>
                  </div>
                  <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(251,111,132,.08)', border: '1px solid rgba(251,111,132,.2)', marginBottom: 16 }}>
                    <p style={{ fontSize: 13, color: '#fb6f84' }}>{withdrawResult.error}</p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button onClick={closeWithdrawModal} style={{ height: 52, borderRadius: 14, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => { setWithdrawPhase('form'); setWithdrawResult(null) }} style={{ height: 52, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', boxShadow: '0 8px 30px rgba(99,102,241,.42)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── LIMIT MODAL ── */}
      {showLimit && (
        <div
          onClick={limitPhase === 'form' ? closeLimitModal : undefined}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(6,4,16,.66)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'srsScrim .2s ease' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 432, maxWidth: '94vw', maxHeight: '90vh', borderRadius: 22, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.14)', boxShadow: '0 30px 80px rgba(3,8,20,.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'srsUp 340ms cubic-bezier(.22,1,.36,1)' }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid rgba(var(--c-fg-rgb),.07)', flexShrink: 0 }}>
              <div style={{ width: 34 }} />
              <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: 'var(--c-text)', textAlign: 'center', marginRight: 34 }}>Daily Spending Limit</span>
              {limitPhase !== 'pending'
                ? <button onClick={closeLimitModal} style={{ display: 'flex', width: 34, height: 34, alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(var(--c-fg-rgb),.07)', background: 'rgba(var(--c-fg-rgb),.05)', borderRadius: 10, color: 'var(--c-muted)', cursor: 'pointer', flexShrink: 0 }}>
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                : <div style={{ width: 34 }} />}
            </div>

            <div className="srs-pad" style={{ flex: 1, overflowY: 'auto', padding: '22px 20px' }}>

              {/* FORM */}
              {limitPhase === 'form' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'srsStep .25s ease' }}>
                  <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase' as const, color: 'var(--c-muted2)', marginBottom: 10 }}>Max per day</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                      <input
                        type="number" value={modalLimit} onChange={e => setModalLimit(e.target.value)}
                        placeholder="0.00" min="0.01" step="0.01" autoFocus
                        style={{ width: 180, textAlign: 'center', background: 'transparent', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 48, fontWeight: 700, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }}
                      />
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)', fontSize: 14, fontWeight: 700, color: 'var(--c-text)' }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#2775ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff', flexShrink: 0 }}>US</span>
                        USDC
                      </span>
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--c-muted2)', marginTop: 8 }}>Current: {formatUSD(agentWallet?.daily_limit ?? 5)} USDC / day</p>
                    {modalError && <p style={{ fontSize: 12, color: '#fb6f84', marginTop: 5 }}>{modalError}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['1', '5', '10', '50'].map(v => (
                      <button key={v} onClick={() => setModalLimit(v)} style={{ flex: 1, height: 38, borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{v}</button>
                    ))}
                  </div>
                  <button
                    onClick={handleSetLimit}
                    style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', background: parseFloat(modalLimit) > 0 ? 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)' : 'rgba(var(--c-fg-rgb),.07)', boxShadow: parseFloat(modalLimit) > 0 ? '0 8px 30px rgba(99,102,241,.42)' : 'none', color: parseFloat(modalLimit) > 0 ? '#fff' : 'var(--c-muted2)', fontSize: 15, fontWeight: 600, cursor: parseFloat(modalLimit) > 0 ? 'pointer' : 'not-allowed', marginTop: 4, transition: 'all .15s' }}
                  >
                    Save on-chain
                  </button>
                </div>
              )}

              {/* PENDING */}
              {limitPhase === 'pending' && (
                <div style={{ textAlign: 'center', padding: '16px 0', animation: 'srsStep .25s ease' }}>
                  <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 20px' }}>
                    <svg width={72} height={72} viewBox="0 0 72 72" style={{ animation: 'srsSpin 1s linear infinite' }}>
                      <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(var(--c-fg-rgb),.07)" strokeWidth={5} />
                      <circle cx="36" cy="36" r="30" fill="none" stroke="#6366f1" strokeWidth={5} strokeLinecap="round" strokeDasharray="60 200" />
                    </svg>
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-text)' }}>Writing to blockchain...</p>
                  <p style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 6 }}>Setting limit to {parseFloat(modalLimit || '0').toFixed(2)} USDC on ARC Testnet</p>
                </div>
              )}

              {/* SUCCESS */}
              {limitPhase === 'success' && limitResult && (
                <div style={{ textAlign: 'center', padding: '8px 0', animation: 'srsStep .25s ease' }}>
                  <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'rgba(45,212,191,.12)', border: '1px solid rgba(45,212,191,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', animation: 'srsPop 400ms cubic-bezier(.22,1,.36,1)' }}>
                    <svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p style={{ fontSize: 22, fontWeight: 700, marginTop: 16, color: 'var(--c-text)' }}>Limit Updated!</p>
                  <p style={{ fontSize: 13.5, color: 'var(--c-muted)', marginTop: 6 }}>{limitResult.daily_limit.toFixed(2)} USDC / day</p>
                  <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 12, background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: 'var(--c-muted2)' }}>Stored</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: limitResult.onChain ? '#2dd4bf' : '#f59e0b' }}>
                        {limitResult.onChain ? '✓ On-chain' : '⚠ Database only'}
                      </span>
                    </div>
                    {limitResult.txHash && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: 'var(--c-muted2)' }}>Transaction</span>
                        <a href={`https://testnet.arcscan.app/tx/${limitResult.txHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--c-indigo-light)', textDecoration: 'none' }}>
                          {limitResult.txHash.slice(0, 10)}...{limitResult.txHash.slice(-8)} ↗
                        </a>
                      </div>
                    )}
                  </div>
                  <button onClick={closeLimitModal} style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', boxShadow: '0 8px 30px rgba(99,102,241,.42)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 20 }}>
                    Done
                  </button>
                </div>
              )}

              {/* ERROR */}
              {limitPhase === 'error' && limitResult && (
                <div style={{ animation: 'srsStep .25s ease' }}>
                  <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(251,111,132,.1)', border: '1px solid rgba(251,111,132,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                      <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#fb6f84" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </div>
                    <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)' }}>Failed to update limit</p>
                  </div>
                  <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(251,111,132,.08)', border: '1px solid rgba(251,111,132,.2)', marginBottom: 16 }}>
                    <p style={{ fontSize: 13, color: '#fb6f84' }}>{limitResult.error}</p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button onClick={closeLimitModal} style={{ height: 52, borderRadius: 14, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => setLimitPhase('form')} style={{ height: 52, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', boxShadow: '0 8px 30px rgba(99,102,241,.42)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── AGENT INFO MODAL ── */}
      {showAgentInfo && (
        <div
          onClick={() => setShowAgentInfo(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(6,4,16,.66)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'srsScrim .2s ease' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 432, maxWidth: '94vw', maxHeight: '90vh', borderRadius: 22, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.14)', boxShadow: '0 30px 80px rgba(3,8,20,.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'srsUp 340ms cubic-bezier(.22,1,.36,1)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid rgba(var(--c-fg-rgb),.07)', flexShrink: 0 }}>
              <div style={{ width: 34 }} />
              <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: 'var(--c-text)', textAlign: 'center', marginRight: 34 }}>Miron Agent</span>
              <button onClick={() => setShowAgentInfo(false)} style={{ display: 'flex', width: 34, height: 34, alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(var(--c-fg-rgb),.07)', background: 'rgba(var(--c-fg-rgb),.05)', borderRadius: 10, color: 'var(--c-muted)', cursor: 'pointer', flexShrink: 0 }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="srs-pad" style={{ flex: 1, overflowY: 'auto', padding: '22px 20px' }}>
              <div style={{ textAlign: 'center', padding: '4px 0 18px' }}>
                <div style={{ margin: '0 auto 14px', width: 72, display: 'flex', justifyContent: 'center' }}>
                  <AgentAvatar size={72} glow showStatusDot={false} />
                </div>
                <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>Miron Agent <VerifiedBadge size="md" source="ARC" /></p>
                <p style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>Registered on-chain · ERC-8004 · ARC Testnet</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--c-muted2)' }}>Agent ID</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--c-text)' }}>{agentIdentity ? `#${agentIdentity.agent_id}` : '—'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--c-muted2)' }}>Status</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: agentIdentity ? '#2dd4bf' : '#f59e0b' }}>{agentIdentity ? '✓ On-chain' : 'Not registered'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--c-muted2)' }}>Network</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text)' }}>ARC Testnet</span>
                  </div>
                  {agentWallet?.wallet_address && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: 'var(--c-muted2)' }}>Wallet</span>
                      <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--c-text)' }}>{agentWallet.wallet_address.slice(0, 6)}...{agentWallet.wallet_address.slice(-4)}</span>
                    </div>
                  )}
                  {agentIdentity?.tx_hash && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: 'var(--c-muted2)' }}>Registration tx</span>
                      <a href={`https://testnet.arcscan.app/tx/${agentIdentity.tx_hash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--c-indigo-light)', textDecoration: 'none' }}>
                        {agentIdentity.tx_hash.slice(0, 10)}...{agentIdentity.tx_hash.slice(-8)} ↗
                      </a>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)', textAlign: 'center' as const }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-text)' }}>{agentTxSuccessCount}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 2 }}>Successful tx</div>
                  </div>
                  <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)', textAlign: 'center' as const }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-text)' }}>${formatUSD(agentWallet?.daily_limit ?? 5)}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 2 }}>Daily limit</div>
                  </div>
                </div>

                {/* On-chain reputation (ERC-8004 ReputationRegistry) */}
                <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(45,212,191,.06)', border: '1px solid rgba(45,212,191,.18)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase' as const, color: 'var(--c-muted2)', marginBottom: 10 }}>On-chain reputation</p>
                  {!reputationChecked ? (
                    <p style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>Reading ReputationRegistry...</p>
                  ) : reputation ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 24, fontWeight: 700, color: '#2dd4bf', fontVariantNumeric: 'tabular-nums' }}>{reputation.totalScore}</span>
                        <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>score · {reputation.totalFeedback} feedback entries</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {Object.entries(reputation.byTag).map(([tag, d]) => (
                          <div key={tag} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{tag} ({d.count})</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text)' }}>+{d.score}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>No feedback recorded on-chain yet</p>
                  )}
                </div>
              </div>

              <button onClick={() => setShowAgentInfo(false)} style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', boxShadow: '0 8px 30px rgba(99,102,241,.42)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 20 }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}