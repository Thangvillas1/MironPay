'use client'

import { useRef, useState } from 'react'

const CHART_RANGES = [
  { label: '1H', ms: 60 * 60 * 1000 },
  { label: '4H', ms: 4 * 60 * 60 * 1000 },
  { label: '24H', ms: 24 * 60 * 60 * 1000 },
] as const
type ChartRangeLabel = (typeof CHART_RANGES)[number]['label']

function formatChartPrice(p: number) {
  return p < 1 ? p.toFixed(6) : p.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function TokenPriceChart({ chart }: { chart: { symbol: string; points: Array<[number, number]> } }) {
  const [range, setRange] = useState<ChartRangeLabel>('4H')
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const rangeMs = CHART_RANGES.find(r => r.label === range)!.ms
  const latestT = chart.points[chart.points.length - 1]?.[0] ?? Date.now()
  const filtered = chart.points.filter(([t]) => t >= latestT - rangeMs)
  const pts = filtered.length >= 2 ? filtered : chart.points.slice(-2)
  if (pts.length < 2) return null

  const prices = pts.map(p => p[1])
  const max = Math.max(...prices)
  const min = Math.min(...prices)
  const span = max - min || max * 0.001 || 1
  const w = 300, h = 90, padY = 6

  const coords = pts.map(([t, p], i) => ({
    x: (i / (pts.length - 1)) * w,
    y: h - padY - ((p - min) / span) * (h - padY * 2),
    t, p,
  }))
  const linePoints = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const fillPoints = `0,${h} ${linePoints} ${w},${h}`

  const pctChange = prices[0] ? ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100 : 0
  const isUp = pctChange >= 0
  const color = isUp ? '#2dd4bf' : '#fb6f84'
  const gradientId = `tc-${chart.symbol}-${range}`

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const relX = ((e.clientX - rect.left) / rect.width) * w
    let closest = 0
    let closestDist = Infinity
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - relX)
      if (d < closestDist) { closestDist = d; closest = i }
    })
    setHoverIdx(closest)
  }

  const hovered = hoverIdx != null ? coords[hoverIdx] : coords[coords.length - 1]

  return (
    <div className="mt-2 bg-mp-card border border-white/8 rounded-[12px] p-3 w-full max-w-[300px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-mp-text">{chart.symbol}/USD</span>
        <span className="text-xs font-medium" style={{ color }}>
          {isUp ? '+' : ''}{pctChange.toFixed(2)}% · {range}
        </span>
      </div>
      <div className="flex gap-1 mb-2">
        {CHART_RANGES.map(r => (
          <button
            key={r.label}
            type="button"
            onClick={() => setRange(r.label)}
            className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
              range === r.label ? 'bg-mp-primary text-white' : 'bg-white/5 text-mp-muted hover:bg-white/10'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-[70px] cursor-crosshair"
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={fillPoints} fill={`url(#${gradientId})`} />
        <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {hoverIdx != null && (
          <line x1={hovered.x} y1={0} x2={hovered.x} y2={h} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        )}
        <circle cx={hovered.x} cy={hovered.y} r={hoverIdx != null ? 3 : 2.5} fill={color} stroke="var(--c-panel)" strokeWidth="1.5" />
      </svg>
      <div className="flex items-center justify-between text-[10px] text-mp-muted mt-1">
        <span>{new Date(hovered.t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="text-mp-text font-medium">${formatChartPrice(hovered.p)}</span>
      </div>
    </div>
  )
}
