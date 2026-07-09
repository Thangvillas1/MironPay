interface Props {
  size?: number
  showStatusDot?: boolean
  glow?: boolean
  excited?: boolean
}

export default function AgentAvatar({ size = 44, showStatusDot = true, glow = false, excited = false }: Props) {
  const dotSize = Math.max(10, size * 0.28)
  const eyeStyle = { transformBox: 'fill-box' as const, transformOrigin: 'center' as const }
  const blinkDuration = excited ? '0.7s' : '4.2s'

  return (
    <span
      style={{
        position: 'relative', width: size, height: size, borderRadius: size * 0.27,
        background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)',
        boxShadow: glow ? '0 8px 30px rgba(99,102,241,.42)' : undefined,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      {/* Bob wrapper — không đổi kích thước, chỉ trôi lên xuống nhẹ */}
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'agentBob 3.4s ease-in-out infinite' }}>
        {/* Face — phần duy nhất phóng to khi excited, khung vuông ngoài giữ nguyên */}
        <svg
          width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24"
          style={{
            transform: excited ? 'scale(1.55)' : 'scale(1)',
            transition: 'transform 320ms cubic-bezier(.34,1.56,.64,1)',
            overflow: 'visible',
          }}
        >
          {/* antenna */}
          <line x1="12" y1="3.4" x2="12" y2="6" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" opacity={0.9} />
          <circle cx="12" cy="2.7" r="1.15" fill="#fff" opacity={0.9} />
          {/* head */}
          <rect x="4" y="6" width="16" height="14" rx="4.5" fill="rgba(var(--c-fg-rgb),.14)" stroke="#fff" strokeWidth="1.3" />
          {/* eyes */}
          <ellipse cx="9" cy="12.5" rx="1.4" ry="1.8" fill="#fff" style={{ ...eyeStyle, animation: `agentBlink ${blinkDuration} ease-in-out infinite` }} />
          <ellipse cx="15" cy="12.5" rx="1.4" ry="1.8" fill="#fff" style={{ ...eyeStyle, animation: `agentBlink ${blinkDuration} ease-in-out .08s infinite` }} />
          {/* mouth */}
          <rect x="9.3" y="16.1" width="5.4" height="1.5" rx="0.75" fill="#fff" opacity={0.85} style={{ ...eyeStyle, animation: 'agentMouth 2.3s ease-in-out infinite' }} />
        </svg>
      </span>
      {showStatusDot && (
        <span
          className="mp-pulse"
          style={{
            position: 'absolute', right: -1, bottom: -1, width: dotSize, height: dotSize,
            borderRadius: '50%', background: '#2dd4bf', border: `${Math.max(2, size * 0.055)}px solid var(--c-panel)`,
          }}
        />
      )}
    </span>
  )
}
