'use client'

interface SwapQuoteData {
  chain: string
  tokenInSymbol: string
  tokenOutSymbol: string
  amountIn: number
  amountInUsd: number | null
  amountOutUsd: number | null
  gasUsd: number | null
  route: string[]
}

export function SwapQuoteCard({ data }: { data: SwapQuoteData }) {
  return (
    <div className="mt-2 bg-mp-card border border-white/8 rounded-[12px] p-3 w-full max-w-[300px]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-mp-text">🔀 KyberSwap quote</span>
        <span className="text-[10px] text-mp-muted uppercase">{data.chain}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-mp-muted">{data.amountIn.toLocaleString('en-US', { maximumFractionDigits: 6 })} {data.tokenInSymbol}</span>
        <span className="text-mp-muted">→</span>
        <span className="font-semibold" style={{ color: '#2dd4bf' }}>
          {data.amountOutUsd != null ? `~$${data.amountOutUsd}` : '?'} {data.tokenOutSymbol}
        </span>
      </div>
      {data.route.length > 0 && (
        <div className="text-[10px] text-mp-muted mt-2 truncate">Route: {data.route.join(' → ')}</div>
      )}
      {data.gasUsd != null && (
        <div className="text-[10px] text-mp-muted mt-1">Est. gas cost: ~${data.gasUsd}</div>
      )}
      <div className="text-[10px] text-mp-muted mt-2">Price-comparison only — not an executed swap.</div>
    </div>
  )
}
