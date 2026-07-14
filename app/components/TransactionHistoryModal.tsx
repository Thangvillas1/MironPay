'use client'

import { useState } from 'react'
import type { Transaction } from '@/app/lib/types'
import TransactionDetailModal from './TransactionDetailModal'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' })
}

function formatTokenAmount(amount: number) {
  return parseFloat(amount.toFixed(6)).toString()
}

interface Props {
  transactions: Transaction[]
  onClose: () => void
}

export default function TransactionHistoryModal({ transactions, onClose }: Props) {
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)

  if (selectedTx) {
    return <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-mp-card border border-white/8 w-full sm:max-w-sm rounded-t-[16px] sm:rounded-[16px] overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8 shrink-0">
          <h2 className="text-base font-semibold text-mp-text">Transaction History</h2>
          <button onClick={onClose} className="text-mp-muted hover:text-mp-text text-xl leading-none transition-colors">×</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {transactions.length === 0 ? (
            <p className="text-base text-mp-muted px-5 py-10 text-center">No transactions yet</p>
          ) : (
            <ul>
              {transactions.map((tx, i) => {
                const hasMemo = !!tx.memo
                return (
                  <li
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className={`flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/5 active:bg-white/10 transition-colors ${
                      i < transactions.length - 1 ? 'border-b border-white/8' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Icon — tím nếu có memo, xanh/xám nếu không */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 relative"
                        style={{
                          background: hasMemo
                            ? 'rgba(124,107,245,0.18)'
                            : tx.type === 'credit'
                            ? 'rgba(34,197,94,0.12)'
                            : 'rgba(var(--c-fg-rgb),0.06)',
                          border: hasMemo ? '1px solid rgba(124,107,245,0.35)' : '1px solid transparent',
                        }}
                      >
                        <span style={{
                          fontSize: 15,
                          color: hasMemo ? 'var(--c-purple-accent)' : tx.type === 'credit' ? '#22c55e' : 'var(--c-muted)',
                        }}>
                          {tx.type === 'credit' ? '↓' : '↑'}
                        </span>
                        {/* Dot nhỏ báo có memo */}
                        {hasMemo && (
                          <span
                            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full flex items-center justify-center"
                            style={{ background: '#7c6bf5', border: '1.5px solid var(--c-wallet-main)' }}
                          />
                        )}
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-mp-text">{tx.description}</span>
                          {hasMemo && (
                            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="var(--c-purple-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-mp-muted">{formatDate(tx.created_at)}</span>
                          {hasMemo && (
                            <span className="text-xs truncate max-w-[130px]" style={{ color: 'var(--c-purple-accent)', opacity: 0.8 }}>
                              · {tx.memo}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-0.5">
                      <span className={`text-sm font-semibold ${tx.type === 'credit' ? 'text-mp-success' : 'text-mp-danger'}`}>
                        {tx.type === 'credit' ? '+' : '-'}{formatTokenAmount(tx.amount)} {tx.tokenSymbol}
                      </span>
                      {tx.state && <span className="text-xs text-mp-muted">{tx.state}</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
