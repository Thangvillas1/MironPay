'use client'

interface SwapQuoteData {
  chain: string
  srcSymbol: string
  dstSymbol: string
  srcAmount: number
  dstAmount: number
  gasEstimate: number | null
}

export function SwapQuoteCard({ data }: { data: SwapQuoteData }) {
  return (
    <div className="mt-2 bg-mp-card border border-white/8 rounded-[12px] p-3 w-full max-w-[300px]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-mp-text">🔀 1inch quote</span>
        <span className="text-[10px] text-mp-muted uppercase">{data.chain}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-mp-muted">{data.srcAmount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {data.srcSymbol}</span>
        <span className="text-mp-muted">→</span>
        <span className="font-semibold text-mp-text" style={{ color: '#2dd4bf' }}>{data.dstAmount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {data.dstSymbol}</span>
      </div>
      {data.gasEstimate != null && (
        <div className="text-[10px] text-mp-muted mt-2">Est. gas: {data.gasEstimate.toLocaleString('en-US')}</div>
      )}
      <div className="text-[10px] text-mp-muted mt-2">Price-comparison only — not an executed swap.</div>
    </div>
  )
}
