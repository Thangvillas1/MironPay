'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { isOnboardingComplete } from '@/app/lib/onboarding'
import { useWalletStore } from '@/app/store/wallet'
import { useUiStore } from '@/app/store/ui'
import { addLocalTransaction } from '@/app/lib/local-tx'
import { TokenPriceChart } from '@/app/components/TokenPriceChart'
import { TypewriterText } from '@/app/components/TypewriterText'
import { SentimentMeter } from '@/app/components/SentimentMeter'
import { TrendingTable } from '@/app/components/TrendingTable'
import { DefiDataCard } from '@/app/components/DefiDataCard'
import { StablecoinDataCard } from '@/app/components/StablecoinDataCard'
import { WalletLookupCard } from '@/app/components/WalletLookupCard'
import { DexPairCard } from '@/app/components/DexPairCard'
import { SwapQuoteCard } from '@/app/components/SwapQuoteCard'
import { AgentPinModal } from '@/app/components/AgentPinModal'

interface AgentWallet {
  balance: number
  wallet_address: string | null
  daily_limit: number
  daily_spent: number
  msg_cost: number
}

interface TxAction {
  type: 'send' | 'swap' | 'gateway_deposit' | 'gateway_withdraw'
  to?: string
  amount: string
  token?: string
  tokenIn?: string
  tokenOut?: string
  walletSource?: 'agent' | 'main'
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  cost?: number
  inputFeeTxHash?: string | null
  time: string
  action?: TxAction | null
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
  dexPair?: {
    query: string
    pairs: Array<{ chain: string; dex: string; pairLabel: string; priceUsd: number; liquidityUsd: number; volume24hUsd: number; change24hPct: number | null; url: string }>
  } | null
  swapQuote?: { chain: string; tokenInSymbol: string; tokenOutSymbol: string; amountIn: number; amountInUsd: number | null; amountOutUsd: number | null; gasUsd: number | null; route: string[] } | null
  animate?: boolean
}

const MSG_COST = 0.01 // must match app/api/agent/chat/route.ts — this is what's actually charged per message

function formatUSDC(n: number) {
  return parseFloat(n.toFixed(4)).toString()
}

