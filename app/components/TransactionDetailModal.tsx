'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabase'
import type { Transaction } from '@/app/lib/types'

const ARC_EXPLORER = 'https://testnet.arcscan.app'

const STATE_LABEL: Record<string, { text: string; color: string }> = {
  COMPLETE:               { text: 'Completed',          color: 'text-mp-success' },
  CONFIRMED:              { text: 'Confirmed',           color: 'text-mp-success' },
  SENT:                   { text: 'Sent to network',    color: 'text-mp-primary' },
  QUEUED:                 { text: 'Queued',             color: 'text-mp-warning' },
  INITIATED:              { text: 'Initiating',         color: 'text-mp-warning' },
  PENDING_RISK_SCREENING: { text: 'Screening',          color: 'text-mp-warning' },
  FAILED:                 { text: 'Failed',             color: 'text-mp-danger' },
  CANCELLED:              { text: 'Cancelled',          color: 'text-mp-danger' },
  DENIED:                 { text: 'Denied',             color: 'text-mp-danger' },
}

function truncate(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`
}

function formatAmount(n: number) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(n)
}

function AddressRow({ label, address }: { label: string; address?: string }) {
  const [username, setUsername] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!address) return
    supabase.rpc('resolve_wallet_address', { p_wallet_address: address })
      .then(({ data }) => setUsername(data ?? null))
  }, [address])

  if (!address) return null

  async function handleCopy() {
    await navigator.clipboard.writeText(address!)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div>
      <p className="text-xs text-mp-muted mb-0.5">{label}</p>
      {username && <p className="text-sm font-medium text-mp-text">@{username}</p>}
      <button onClick={handleCopy} className="text-xs font-mono text-mp-muted hover:text-mp-text text-left break-all transition-colors" title="Click to copy">
        {truncate(address)} {copied ? '✓' : ''}
      </button>
    </div>
  )
}

interface Props {
  tx: Transaction
  onClose: () => void
}

export default function TransactionDetailModal({ tx, onClose }: Props) {
  const isOutbound = tx.type === 'debit'
  const fee = parseFloat(tx.networkFee ?? '0')
  const total = tx.amount + fee
  const state = tx.state ? (STATE_LABEL[tx.state] ?? { text: tx.state, color: 'text-mp-muted' }) : null

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-mp-card border border-white/8 w-full sm:max-w-sm rounded-t-[16px] sm:rounded-[16px] overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8">
          <h2 className="text-base font-semibold text-mp-text">Transaction Detail</h2>
          <button onClick={onClose} className="text-mp-muted hover:text-mp-text text-xl leading-none transition-colors">×</button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5">
          <div className="text-center">
            <p className={`text-3xl font-semibold ${isOutbound ? 'text-mp-danger' : 'text-mp-success'}`}>
              {isOutbound ? '-' : '+'}{formatAmount(tx.amount)} {tx.tokenSymbol}
            </p>
            {state && (
              <span className={`inline-block mt-2 text-xs font-medium px-3 py-1 rounded-full bg-white/8 ${state.color}`}>
                {state.text}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3 bg-white/5 border border-white/8 rounded-[10px] p-4">
            <AddressRow label="From" address={tx.sourceAddress} />
            <div className="border-t border-white/8" />
            <AddressRow label="To" address={tx.destinationAddress} />
          </div>

          {tx.memo && (
            <div
              className="rounded-[10px] px-4 py-3 flex gap-3 items-start"
              style={{ background: 'rgba(124,107,245,0.12)', border: '1px solid rgba(124,107,245,0.4)', boxShadow: '0 0 12px rgba(124,107,245,0.1)' }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: 'rgba(124,107,245,0.25)' }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="var(--c-purple-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--c-purple-accent)' }}>Note from sender</p>
                <p className="text-sm break-words" style={{ color: 'var(--c-text)' }}>{tx.memo}</p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <Row label="Date" value={new Date(tx.created_at).toLocaleString('en-US')} />
            <Row label="Network" value={tx.blockchain ?? 'ARC Testnet'} />
            <Row label="Status" value={state?.text ?? tx.state ?? '—'} />
            {tx.txHash && (
              <div className="flex justify-between gap-2">
                <span className="text-xs text-mp-muted shrink-0">Transaction Hash</span>
                <a href={`${ARC_EXPLORER}/tx/${tx.txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-mp-primary hover:underline text-right break-all">
                  {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-8)} ↗
                </a>
              </div>
            )}
          </div>

          <div className="border-t border-white/8 pt-4 flex flex-col gap-2.5">
            <Row label="Amount" value={`${formatAmount(tx.amount)} ${tx.tokenSymbol}`} />
            {isOutbound && (
              <>
                <Row label="Network fee" value={fee > 0 ? `${formatAmount(fee)} ${tx.tokenSymbol}` : 'Free'} />
                <div className="flex justify-between border-t border-white/8 pt-2.5 mt-0.5">
                  <span className="text-sm font-semibold text-mp-text">Total</span>
                  <span className="text-sm font-semibold text-mp-text">{formatAmount(total)} {tx.tokenSymbol}</span>
                </div>
              </>
            )}
          </div>

          {tx.txHash && (
            <a
              href={`${ARC_EXPLORER}/tx/${tx.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-center text-sm text-mp-primary border border-mp-primary/25 rounded-[10px] py-3 font-medium bg-mp-primary/5 hover:bg-mp-primary/10 transition-colors"
            >
              View on ARC Explorer ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-xs text-mp-muted shrink-0">{label}</span>
      <span className="text-xs text-mp-text text-right">{value}</span>
    </div>
  )
}
