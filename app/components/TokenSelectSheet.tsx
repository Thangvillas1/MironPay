'use client'

import { useState } from 'react'
import type { TokenBalance } from '@/app/lib/types'

interface Props {
  tokens: TokenBalance[]
  selected: string
  onSelect: (symbol: string) => void
  onClose: () => void
}

export default function TokenSelectSheet({ tokens, selected, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')

  const filtered = tokens.filter(t =>
    t.symbol.toLowerCase().includes(query.toLowerCase()) ||
    t.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-sm rounded-t-[20px] flex flex-col overflow-hidden"
        style={{ background: 'var(--c-page)', border: '1px solid rgba(26,86,219,0.25)', borderBottom: 'none', maxHeight: '70vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-8 h-1 rounded-full" style={{ background: 'rgba(var(--c-fg-rgb),0.15)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 pt-1 shrink-0">
          <span className="text-sm font-bold text-white">Select Token</span>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none transition-colors">×</button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3 shrink-0">
          <div className="flex items-center gap-2 rounded-[10px] px-3 py-2.5" style={{ background: 'rgba(var(--c-fg-rgb),0.06)', border: '1px solid rgba(var(--c-fg-rgb),0.1)' }}>
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="var(--c-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search token name or symbol..."
              className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-white/30 hover:text-white/60 text-base leading-none">×</button>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="shrink-0" style={{ borderTop: '1px solid rgba(var(--c-fg-rgb),0.06)' }} />

        {/* Token list */}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--c-muted)' }}>No tokens found</p>
          ) : (
            filtered.map(t => {
              const isSelected = t.symbol === selected
              const bal = parseFloat(t.amount)
              const initials = t.symbol.slice(0, 2)
              return (
                <button
                  key={t.symbol}
                  onClick={() => { onSelect(t.symbol); onClose() }}
                  className="w-full flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.04] active:bg-white/[0.07]"
                  style={{ borderBottom: '1px solid rgba(var(--c-fg-rgb),0.04)' }}
                >
                  {/* Logo / fallback */}
                  <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center overflow-hidden"
                    style={{ background: 'rgba(26,86,219,0.15)', border: '1px solid rgba(26,86,219,0.2)' }}>
                    {t.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.logoUrl} alt={t.symbol} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[11px] font-bold" style={{ color: '#60a5fa' }}>{initials}</span>
                    )}
                  </div>

                  {/* Name + symbol */}
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: isSelected ? '#60a5fa' : 'var(--c-text)' }}>{t.symbol}</p>
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--c-muted)' }}>{t.name}</p>
                  </div>

                  {/* Balance + checkmark */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                        {bal.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                      </p>
                      {t.usdValue !== null && (
                        <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
                          ≈ ${t.usdValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(26,86,219,0.3)' }}>
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