function truncateAddr(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`
}

function ActionCard({ action, onConfirm, onCancel, done, error, executing, txResult }: {
  action: TxAction
  onConfirm: () => void
  onCancel: () => void
  done: boolean
  error: string
  executing: boolean
  txResult?: { txHash?: string; transactionId?: string; amountOut?: string } | null
}) {
  const isSend = action.type === 'send'
  const isSwap = action.type === 'swap'
  const isGatewayDeposit = action.type === 'gateway_deposit'
  const isGatewayWithdraw = action.type === 'gateway_withdraw'
  const isMain = action.walletSource === 'main'

  if (done) return (
    <div className="mt-2 bg-mp-card border border-white/12 rounded-[12px] overflow-hidden w-full max-w-[280px]">
      {/* Success header */}
      <div className="px-4 py-3 bg-mp-success/10 border-b border-mp-success/20 flex items-center gap-2">
        <div className="w-5 h-5 bg-mp-success/20 rounded-full flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-mp-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
        </div>
        <span className="text-xs font-semibold text-mp-success">
          {isSend ? 'Transfer Successful' : isSwap ? 'Swap Successful' : isGatewayDeposit ? 'X402 Deposit Successful' : 'X402 Withdrawal Successful'}
        </span>
      </div>
      {/* Tx details */}
      <div className="px-4 py-3 flex flex-col gap-2">
        {isSend && (
          <>
            <div className="flex justify-between text-xs">
              <span className="text-mp-muted">Sent</span>
              <span className="font-semibold text-mp-danger">-{action.amount} {action.token ?? 'USDC'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-mp-muted">To</span>
              <span className="font-semibold text-mp-text">{action.to}</span>
            </div>
          </>
        )}
        {isSwap && (
          <>
            <div className="flex justify-between text-xs">
              <span className="text-mp-muted">You paid</span>
              <span className="font-semibold text-mp-danger">-{action.amount} {action.tokenIn}</span>
            </div>
            {txResult?.amountOut && (
              <div className="flex justify-between text-xs">
                <span className="text-mp-muted">You received</span>
                <span className="font-semibold text-mp-success">+{txResult.amountOut} {action.tokenOut}</span>
              </div>
            )}
          </>
        )}
        {(isGatewayDeposit || isGatewayWithdraw) && (
          <div className="flex justify-between text-xs">
            <span className="text-mp-muted">{isGatewayDeposit ? 'Deposited' : 'Withdrawn'}</span>
            <span className={`font-semibold ${isGatewayDeposit ? 'text-mp-danger' : 'text-mp-success'}`}>
              {isGatewayDeposit ? '-' : '+'}{action.amount} USDC
            </span>
          </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-mp-muted">Network</span>
          <span className="text-mp-text">ARC Testnet</span>
        </div>
        {txResult?.txHash ? (
          <a
            href={`https://testnet.arcscan.app/tx/${txResult.txHash}`}
            target="_blank" rel="noopener noreferrer"
            className="mt-1 flex items-center justify-between bg-mp-primary/10 border border-mp-primary/20 rounded-[8px] px-3 py-2 hover:bg-mp-primary/15 transition-colors"
          >
            <div>
              <p className="text-[10px] font-medium text-mp-primary">View on ARC Explorer</p>
              <p className="text-[10px] font-mono text-mp-primary/60 mt-0.5">{txResult.txHash.slice(0,12)}...{txResult.txHash.slice(-8)}</p>
            </div>
            <svg className="w-3.5 h-3.5 text-mp-primary ml-2 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          </a>
        ) : txResult?.transactionId ? (
          <div className="mt-1 bg-white/5 border border-white/8 rounded-[8px] px-3 py-2">
            <p className="text-[10px] text-mp-muted">Transaction ID</p>
            <p className="text-[10px] font-mono text-mp-text break-all mt-0.5">{txResult.transactionId}</p>
          </div>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className="mt-2 bg-mp-card border border-white/12 rounded-[12px] overflow-hidden w-full max-w-[280px]">
      <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
        <div className="w-7 h-7 bg-mp-primary/20 rounded-full flex items-center justify-center shrink-0">
          {isSend
            ? <svg className="w-3.5 h-3.5 text-mp-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            : isSwap
            ? <svg className="w-3.5 h-3.5 text-mp-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
            : <svg className="w-3.5 h-3.5 text-mp-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M2 12h20"/></svg>
          }
        </div>
        <span className="text-xs font-semibold text-mp-text">
          {isSend ? 'Confirm Transfer' : isSwap ? 'Confirm Swap' : isGatewayDeposit ? 'Confirm X402 Deposit' : isGatewayWithdraw ? 'Confirm X402 Withdrawal' : 'Confirm Contribution'}
        </span>
      </div>
      <div className="px-4 py-3 flex flex-col gap-2">
        {isSend && (
          <>
            <div className="flex justify-between text-xs">
              <span className="text-mp-muted">Amount</span>
              <span className="font-semibold text-mp-text">{action.amount} {action.token ?? 'USDC'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-mp-muted">Recipient</span>
              <span className="font-semibold text-mp-text">{action.to}</span>
            </div>
          </>
        )}
        {isSwap && (
          <>
            <div className="flex justify-between text-xs">
              <span className="text-mp-muted">You pay</span>
              <span className="font-semibold text-mp-text">{action.amount} {action.tokenIn}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-mp-muted">You receive</span>
              <span className="font-semibold text-mp-primary">~ {action.tokenOut}</span>
            </div>
          </>
        )}
        {(isGatewayDeposit || isGatewayWithdraw) && (
          <div className="flex justify-between text-xs">
            <span className="text-mp-muted">Amount</span>
            <span className="font-semibold text-mp-text">{action.amount} USDC</span>
          </div>
        )}
        {error && <p className="text-[11px] text-mp-danger">{error}</p>}
      </div>
      <div className="px-4 pb-3">
        {executing ? (
          <div className="flex items-center gap-2 text-xs text-mp-muted">
            <span className="w-3 h-3 border-2 border-mp-primary/40 border-t-mp-primary rounded-full animate-spin shrink-0" />
            Executing...
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {error && <p className="text-xs text-mp-danger">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => onConfirm()}
                className={`flex-1 text-white rounded-[8px] py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${isMain ? 'bg-amber-500 hover:bg-amber-600' : 'bg-mp-primary hover:bg-blue-600'}`}>
                {isMain && <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><rect x="3" y="11" width="18" height="11" rx="2"/><path strokeLinecap="round" d="M7 11V7a5 5 0 0110 0v4"/></svg>}
                {isMain ? 'Confirm + PIN' : 'Confirm'}
              </button>
              <button onClick={onCancel}
                className="flex-1 bg-white/5 border border-white/8 text-mp-muted rounded-[8px] py-2 text-xs font-semibold hover:bg-white/10 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface DepositResult { transactionId?: string; deposited?: number; error?: string }

function DepositModal({ onClose, onDeposit }: { onClose: () => void; onDeposit: (amount: string) => Promise<DepositResult> }) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [phase, setPhase] = useState<'form' | 'pending' | 'success' | 'error'>('form')
  const [result, setResult] = useState<DepositResult | null>(null)
  const canSubmit = parseFloat(amount || '0') > 0 && phase === 'form'

  async function handle() {
    if (!canSubmit) { setError('Enter a valid amount'); return }
    setPhase('pending'); setError('')
    const res = await onDeposit(amount)
    if (res.error) { setResult(res); setPhase('error') }
    else { setResult(res); setPhase('success') }
  }

  // ── Success screen ──
  if (phase === 'success' && result) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-sm rounded-[16px] overflow-hidden flex flex-col" style={{ background: 'var(--c-wallet-main)', border: '1px solid #1a56db' }}>
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.15)' }}>
                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-base font-semibold text-white">Deposit Successful!</p>
            </div>
            <div className="rounded-[12px] px-4 py-3 flex flex-col gap-3" style={{ background: 'rgba(var(--c-fg-rgb),0.04)', border: '1px solid rgba(var(--c-fg-rgb),0.08)' }}>
              <div className="flex justify-between">
                <span className="text-sm" style={{ color: 'var(--c-muted)' }}>Amount</span>
                <span className="text-sm font-semibold text-white">+{(result.deposited ?? parseFloat(amount)).toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm" style={{ color: 'var(--c-muted)' }}>Destination</span>
                <span className="text-sm font-semibold text-white">Agent Wallet</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--c-muted)' }}>Funds will appear in ~30 seconds</p>
            </div>
            {result.transactionId && (
              <div className="flex items-center justify-between px-4 py-3 rounded-[12px]"
                style={{ background: 'rgba(26,86,219,0.1)', border: '1px solid rgba(26,86,219,0.25)' }}>
                <div>
                  <p className="text-xs font-medium" style={{ color: '#60a5fa' }}>Transaction ID</p>
                  <p className="text-xs font-mono mt-0.5 break-all" style={{ color: '#3b82f6' }}>{result.transactionId}</p>
                </div>
              </div>
            )}
            <button onClick={onClose}
              className="w-full py-3.5 rounded-[12px] text-sm font-bold text-white"
              style={{ background: '#1a56db', boxShadow: '0 0 20px rgba(26,86,219,0.3)' }}>
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={phase === 'form' ? onClose : undefined}>
      <div
        className="w-full max-w-sm rounded-[20px] flex flex-col overflow-hidden"
        style={{ background: 'var(--c-wallet-main)', border: '1px solid #1a56db' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          {phase !== 'pending'
            ? <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1 -ml-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            : <div className="w-7" />
          }
          <h2 className="text-base font-bold text-white">Fund Agent Wallet</h2>
          <div className="w-7" />
        </div>

        {/* ── FORM ── */}
        {phase === 'form' && (
          <>
            <div className="overflow-y-auto flex-1 px-5 pb-2 flex flex-col gap-4">
              {/* Amount row */}
              <div className="flex flex-col pt-3 pb-1">
                <div className="flex items-center gap-3 w-full px-2">
                  <div className="w-10 h-10 rounded-full shrink-0 overflow-hidden flex items-center justify-center"
                    style={{ background: 'rgba(26,86,219,0.2)', border: '1px solid rgba(26,86,219,0.3)' }}>
                    <span className="text-sm font-bold" style={{ color: '#60a5fa' }}>US</span>
                  </div>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    min="0.01"
                    step="0.01"
                    autoFocus
                    className="flex-1 min-w-0 text-4xl font-light text-white bg-transparent outline-none"
                  />
                  <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--c-muted)' }}>USDC</span>
                </div>
                <p className="text-sm mt-2 pl-14" style={{ color: 'var(--c-muted)' }}>{MSG_COST} USDC / message</p>
                {error && <p className="text-xs mt-1 pl-14" style={{ color: '#ef4444' }}>{error}</p>}
              </div>

              {/* Quick amount buttons */}
              <div className="flex gap-2">
                {['1', '2', '5', '10'].map(v => (
                  <button key={v} type="button"
                    onClick={() => setAmount(v)}
                    className="flex-1 py-2 rounded-[8px] text-xs font-semibold transition-all hover:bg-white/[0.08]"
                    style={{ background: 'rgba(var(--c-fg-rgb),0.05)', border: '1px solid rgba(var(--c-fg-rgb),0.1)', color: 'var(--c-text)' }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pt-3 pb-5 shrink-0" style={{ borderTop: '1px solid rgba(var(--c-fg-rgb),0.06)' }}>
              <button
                onClick={handle}
                disabled={!canSubmit}
                className="w-full py-3.5 rounded-[12px] text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: canSubmit ? '#1a56db' : 'rgba(26,86,219,0.4)', boxShadow: canSubmit ? '0 0 20px rgba(26,86,219,0.35)' : 'none' }}>
                Deposit USDC
              </button>
            </div>
          </>
        )}

        {/* ── PENDING ── */}
        {phase === 'pending' && (
          <div className="flex flex-col items-center gap-4 px-5 pb-8 pt-4">
            <div className="w-10 h-10 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(26,86,219,0.3)', borderTopColor: '#1a56db' }} />
            <div className="text-center">
              <p className="text-sm font-semibold text-white">Processing deposit...</p>
              <p className="text-xs mt-1" style={{ color: 'var(--c-muted)' }}>Transferring {parseFloat(amount || '0').toFixed(2)} USDC → Agent Wallet</p>
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {phase === 'error' && result && (
          <>
            <div className="px-5 pb-2 flex flex-col gap-4">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </div>
                <p className="text-base font-semibold text-white">Deposit Failed</p>
              </div>
              <div className="rounded-[12px] px-4 py-3 flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 8v4m0 4h.01" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-red-300 break-words">{result.error}</p>
                </div>
              </div>
            </div>
            <div className="px-5 pt-3 pb-5 shrink-0" style={{ borderTop: '1px solid rgba(var(--c-fg-rgb),0.06)' }}>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={onClose}
                  className="py-3.5 rounded-[12px] text-sm font-medium transition-colors hover:bg-white/[0.08]"
                  style={{ background: 'rgba(var(--c-fg-rgb),0.05)', border: '1px solid rgba(var(--c-fg-rgb),0.1)', color: 'var(--c-muted)' }}>
                  Cancel
                </button>
                <button onClick={() => { setPhase('form'); setResult(null) }}
                  className="py-3.5 rounded-[12px] text-sm font-bold text-white transition-all hover:brightness-110"
                  style={{ background: '#1a56db' }}>
                  Try again
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface LimitSaveResult {
  daily_limit: number
  onChain: boolean
  txHash?: string | null
  error?: string
}

function LimitModal({ current, onClose, onSave }: {
  current: number
  onClose: () => void
  onSave: (v: string) => Promise<LimitSaveResult>
}) {
  const [value, setValue] = useState(current.toString())
  const [phase, setPhase] = useState<'form' | 'pending' | 'success' | 'error'>('form')
  const [result, setResult] = useState<LimitSaveResult | null>(null)

  async function handle() {
    const num = parseFloat(value)
    if (isNaN(num) || num < 0.01) return
    setPhase('pending')
    try {
      const res = await onSave(value)
      if (res.error) {
        setResult(res)
        setPhase('error')
      } else {
        setResult(res)
        setPhase('success')
      }
    } catch (e) {
      setResult({ daily_limit: num, onChain: false, error: e instanceof Error ? e.message : 'Unknown error' })
      setPhase('error')
    }
  }

  const ARC_EXPLORER = 'https://testnet.arcscan.app'

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={phase === 'form' ? onClose : undefined}>
      <div className="bg-mp-card border border-white/8 w-full sm:max-w-sm rounded-t-[16px] sm:rounded-[16px] p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-mp-text">Spending Limit</h2>
          {phase !== 'pending' && (
            <button onClick={onClose} className="text-mp-muted hover:text-mp-text text-xl">×</button>
          )}
        </div>

        {/* FORM */}
        {phase === 'form' && (
          <>
            <p className="text-xs text-mp-muted">Maximum USDC the Agent can spend per day. Saved on-chain.</p>
            <input
              type="number"
              value={value}
              onChange={e => setValue(e.target.value)}
              min="0.01"
              step="0.01"
              autoFocus
              className="w-full bg-white/5 border border-white/15 rounded-[8px] px-3 py-3 text-sm text-mp-text focus:outline-none focus:ring-2 focus:ring-mp-primary/40"
            />
            <button onClick={handle}
              className="w-full bg-mp-primary text-white rounded-[10px] py-3.5 text-sm font-semibold hover:bg-blue-600 transition-colors">
              Save on-chain
            </button>
          </>
        )}

        {/* PENDING */}
        {phase === 'pending' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-10 h-10 rounded-full border-2 border-mp-primary border-t-transparent animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-mp-text">Writing to blockchain...</p>
              <p className="text-xs text-mp-muted mt-1">Setting limit to {parseFloat(value).toFixed(2)} USDC on ARC Testnet</p>
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {phase === 'success' && result && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="w-11 h-11 rounded-full bg-mp-success/15 border border-mp-success/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-mp-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-mp-text">Limit updated</p>
              <p className="text-2xl font-bold text-mp-success">{result.daily_limit.toFixed(2)} USDC<span className="text-sm font-normal text-mp-muted"> / day</span></p>
            </div>

            <div className="bg-white/5 border border-white/8 rounded-[10px] p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-mp-muted">Stored</span>
                <span className={`text-xs font-medium ${result.onChain ? 'text-mp-success' : 'text-mp-warning'}`}>
                  {result.onChain ? '✓ On-chain' : '⚠ Database only'}
                </span>
              </div>
              {result.txHash && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-mp-muted">Transaction</span>
                  <a
                    href={`${ARC_EXPLORER}/tx/${result.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-mp-primary hover:underline"
                  >
                    {result.txHash.slice(0, 10)}...{result.txHash.slice(-8)} ↗
                  </a>
                </div>
              )}
            </div>

            <button onClick={onClose}
              className="w-full bg-mp-success/15 text-mp-success border border-mp-success/30 rounded-[10px] py-3 text-sm font-semibold hover:bg-mp-success/25 transition-colors">
              Done
            </button>
          </div>
        )}

        {/* ERROR */}
        {phase === 'error' && result && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="w-11 h-11 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-mp-text">Failed to update limit</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/25 rounded-[10px] p-3">
              <p className="text-xs text-red-300">{result.error}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onClose}
                className="bg-white/8 text-mp-muted rounded-[10px] py-3 text-sm font-medium hover:bg-white/12 transition-colors">
                Cancel
              </button>
              <button onClick={() => setPhase('form')}
                className="bg-mp-primary text-white rounded-[10px] py-3 text-sm font-semibold hover:bg-blue-600 transition-colors">
                Try again
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default function AgentPage() {
  const router = useRouter()
  const { tokenList } = useWalletStore()
  const keyboardOpen = useUiStore(s => s.keyboardOpen)
  const setKeyboardOpen = useUiStore(s => s.setKeyboardOpen)
  const [isMobileViewport, setIsMobileViewport] = useState<boolean | null>(null)
  const [accessToken, setAccessToken] = useState('')
  const [userId, setUserId] = useState('')
  const [agentWallet, setAgentWallet] = useState<AgentWallet | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const prefillSentRef = useRef(false)
  const [loadingWallet, setLoadingWallet] = useState(true)
  const [showDeposit, setShowDeposit] = useState(false)
  const [showLimit, setShowLimit] = useState(false)
  const [error, setError] = useState('')
  const [copiedAddr, setCopiedAddr] = useState(false)
  const [pendingAction, setPendingAction] = useState<TxAction | null>(null)
  const [actionError, setActionError] = useState('')
  const [actionDone, setActionDone] = useState(false)
  const [executingAction, setExecutingAction] = useState(false)
  const [txResult, setTxResult] = useState<{ txHash?: string; transactionId?: string; amountOut?: string } | null>(null)
  const [mainWalletPending, setMainWalletPending] = useState<TxAction | null>(null)

  function handleCopyAddr() {
    if (!agentWallet?.wallet_address) return
    navigator.clipboard.writeText(agentWallet.wallet_address)
    setCopiedAddr(true)
    setTimeout(() => setCopiedAddr(false), 2000)
  }
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const [viewportRect, setViewportRect] = useState<{ top: number; height: number } | null>(null)

  // 100dvh / interactive-widget=resizes-content are unreliable in an
  // installed iOS PWA (standalone display mode) when the keyboard opens —
  // known WebKit gap. window.visualViewport reports the real visible area
  // there. Height alone isn't enough though: the visual viewport also pans
  // (offsetTop) independent of the layout viewport once the keyboard is up,
  // so a plain shorter box left in normal flow ends up with its bottom
  // hanging off-screen. Track both and pin this container to the exact rect.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const updateRect = () => setViewportRect({ top: vv.offsetTop, height: vv.height })
    updateRect()
    vv.addEventListener('resize', updateRect)
    vv.addEventListener('scroll', updateRect)
    return () => {
      vv.removeEventListener('resize', updateRect)
      vv.removeEventListener('scroll', updateRect)
    }
  }, [])

  // Only the message list should scroll. `overflow: hidden` on html/body alone
  // isn't enough on iOS Safari — while the keyboard is up, WebKit still lets
  // fixed/flow elements outside the focused input pan independently underneath
  // it. Block touchmove everywhere except inside the message list to kill that.
  useEffect(() => {
    const html = document.documentElement
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = document.body.style.overflow
    html.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'

    const blockOuterScroll = (e: TouchEvent) => {
      if (messagesScrollRef.current?.contains(e.target as Node)) return
      e.preventDefault()
    }
    document.addEventListener('touchmove', blockOuterScroll, { passive: false })

    return () => {
      html.style.overflow = prevHtmlOverflow
      document.body.style.overflow = prevBodyOverflow
      document.removeEventListener('touchmove', blockOuterScroll)
      setKeyboardOpen(false)
    }
  }, [setKeyboardOpen])

  // This page is the mobile-only agent chat surface — desktop uses the chat
  // panel built into /dashboard instead. Bounce desktop-width visitors there
  // rather than maintaining two full chat UIs on wide screens. Runs in a
  // layout effect (before paint) and gates the whole render below on it, so
  // desktop visitors never see this page flash before the redirect fires.
  useLayoutEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches
    if (isDesktop) router.replace('/dashboard')
    setIsMobileViewport(!isDesktop)
  }, [router])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/'); return }
      if (!(await isOnboardingComplete(data.session.user.id))) { router.replace('/'); return }
      setAccessToken(data.session.access_token)
      setUserId(data.session.user.id)
      // Independent of each other — no reason to make history wait on the
      // Circle balance round-trip (or vice versa).
      await Promise.all([loadWallet(data.session.access_token), loadHistory(data.session.access_token)])

      // Prefilled from another page's "Open Agent chat" button — send it
      // straight away instead of making the user retype/paste the command.
      const prefill = sessionStorage.getItem('mp_agent_prefill')
      if (prefill && !prefillSentRef.current) {
        prefillSentRef.current = true
        sessionStorage.removeItem('mp_agent_prefill')
        handleSend(prefill)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cross-device/tab sync: without this, sending a message on desktop never
  // shows up on a phone tab already sitting open on this page until it's
  // manually reloaded. Row already appended locally by handleSend gets
  // deduped by id — this only fills in messages that arrived from elsewhere.
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`agent_messages:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_messages', filter: `user_id=eq.${userId}` },
        (payload) => {
          const m = payload.new as {
            id: string; role: 'user' | 'assistant'; content: string; cost: number | null
            input_fee_tx_hash: string | null; created_at: string
            data_fee_amount: number | null; data_fee_tx_hash: string | null
            chart_symbol: string | null; chart_points: Array<[number, number]> | null
            trending_data: Message['trending']; defi_data: Message['defi']; sentiment_data: Message['sentiment']
            stablecoin_data: Message['stablecoin']; wallet_lookup_data: Message['walletLookup']; dex_pair_data: Message['dexPair']
            swap_quote_data: Message['swapQuote']
          }
          const incoming: Message = {
            id: m.id,
            role: m.role,
            content: m.content,
            cost: m.cost ?? undefined,
            inputFeeTxHash: m.input_fee_tx_hash,
            time: new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            dataFee: m.data_fee_amount != null ? { amount: m.data_fee_amount, txHash: m.data_fee_tx_hash } : null,
            chart: m.chart_symbol && m.chart_points ? { symbol: m.chart_symbol, points: m.chart_points } : null,
            trending: m.trending_data ?? null,
            defi: m.defi_data ?? null,
            sentiment: m.sentiment_data ?? null,
            stablecoin: m.stablecoin_data ?? null,
            walletLookup: m.wallet_lookup_data ?? null,
            dexPair: m.dex_pair_data ?? null,
            swapQuote: m.swap_quote_data ?? null,
          }
          setMessages(prev => {
            if (prev.some(existing => existing.id === m.id)) return prev
            // The tab that sent this message already appended a local copy
            // under a temp id (tmp_.../a_...) before the DB row existed —
            // reconcile onto that placeholder instead of duplicating it.
            const placeholderIdx = prev.findIndex(existing =>
              (existing.id.startsWith('tmp_') || existing.id.startsWith('a_')) &&
              existing.role === m.role && existing.content === m.content)
            if (placeholderIdx !== -1) {
              const next = prev.slice()
              next[placeholderIdx] = { ...incoming, animate: prev[placeholderIdx].animate }
              return next
            }
            return [...prev, incoming]
          })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function loadWallet(token: string) {
    setLoadingWallet(true)
    try {
      const res = await fetch('/api/agent/wallet', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setAgentWallet(await res.json())
    } finally {
      setLoadingWallet(false)
    }
  }

  async function loadHistory(token: string) {
    const { data } = await supabase
      .from('agent_messages')
      .select('id, role, content, cost, input_fee_tx_hash, created_at, data_fee_amount, data_fee_tx_hash, chart_symbol, chart_points, trending_data, defi_data, sentiment_data, stablecoin_data, wallet_lookup_data, dex_pair_data, swap_quote_data')
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) {
      setMessages(data.slice().reverse().map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        cost: m.cost,
        inputFeeTxHash: m.input_fee_tx_hash,
        time: new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        dataFee: m.data_fee_amount != null ? { amount: m.data_fee_amount, txHash: m.data_fee_tx_hash } : null,
        chart: m.chart_symbol && m.chart_points ? { symbol: m.chart_symbol, points: m.chart_points } : null,
        trending: m.trending_data ?? null,
        defi: m.defi_data ?? null,
        sentiment: m.sentiment_data ?? null,
        stablecoin: m.stablecoin_data ?? null,
        walletLookup: m.wallet_lookup_data ?? null,
        dexPair: m.dex_pair_data ?? null,
        swapQuote: m.swap_quote_data ?? null,
      })))
    }
  }

  async function handleDeposit(amount: string): Promise<DepositResult> {
    try {
      const res = await fetch('/api/agent/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ amount: parseFloat(amount) }),
      })
      let data: Record<string, unknown> = {}
      try { data = await res.json() } catch { /* empty response */ }
      if (!res.ok) return { error: (data.error as string) ?? `Error ${res.status}` }
      setTimeout(() => loadWallet(accessToken), 3000)
      return { transactionId: data.transactionId as string | undefined, deposited: data.deposited as number | undefined }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Connection error' }
    }
  }

  async function executeAction(action: TxAction, pin?: string) {
    setExecutingAction(true)
    setActionError('')
    setTxResult(null)
    try {
      const res = await fetch('/api/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action, ...(pin ? { pin } : {}) }),
      })
      let d: Record<string, unknown> = {}
      try { d = await res.json() } catch { /* empty */ }
      if (!res.ok) {
        setActionError((d.error as string) ?? 'Transaction failed')
        setExecutingAction(false)
        return
      }

      addLocalTransaction({
        id: `lp_${crypto.randomUUID()}`,
        type: action.type === 'gateway_withdraw' ? 'credit' : 'debit',
        amount: parseFloat(action.amount),
        tokenSymbol: action.type === 'send' ? (action.token ?? 'USDC') : action.type === 'swap' ? (action.tokenIn ?? 'USDC') : 'USDC',
        description:
          action.type === 'send' ? `Agent transfer to ${action.to}` :
          action.type === 'swap' ? `Agent swap to ${action.tokenOut}` :
          action.type === 'gateway_deposit' ? 'Agent X402 deposit' :
          'Agent X402 withdrawal',
        created_at: new Date().toISOString(),
        txHash: d.txHash as string | undefined,
      })
      setTxResult({ txHash: d.txHash as string, transactionId: d.txId as string, amountOut: d.amountOut as string })
      setActionDone(true)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Connection error')
    } finally {
      setExecutingAction(false)
    }
  }

  async function handleSaveLimit(value: string): Promise<LimitSaveResult> {
    const res = await fetch('/api/agent/wallet/limit', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ daily_limit: parseFloat(value) }),
    })
    const data = await res.json()
    if (!res.ok) {
      return { daily_limit: parseFloat(value), onChain: false, error: data.error ?? 'Failed to save limit' }
    }
    await loadWallet(accessToken)
    return { daily_limit: data.daily_limit, onChain: data.onChain, txHash: data.txHash }
  }

  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if (!text || sending || sendingRef.current) return
    sendingRef.current = true
    setInput('')
    setError('')
    setSending(true)

    const userMsg: Message = {
      id: `tmp_${Date.now()}`,
      role: 'user',
      content: text,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages(prev => [...prev, userMsg])

    // Build wallet context for AI
    const walletContext = tokenList.length > 0
      ? `Balance: ${tokenList.map(t => `${parseFloat(parseFloat(t.amount).toFixed(4))} ${t.symbol}`).join(', ')}`
      : ''

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ message: text, walletContext }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'insufficient_balance') {
          setError('Insufficient Agent Wallet balance. Click Deposit to add USDC.')
          setShowDeposit(true)
        } else if (data.error === 'daily_limit_exceeded') {
          setError(data.message)
        } else {
          setError(data.message ?? data.error ?? 'Connection error')
        }
        setSending(false)
        sendingRef.current = false
        return
      }

      const agentMsg: Message = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        action: data.action ?? null,
        dataFee: data.data_fee ?? null,
        chart: data.token_chart ?? null,
        trending: data.trending_data ?? null,
        defi: data.defi_data ?? null,
        sentiment: data.sentiment_data ?? null,
        stablecoin: data.stablecoin_data ?? null,
        walletLookup: data.wallet_lookup_data ?? null,
        dexPair: data.dex_pair_data ?? null,
        swapQuote: data.swap_quote_data ?? null,
        animate: true,
      }
      // Input fee is charged for the message just sent — attach the real
      // on-chain receipt to the user's own bubble, not the assistant's reply.
      setMessages(prev => {
        const withUserCost = prev.map(m => m.id === userMsg.id ? { ...m, cost: data.cost, inputFeeTxHash: data.input_fee_tx_hash ?? null } : m)
        // The realtime subscription below can win the race and append this
        // exact assistant row (real DB id) before this fetch's own .then()
        // continuation runs — don't add a second copy under the local a_ id.
        const alreadyArrivedViaRealtime = withUserCost.some(m =>
          !m.id.startsWith('tmp_') && !m.id.startsWith('a_') && m.role === 'assistant' && m.content === agentMsg.content)
        return alreadyArrivedViaRealtime ? withUserCost : [...withUserCost, agentMsg]
      })

      if (data.action) {
        setPendingAction(data.action)
        setActionDone(false)
        setActionError('')
        setTxResult(null)
        if (data.action.walletSource === 'main') {
          setMainWalletPending(data.action)
        }
      }

      // Update agent wallet balance
      if (agentWallet) {
        setAgentWallet(prev => prev ? { ...prev, balance: data.balance_after, daily_spent: prev.daily_spent + (data.cost ?? 0) } : prev)
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setSending(false)
      sendingRef.current = false
    }
  }

  const lowBalance = agentWallet && agentWallet.balance < 1
  const spentPct = agentWallet ? Math.min(100, (agentWallet.daily_spent / agentWallet.daily_limit) * 100) : 0
  const msgsToday = agentWallet ? Math.floor(agentWallet.daily_spent / MSG_COST) : 0
  const msgsRemaining = agentWallet ? Math.max(0, Math.floor((agentWallet.daily_limit - agentWallet.daily_spent) / MSG_COST)) : 0
  const msgsFromBalance = agentWallet ? Math.floor(agentWallet.balance / MSG_COST) : 0

  if (!isMobileViewport) return null

  return (
    <div
      className={keyboardOpen && viewportRect
        ? 'fixed inset-x-0 lg:left-[236px] bg-mp-bg flex flex-col overflow-hidden z-50'
        : 'h-dvh bg-mp-bg flex flex-col overflow-hidden'}
      style={keyboardOpen && viewportRect ? { top: `${viewportRect.top}px`, height: `${viewportRect.height}px` } : undefined}
    >
      {/* Header mobile */}
      <div className="lg:hidden flex items-center gap-[11px] shrink-0" style={{
        padding: '16px 18px', background: 'var(--mpm-glass-bg)', backdropFilter: 'blur(var(--mpm-glass-blur))', WebkitBackdropFilter: 'blur(var(--mpm-glass-blur))',
        borderBottom: '1px solid var(--mpm-glass-border)', paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
      }}>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--mpm-text)' }}>Miron Agent</span>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mpm-success)' }} />
        </div>
        {!loadingWallet && agentWallet && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <p style={{ fontSize: 12, fontWeight: 600, color: lowBalance ? 'var(--mpm-error)' : 'var(--mpm-text)' }}>
                {formatUSDC(agentWallet.balance)} USD
              </p>
              <p style={{ fontSize: 10, color: 'var(--mpm-muted)' }}>{msgsFromBalance} left</p>
            </div>
            <button onClick={() => setShowDeposit(true)}
              className={lowBalance ? 'animate-pulse' : ''}
              style={{
                fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8,
                color: lowBalance ? 'var(--mpm-error)' : 'var(--mpm-primary)',
                border: `1px solid ${lowBalance ? 'rgba(255,93,108,.3)' : 'rgba(47,107,255,.3)'}`,
                background: lowBalance ? 'rgba(255,93,108,.1)' : 'rgba(47,107,255,.1)',
              }}>
              Deposit
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Low balance warning */}
          {lowBalance && (
            <div className="mx-4 mt-3 bg-red-500/10 border border-red-500/30 rounded-[10px] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-red-400 text-sm">⚠</span>
                <p className="text-xs text-red-300">Low balance (&lt;1 USDC). Agent may stop working.</p>
              </div>
              <button onClick={() => setShowDeposit(true)}
                className="text-xs font-semibold text-white bg-red-500 rounded-[6px] px-3 py-1.5 hover:bg-red-600 transition-colors shrink-0 ml-3">
                Deposit
              </button>
            </div>
          )}

          {/* Messages */}
          <div ref={messagesScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-4 py-4 flex flex-col gap-3" style={{ touchAction: 'pan-y' }}>
            {messages.length === 0 && !sending && (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16 gap-3">
                <div className="w-14 h-14 bg-mp-primary/15 rounded-full flex items-center justify-center">
                  <svg className="w-7 h-7 text-mp-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l2.4 6.4L21 9l-5.4 5 1.8 7L12 17.5 6.6 21l1.8-7L3 9l6.6-.6z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-mp-text">Hello! I&apos;m MironPay Agent</p>
                <p className="text-xs text-mp-muted max-w-xs">Ask me about your portfolio, token prices, transactions, or anything crypto.</p>
                <div className="flex flex-wrap gap-2 justify-center mt-1">
                  {['Current balance?', 'Should I swap USDC to EURC?', 'My transaction history'].map(q => (
                    <button key={q} onClick={() => setInput(q)}
                      className="text-xs text-mp-primary border border-mp-primary/30 bg-mp-primary/8 rounded-full px-3 py-1.5 hover:bg-mp-primary/15 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} gap-1`}>
                {msg.content && (
                  <div className={`max-w-[80%] rounded-[12px] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-mp-primary text-white rounded-br-[4px]'
                      : 'bg-mp-card border border-white/8 text-mp-text rounded-bl-[4px]'
                  }`}>
                    {msg.role === 'assistant' && msg.animate ? <TypewriterText text={msg.content} /> : msg.content}
                  </div>
                )}
                {msg.role === 'assistant' && msg.action && (
                  <ActionCard
                    action={msg.action}
                    done={actionDone && pendingAction === msg.action}
                    error={pendingAction === msg.action ? actionError : ''}
                    executing={executingAction && pendingAction === msg.action}
                    txResult={actionDone && pendingAction === msg.action ? txResult : null}
                    onConfirm={() => {
                      setPendingAction(msg.action!)
                      setActionDone(false)
                      setActionError('')
                      setTxResult(null)
                      if (msg.action!.walletSource === 'main') {
                        setMainWalletPending(msg.action!)
                      } else {
                        executeAction(msg.action!)
                      }
                    }}
                    onCancel={() => { if (pendingAction === msg.action) setPendingAction(null) }}
                  />
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
                {msg.role === 'assistant' && msg.dexPair && (
                  <DexPairCard data={msg.dexPair} />
                )}
                {msg.role === 'assistant' && msg.swapQuote && (
                  <SwapQuoteCard data={msg.swapQuote} />
                )}
                {msg.role === 'assistant' && msg.sentiment && (
                  <SentimentMeter value={msg.sentiment.value} classification={msg.sentiment.classification} />
                )}
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] text-mp-muted/60">{msg.time}</span>
                  {msg.role === 'user' && msg.cost != null && msg.cost > 0 && (
                    <span className="text-[10px] text-mp-muted/60">-{msg.cost} USDC</span>
                  )}
                  {msg.role === 'user' && msg.inputFeeTxHash && (
                    <a
                      href={`https://testnet.arcscan.app/tx/${msg.inputFeeTxHash}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-mono text-mp-primary/70 hover:text-mp-primary transition-colors"
                    >
                      {msg.inputFeeTxHash.slice(0, 6)}...{msg.inputFeeTxHash.slice(-4)} · View TX ↗
                    </a>
                  )}
                  {msg.role === 'assistant' && msg.dataFee && (
                    msg.dataFee.txHash ? (
                      <a
                        href={`https://testnet.arcscan.app/tx/${msg.dataFee.txHash}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[10px] font-mono text-mp-primary/70 hover:text-mp-primary transition-colors"
                      >
                        🔎 -{msg.dataFee.amount} USDC (live data via x402) · View TX ↗
                      </a>
                    ) : (
                      <span className="text-[10px] text-mp-primary/70">
                        🔎 -{msg.dataFee.amount} USDC (live data via x402)
                      </span>
                    )
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex items-start gap-1">
                <div className="bg-mp-card border border-white/8 rounded-[12px] rounded-bl-[4px] px-4 py-3">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 bg-mp-muted/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-mp-muted/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-mp-muted/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-[10px] px-4 py-3 flex items-center gap-2">
                <span className="text-amber-400 text-sm shrink-0">⚠</span>
                <p className="text-xs text-amber-300">{error}</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className={`px-4 pt-2 border-t border-white/8 shrink-0 lg:pb-3 ${
            keyboardOpen ? 'pb-3' : 'pb-[calc(var(--mpm-tabbar-h)+env(safe-area-inset-bottom)+12px)]'
          }`}>
            <div className="flex items-end gap-2 bg-mp-card border border-white/8 rounded-[12px] px-4 py-3">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                onFocus={() => setKeyboardOpen(true)}
                onBlur={() => setKeyboardOpen(false)}
                placeholder="Ask MironPay Agent..."
                rows={1}
                disabled={sending}
                className="flex-1 bg-transparent text-sm text-mp-text placeholder:text-mp-muted/50 outline-none resize-none max-h-32 disabled:opacity-50"
                style={{ lineHeight: '1.5' }}
              />
              <span className="text-[9px] text-mp-muted/40 shrink-0 self-start pt-0.5">{MSG_COST}$/msg</span>
              <button
                onClick={() => handleSend()}
                disabled={sending || !input.trim()}
                className="w-8 h-8 bg-mp-primary rounded-[8px] flex items-center justify-center disabled:opacity-40 hover:bg-blue-600 transition-colors shrink-0"
              >
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Right panel — desktop only */}
        <div className="hidden lg:flex w-[280px] shrink-0 border-l border-white/8 flex-col overflow-y-auto scrollbar-hide">

          {loadingWallet ? (
            <div className="px-5 py-5">
              <p className="text-xs text-mp-muted animate-pulse">Loading...</p>
            </div>
          ) : agentWallet ? (
            <>
              {/* Balance */}
              <div className="px-5 py-5 border-b border-white/8">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs text-mp-muted uppercase tracking-widest">Agent Wallet</p>
                  <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-mp-success/15 text-mp-success border border-mp-success/25">Gasless</span>
                </div>

                {lowBalance && (
                  <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-[8px] px-3 py-2 flex items-center gap-2">
                    <span className="text-red-400 text-xs">⚠</span>
                    <p className="text-xs text-red-300">Low balance. Please deposit more USDC.</p>
                  </div>
                )}

                <div className="flex items-end gap-1.5 mb-1">
                  <span className={`text-3xl font-bold ${lowBalance ? 'text-red-400' : 'text-mp-text'}`}>
                    {formatUSDC(agentWallet.balance)}
                  </span>
                  <span className="text-sm text-mp-muted mb-0.5">USDC</span>
                </div>
                <p className="text-xs text-mp-muted mb-1">≈ {msgsFromBalance} messages remaining</p>

                {/* Wallet address */}
                {agentWallet.wallet_address && (
                  <div className="mt-3 bg-white/5 border border-white/8 rounded-[8px] px-3 py-2">
                    <p className="text-[10px] text-mp-muted mb-1 uppercase tracking-widest">Wallet Address</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-mp-text truncate">
                        {truncateAddr(agentWallet.wallet_address)}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={handleCopyAddr} className="text-mp-muted hover:text-mp-text transition-colors" title="Copy">
                          {copiedAddr
                            ? <svg className="w-3.5 h-3.5 text-mp-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                          }
                        </button>
                        <a href={`https://testnet.arcscan.app/address/${agentWallet.wallet_address}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-mp-muted hover:text-mp-primary transition-colors" title="View on Explorer">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button onClick={() => setShowDeposit(true)}
                    className="bg-mp-primary text-white rounded-[8px] py-2.5 text-xs font-semibold hover:bg-blue-600 transition-colors">
                    Deposit USDC
                  </button>
                  <button onClick={() => setShowLimit(true)}
                    className="bg-white/5 border border-white/8 text-mp-text rounded-[8px] py-2.5 text-xs font-semibold hover:bg-white/10 transition-colors">
                    Limit
                  </button>
                </div>
              </div>

              {/* Daily spending */}
              <div className="px-5 py-4 border-b border-white/8">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-mp-muted uppercase tracking-widest">Today</p>
                  <button onClick={() => setShowLimit(true)} className="text-[10px] text-mp-primary hover:underline">
                    Change limit
                  </button>
                </div>

                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-mp-muted">{msgsToday} messages</span>
                  <span className="text-xs text-mp-muted">
                    {formatUSDC(agentWallet.daily_spent)} / {formatUSDC(agentWallet.daily_limit)} USDC
                  </span>
                </div>
                <div className="h-1.5 bg-white/8 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all ${spentPct >= 90 ? 'bg-mp-danger' : spentPct >= 70 ? 'bg-amber-400' : 'bg-mp-primary'}`}
                    style={{ width: `${spentPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-mp-muted">
                  {msgsRemaining} messages remaining in today&apos;s limit
                </p>
              </div>

              {/* Fee info */}
              <div className="px-5 py-4">
                <p className="text-xs text-mp-muted uppercase tracking-widest mb-3">Fees</p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-mp-muted">Per agent reply</span>
                    <span className="text-xs font-semibold text-mp-text">{MSG_COST} USDC</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-mp-muted">Send message</span>
                    <span className="text-xs text-mp-success">Free</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-mp-muted">Network</span>
                    <span className="text-xs text-mp-text">ARC Testnet</span>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {showDeposit && (
        <DepositModal onClose={() => setShowDeposit(false)} onDeposit={handleDeposit} />
      )}
      {showLimit && agentWallet && (
        <LimitModal current={agentWallet.daily_limit} onClose={() => setShowLimit(false)} onSave={handleSaveLimit} />
      )}
      {mainWalletPending && (
        <AgentPinModal
          onSuccess={(rawPin) => {
            const act = mainWalletPending
            setMainWalletPending(null)
            executeAction(act, rawPin)
          }}
          onCancel={() => {
            setMainWalletPending(null)
            setPendingAction(null)
          }}
        />
      )}
    </div>
  )
}
