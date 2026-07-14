'use client'

interface DexPair {
  chain: string
  dex: string
  pairLabel: string
  priceUsd: number
  liquidityUsd: number
  volume24hUsd: number
  change24hPct: number | null
  url: string
}

function formatUsdCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

export function DexPairCard({ data }: { data: { query: string; pairs: DexPair[] } }) {
  if (data.pairs.length === 0) return null

  return (
    <div className="mt-2 bg-mp-card border border-white/8 rounded-[12px] overflow-hidden w-full max-w-[340px]">
      <div className="px-3 py-2 border-b border-white/8">
        <span className="text-xs font-semibold text-mp-text">📊 DEX pairs — {data.query}</span>
      </div>
      {data.pairs.map((p, i) => (
        <a key={p.pairLabel + p.dex + i} href={p.url} target="_blank" rel="noopener noreferrer" className="block px-3 py-2 border-t border-white/5 hover:bg-white/[.02] transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-mp-text">{p.pairLabel} <span className="text-mp-muted">· {p.dex}</span></span>
            <span className="text-xs font-mono font-medium" style={{ color: (p.change24hPct ?? 0) >= 0 ? '#2dd4bf' : '#fb6f84' }}>${p.priceUsd}</span>
          </div>
          <div className="flex items-center justify-between mt-1 text-[10px] text-mp-muted">
            <span>Liquidity {formatUsdCompact(p.liquidityUsd)} · Vol24h {formatUsdCompact(p.volume24hUsd)}</span>
            {p.change24hPct != null && (
              <span style={{ color: p.change24hPct >= 0 ? '#2dd4bf' : '#fb6f84' }}>{p.change24hPct >= 0 ? '+' : ''}{p.change24hPct}%</span>
            )}
          </div>
        </a>
      ))}
    </div>
  )
}
