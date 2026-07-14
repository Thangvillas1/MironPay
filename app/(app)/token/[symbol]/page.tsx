'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { isOnboardingComplete } from '@/app/lib/onboarding'
import { useWalletStore } from '@/app/store/wallet'
import { mergeWithLocalTransactions } from '@/app/lib/local-tx'
import PriceChart from '@/app/components/PriceChart'
import TransactionDetailModal from '@/app/components/TransactionDetailModal'
import VerifiedBadge from '@/app/components/VerifiedBadge'
import SRSModal, { type ModalMode } from '@/app/components/SRSModal'
import type { Transaction } from '@/app/lib/types'

type Period = '1D' | '1W' | '1M' | '3M' | '1Y'
const PERIODS: Period[] = ['1D', '1W', '1M', '3M', '1Y']

interface MetaData {
  found: boolean
  symbol: string
  name?: string
  logoUrl?: string | null
  price?: number | null
  change24h?: number | null
  marketCap?: number | null
  volume24h?: number | null
  circulatingSupply?: number | null
}

function formatUSD(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(n)
}

function formatSupply(n: number, symbol: string) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ${symbol}`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ${symbol}`
  return `${n.toLocaleString()} ${symbol}`
}

function formatTokenAmount(amount: string) {
  return parseFloat(parseFloat(amount).toFixed(6)).toString()
}

