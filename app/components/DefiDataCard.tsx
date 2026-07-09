'use client'

type DefiData =
  | { mode: 'protocol'; name: string; category: string | null; chains: string[]; tvl_usd: number | null; change_1d_pct: number | null; change_7d_pct: number | null }
  | { mode: 'top_yield'; pools: Array<{ project: string; symbol: string; chain: string; apy_pct: number; tvl_usd: number }> }

function formatUsdCompact(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

function DeltaChip({ pct }: { pct: number | null }) {
  if (pct == null) return null
  const up = pct >= 0
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: up ? '#2dd4bf' : '#fb6f84', background: up ? 'rgba(45,212,191,.1)' : 'rgba(251,111,132,.1)' }}>
      {up ? '+' : ''}{pct}%
    </span>
  )
}

export function DefiDataCard({ data }: { data: DefiData }) {
  if (data.mode === 'protocol') {
    return (
      <div className="mt-2 bg-mp-card border border-white/8 rounded-[12px] p-3 w-full max-w-[300px]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-mp-text">{data.name}</span>
          {data.category && <span className="text-[10px] text-mp-muted">{data.category}</span>}
        </div>
        <div className="text-lg font-semibold text-mp-text">{formatUsdCompact(data.tvl_usd)} <span className="text-[10px] font-normal text-mp-muted">TVL</span></div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-mp-muted">1d</span><DeltaChip pct={data.change_1d_pct} />
          <span className="text-[10px] text-mp-muted ml-2">7d</span><DeltaChip pct={data.change_7d_pct} />
        </div>
        {data.chains.length > 0 && (
          <div className="text-[10px] text-mp-muted mt-2 truncate">{data.chains.slice(0, 6).join(', ')}{data.chains.length > 6 ? `, +${data.chains.length - 6} more` : ''}</div>
        )}
      </div>
    )
  }

  if (data.pools.length === 0) return null

  return (
    <div className="mt-2 bg-mp-card border border-white/8 rounded-[12px] overflow-hidden w-full max-w-[320px]">
      <div className="px-3 py-2 border-b border-white/8">
        <span className="text-xs font-semibold text-mp-text">🌾 Top DeFi Yields</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 px-3 py-1.5 text-[10px] text-mp-muted">
        <span>Pool</span>
        <span className="text-right">APY</span>
        <span className="text-right">TVL</span>
      </div>
      {data.pools.map((p, i) => (
        <div key={p.project + p.symbol + i} className="grid grid-cols-[1fr_auto_auto] gap-x-2 items-center px-3 py-1.5 border-t border-white/5 text-xs">
          <span className="text-mp-text font-medium truncate">{p.symbol} <span className="text-mp-muted">· {p.chain}</span></span>
          <span className="text-right font-medium" style={{ color: '#2dd4bf' }}>{p.apy_pct}%</span>
          <span className="text-mp-muted text-right font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatUsdCompact(p.tvl_usd)}</span>
        </div>
      ))}
    </div>
  )
}
