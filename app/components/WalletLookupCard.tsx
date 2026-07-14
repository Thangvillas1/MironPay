'use client'

interface WalletLookupData {
  address: string
  chains: Array<{ blockchain: string; total_usd: number; tokens: Array<{ symbol: string; name: string; amount: number; usd_value: number; rank: number | null }> }>
  total_usd: number
}

function formatUsdCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

function truncateAddr(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : addr
}

export function WalletLookupCard({ data }: { data: WalletLookupData }) {
  const nonEmptyChains = data.chains.filter(c => c.tokens.length > 0)
  if (nonEmptyChains.length === 0) return null

  return (
    <div className="mt-2 bg-mp-card border border-white/8 rounded-[12px] overflow-hidden w-full max-w-[340px]">
      <div className="px-3 py-2 border-b border-white/8 flex items-center justify-between">
        <span className="text-xs font-semibold text-mp-text">🔎 {truncateAddr(data.address)}</span>
        <span className="text-xs font-semibold" style={{ color: '#2dd4bf' }}>{formatUsdCompact(data.total_usd)}</span>
      </div>
      {nonEmptyChains.map((chain) => (
        <div key={chain.blockchain}>
          <div className="px-3 py-1.5 bg-white/[.02] flex items-center justify-between">
            <span className="text-[10px] font-medium text-mp-muted uppercase tracking-wide">{chain.blockchain}</span>
            <span className="text-[10px] text-mp-muted font-mono">{formatUsdCompact(chain.total_usd)}</span>
          </div>
          {chain.tokens.slice(0, 5).map((t, i) => (
            <div key={t.symbol + i} className="grid grid-cols-[1fr_auto] gap-x-2 items-center px-3 py-1.5 border-t border-white/5 text-xs">
              <span className="text-mp-text font-medium truncate">{t.symbol} <span className="text-mp-muted">· {t.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span></span>
              <span className="text-right font-mono text-mp-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatUsdCompact(t.usd_value)}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="px-3 py-1.5 border-t border-white/8 text-[10px] text-mp-muted">
        Read-only lookup — figures can include spoofed tokens with fake values, verify anything unusual on-chain.
      </div>
    </div>
  )
}
