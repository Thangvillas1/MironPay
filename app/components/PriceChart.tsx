'use client'

interface Props {
  data: [number, number][]
  isPositive: boolean
  period: string
}

function formatTimeLabel(ts: number, period: string): string {
  const d = new Date(ts)
  if (period === '1D') {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }
  if (period === '1W') {
    return d.toLocaleDateString('en-US', { weekday: 'short' })
  }
  return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' })
}

export default function PriceChart({ data, isPositive, period }: Props) {
  if (data.length < 2) return null

  const W = 400
  const H = 120
  const PAD_X = 0
  const PAD_Y = 8

  const prices = data.map((d) => d[1])
  const times = data.map((d) => d[0])
  const minP = Math.min(...prices)
  const maxP = Math.max(...prices)
  const minT = times[0]
  const maxT = times[times.length - 1]

  const rangeP = maxP - minP || 1
  const rangeT = maxT - minT || 1

  const px = (ts: number) => PAD_X + ((ts - minT) / rangeT) * (W - PAD_X * 2)
  const py = (p: number) => PAD_Y + (1 - (p - minP) / rangeP) * (H - PAD_Y * 2)

  const linePts = data.map(([ts, p]) => `${px(ts).toFixed(1)},${py(p).toFixed(1)}`).join(' ')

  // Close path to bottom for fill
  const firstX = px(times[0]).toFixed(1)
  const lastX = px(times[times.length - 1]).toFixed(1)
  const fillPts = `${linePts} ${lastX},${H} ${firstX},${H}`

  const color = isPositive ? '#4ade80' : '#ef4444'
  const gradId = `cg-${isPositive ? 'g' : 'r'}`

  // Pick ~5 evenly spaced label indices
  const labelCount = 5
  const step = Math.floor(data.length / (labelCount - 1))
  const labelIdxs = Array.from({ length: labelCount - 1 }, (_, i) => i * step)
  labelIdxs.push(data.length - 1)

  return (
    <div className="w-full flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 140 }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={fillPts} fill={`url(#${gradId})`} />
        <polyline
          points={linePts}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      {/* Time labels */}
      <div className="relative w-full h-4" style={{ fontSize: 10 }}>
        {labelIdxs.map((idx, i) => {
          const [ts] = data[idx]
          const leftPct = ((px(ts) / W) * 100).toFixed(1)
          const isLast = i === labelIdxs.length - 1
          return (
            <span
              key={idx}
              className="absolute text-mp-muted"
              style={{
                left: `${leftPct}%`,
                transform: isLast ? 'translateX(-100%)' : i === 0 ? 'none' : 'translateX(-50%)',
                whiteSpace: 'nowrap',
              }}
            >
              {formatTimeLabel(ts, period)}
            </span>
          )
        })}
      </div>
    </div>
  )
}