function TokenLogoImg({ symbol, logoUrl }: { symbol: string; logoUrl?: string | null }) {
  const [error, setError] = useState(false)
  if (!logoUrl || error) {
    return (
      <div className="w-12 h-12 rounded-full bg-mp-primary/20 border border-mp-primary/30 flex items-center justify-center shrink-0">
        <span className="text-base font-bold text-mp-primary">{symbol.slice(0, 2)}</span>
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt={symbol} width={48} height={48} className="w-12 h-12 rounded-full object-cover shrink-0" onError={() => setError(true)} />
  )
}

export default function TokenDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params)
  const upperSymbol = symbol.toUpperCase()
  const router = useRouter()

  const { transactions, tokenList, walletAddress,
    setWallet, setTransactions, setTokenList, setWalletAddress } = useWalletStore()
  const tokenBalance = tokenList.find((t) => t.symbol === upperSymbol)

  const [period, setPeriod] = useState<Period>('1D')
  const [meta, setMeta] = useState<MetaData | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [chartData, setChartData] = useState<[number, number][] | null>(null)
  const [loadingChart, setLoadingChart] = useState(true)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)

  const [accessToken, setAccessToken] = useState('')
  const [username, setUsername] = useState<string | null>(null)
  const [hasPIN, setHasPIN] = useState(false)
  const [srsMode, setSrsMode] = useState<ModalMode>(null)

  const tokenTransactions = transactions.filter((tx) => tx.tokenSymbol === upperSymbol)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/'); return }
      if (!(await isOnboardingComplete(data.session.user.id))) { router.replace('/'); return }
      setAccessToken(data.session.access_token)
      const { data: profile } = await supabase
        .from('profiles').select('username, pin_hash').eq('id', data.session.user.id).single()
      setUsername(profile?.username ?? null)
      setHasPIN(!!profile?.pin_hash)
    })
  }, [router])

  function refreshWallet() {
    if (!accessToken) return
    fetch('/api/wallet', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.json())
      .then(d => {
        setWallet({ id: d.circleWalletId, balance: d.balance, currency: d.currency })
        setTransactions(mergeWithLocalTransactions((d.transactions ?? []) as Transaction[]))
        setTokenList(d.tokenList ?? [])
        setWalletAddress(d.walletAddress)
      })
      .catch(() => {})
  }

  useEffect(() => {
    setLoadingMeta(true)
    fetch(`/api/token/${upperSymbol}`)
      .then((r) => r.json())
      .then((d) => setMeta(d))
      .catch(() => setMeta({ found: false, symbol: upperSymbol }))
      .finally(() => setLoadingMeta(false))
  }, [upperSymbol])

  useEffect(() => {
    setLoadingChart(true)
    setChartData(null)
    fetch(`/api/token/${upperSymbol}/chart?period=${period}`)
      .then((r) => r.json())
      .then((d) => setChartData(d.chartData ?? null))
      .catch(() => setChartData(null))
      .finally(() => setLoadingChart(false))
  }, [upperSymbol, period])

  const isPositive = (meta?.change24h ?? 0) >= 0
  const hasChart = !loadingChart && (chartData?.length ?? 0) >= 2

  return (
    <div className="min-h-screen bg-mp-bg max-w-lg mx-auto flex flex-col pb-20">

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4 border-b border-white/8">
        <button onClick={() => router.back()} className="text-mp-muted hover:text-mp-text p-1 -ml-1 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-base font-semibold text-mp-text">{upperSymbol}</span>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* Token header */}
        <div className="bg-mp-card border-b border-white/8 px-4 pt-5 pb-5">
          <div className="flex items-center gap-3 mb-4">
            <TokenLogoImg symbol={upperSymbol} logoUrl={meta?.logoUrl} />
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-base font-semibold text-mp-text">
                  {loadingMeta ? upperSymbol : (meta?.name ?? upperSymbol)}
                </p>
                {!loadingMeta && meta?.found && <VerifiedBadge size="md" source="CoinGecko" />}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <p className="text-sm text-mp-muted">{upperSymbol}</p>
                {!loadingMeta && meta?.found && (
                  <span className="text-xs text-mp-primary font-medium">· Verified</span>
                )}
              </div>
            </div>
            {!loadingMeta && meta?.found && meta.price != null && (
              <div className="ml-auto text-right">
                <p className="text-xl font-bold text-mp-text">{formatUSD(meta.price)}</p>
                {meta.change24h != null && (
                  <p className={`text-sm font-medium ${isPositive ? 'text-mp-success' : 'text-mp-danger'}`}>
                    {isPositive ? '+' : ''}{meta.change24h.toFixed(2)}%
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Chart area */}
          {loadingChart && (
            <div className="h-40 flex items-center justify-center">
              <p className="text-sm text-mp-muted animate-pulse">Loading chart...</p>
            </div>
          )}
          {!loadingChart && hasChart && (
            <div className="mb-3">
              <PriceChart data={chartData!} isPositive={isPositive} period={period} />
            </div>
          )}
          {!loadingChart && !hasChart && (
            <div className="h-20 flex items-center justify-center">
              <p className="text-xs text-mp-muted/50">No chart data</p>
            </div>
          )}

          {/* Period selector */}
          <div className="flex gap-1 mt-2">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                disabled={loadingChart}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-[6px] transition-colors disabled:opacity-50 ${
                  period === p ? 'bg-mp-primary text-white' : 'bg-white/5 text-mp-muted hover:bg-white/10 hover:text-mp-text'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* User balance */}
        <div className="mx-4 mt-4 bg-mp-card border border-white/8 rounded-[12px] p-4">
          <p className="text-xs text-mp-muted uppercase tracking-widest mb-3">Your balance</p>
          {tokenBalance ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-mp-text">
                  {formatTokenAmount(tokenBalance.amount)} {upperSymbol}
                </p>
                {tokenBalance.usdValue != null && (
                  <p className="text-sm text-mp-muted mt-0.5">{formatUSD(tokenBalance.usdValue)}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-base text-mp-muted">0 {upperSymbol}</p>
          )}
        </div>

        {/* Market info */}
        {!loadingMeta && meta?.found && (meta?.marketCap || meta?.volume24h || meta?.circulatingSupply) && (
          <div className="mx-4 mt-3 bg-mp-card border border-white/8 rounded-[12px] p-4">
            <p className="text-xs text-mp-muted uppercase tracking-widest mb-3">Market info</p>
            <div className="flex flex-col gap-3">
              {meta.marketCap != null && (
                <div className="flex justify-between">
                  <span className="text-sm text-mp-muted">Market cap</span>
                  <span className="text-sm font-medium text-mp-text">{formatUSD(meta.marketCap)}</span>
                </div>
              )}
              {meta.volume24h != null && (
                <div className="flex justify-between">
                  <span className="text-sm text-mp-muted">24h volume</span>
                  <span className="text-sm font-medium text-mp-text">{formatUSD(meta.volume24h)}</span>
                </div>
              )}
              {meta.circulatingSupply != null && (
                <div className="flex justify-between">
                  <span className="text-sm text-mp-muted">Circulating supply</span>
                  <span className="text-sm font-medium text-mp-text">{formatSupply(meta.circulatingSupply, upperSymbol)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mx-4 mt-4 grid grid-cols-3 gap-2">
          <button
            onClick={() => setSrsMode('send')}
            className="bg-mp-primary text-white rounded-[10px] py-3.5 text-sm font-semibold hover:bg-blue-600 active:bg-blue-700 transition-colors"
          >
            Send
          </button>
          <button
            onClick={() => setSrsMode('receive')}
            className="bg-white/5 border border-white/8 rounded-[10px] py-3.5 text-sm font-semibold text-mp-text hover:bg-white/10 transition-colors"
          >
            Receive
          </button>
          <button
            onClick={() => setSrsMode('swap')}
            className="bg-white/5 border border-white/8 rounded-[10px] py-3.5 text-sm font-semibold text-mp-text hover:bg-white/10 transition-colors"
          >
            Swap
          </button>
        </div>

        {/* Transaction history inline */}
        <div className="mx-4 mt-4 mb-4 bg-mp-card border border-white/8 rounded-[12px] overflow-hidden">
          <p className="text-xs font-semibold text-mp-muted px-4 py-3 border-b border-white/8 uppercase tracking-widest">
            Transaction history
          </p>
          {tokenTransactions.length === 0 ? (
            <p className="text-sm text-mp-muted px-4 py-8 text-center">No transactions yet</p>
          ) : (
            <ul className="divide-y divide-white/8">
              {tokenTransactions.map((tx) => (
                <li
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-white/5 active:bg-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${tx.type === 'credit' ? 'bg-mp-success/15' : 'bg-white/8'}`}>
                      <span className={`text-base ${tx.type === 'credit' ? 'text-mp-success' : 'text-mp-muted'}`}>
                        {tx.type === 'credit' ? '↓' : '↑'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-mp-text">{tx.description}</span>
                      <span className="text-xs text-mp-muted">
                        {new Date(tx.created_at).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={`text-sm font-semibold ${tx.type === 'credit' ? 'text-mp-success' : 'text-mp-danger'}`}>
                      {tx.type === 'credit' ? '+' : '-'}{parseFloat(tx.amount.toFixed(6))} {tx.tokenSymbol}
                    </span>
                    {tx.state && <span className="text-xs text-mp-muted">{tx.state}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {selectedTx && (
        <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
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
        onSuccess={refreshWallet}
        initialSwapSymbol={upperSymbol}
      />
    </div>
  )
}
