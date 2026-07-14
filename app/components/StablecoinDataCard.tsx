'use client'

type StablecoinItem = { symbol: string; name: string; price_usd: number; peg_type: string; market_cap_usd: number }
type StablecoinData =
  | { mode: 'top'; coins: StablecoinItem[] }
  | { mode: 'single'; coin: StablecoinItem }

function formatUsdCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

function pegColor(price: number): string {
  const deviationPct = Math.abs(price - 1) * 100
  return deviationPct > 0.5 ? '#fb6f84' : '#2dd4bf'
}

export function StablecoinDataCard({ data }: { data: StablecoinData }) {
  if (data.mode === 'single') {
    const c = data.coin
    const deviationPct = ((c.price_usd - 1) * 100).toFixed(2)
    return (
      <div className="mt-2 bg-mp-card border border-white/8 rounded-[12px] p-3 w-full max-w-[300px]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-mp-text">{c.name} <span className="text-mp-muted">({c.symbol})</span></span>
        </div>
        <div className="text-lg font-semibold" style={{ color: pegColor(c.price_usd) }}>
          ${c.price_usd.toFixed(4)} <span className="text-[10px] font-normal text-mp-muted">({Number(deviationPct) >= 0 ? '+' : ''}{deviationPct}% from peg)</span>
        </div>
        <div className="text-[10px] text-mp-muted mt-2">Market cap: {formatUsdCompact(c.market_cap_usd)}</div>
      </div>
    )
  }

  if (data.coins.length === 0) return null

  return (
    <div className="mt-2 bg-mp-card border border-white/8 rounded-[12px] overflow-hidden w-full max-w-[320px]">
      <div className="px-3 py-2 border-b border-white/8">
        <span className="text-xs font-semibold text-mp-text">💵 Top Stablecoins</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 px-3 py-1.5 text-[10px] text-mp-muted">
        <span>Coin</span>
        <span className="text-right">Price</span>
        <span className="text-right">Market cap</span>
      </div>
      {data.coins.map((c, i) => (
        <div key={c.symbol + i} className="grid grid-cols-[1fr_auto_auto] gap-x-2 items-center px-3 py-1.5 border-t border-white/5 text-xs">
          <span className="text-mp-text font-medium truncate">{c.symbol}</span>
          <span className="text-right font-medium" style={{ color: pegColor(c.price_usd) }}>${c.price_usd.toFixed(4)}</span>
          <span className="text-mp-muted text-right font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatUsdCompact(c.market_cap_usd)}</span>
        </div>
      ))}
    </div>
  )
}
