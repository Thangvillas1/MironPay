'use client'

interface TrendingCoin {
  symbol: string
  name: string
  market_cap_rank: number | null
  price_usd: number | null
  change_24h_pct: number | null
}

function formatPrice(p: number) {
  return p < 1 ? p.toFixed(6) : p.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function TrendingTable({ coins }: { coins: TrendingCoin[] }) {
  if (coins.length === 0) return null

  return (
    <div className="mt-2 bg-mp-card border border-white/8 rounded-[12px] overflow-hidden w-full max-w-[320px]">
      <div className="px-3 py-2 border-b border-white/8">
        <span className="text-xs font-semibold text-mp-text">🔥 Trending on CoinGecko</span>
      </div>
      <div className="grid grid-cols-[1.5rem_1fr_auto_auto] gap-x-2 px-3 py-1.5 text-[10px] text-mp-muted">
        <span></span>
        <span>Token</span>
        <span className="text-right">Price</span>
        <span className="text-right">24h</span>
      </div>
      {coins.map((c, i) => {
        const up = (c.change_24h_pct ?? 0) >= 0
        return (
          <div
            key={c.symbol + i}
            className="grid grid-cols-[1.5rem_1fr_auto_auto] gap-x-2 items-center px-3 py-1.5 border-t border-white/5 text-xs"
          >
            <span className="text-mp-muted">{i + 1}</span>
            <span className="text-mp-text font-medium truncate">{c.name} <span className="text-mp-muted">{c.symbol}</span></span>
            <span className="text-mp-text text-right font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {c.price_usd != null ? `$${formatPrice(c.price_usd)}` : '—'}
            </span>
            <span
              className="text-right font-medium"
              style={{ color: c.change_24h_pct == null ? undefined : (up ? '#2dd4bf' : '#fb6f84') }}
            >
              {c.change_24h_pct != null ? `${up ? '+' : ''}${c.change_24h_pct}%` : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
