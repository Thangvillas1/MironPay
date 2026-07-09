'use client'

export function SentimentMeter({ value, classification }: { value: number; classification: string }) {
  const pct = Math.max(0, Math.min(100, value))

  return (
    <div className="mt-2 bg-mp-card border border-white/8 rounded-[12px] p-3 w-full max-w-[300px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-mp-text">Fear &amp; Greed Index</span>
        <span className="text-xs font-medium text-mp-text">{pct}/100</span>
      </div>
      <div
        className="relative h-2.5 rounded-full"
        style={{ background: 'linear-gradient(90deg, #ef4444 0%, var(--c-muted) 50%, #22c55e 100%)' }}
      >
        <div
          className="absolute top-1/2 w-3 h-3 rounded-full bg-white border-2 border-mp-card shadow"
          style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-mp-muted mt-1.5">
        <span>Extreme Fear</span>
        <span>Neutral</span>
        <span>Extreme Greed</span>
      </div>
      <div className="text-center text-xs font-semibold text-mp-text mt-2">{classification}</div>
    </div>
  )
}
