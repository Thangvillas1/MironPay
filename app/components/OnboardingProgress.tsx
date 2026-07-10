export default function OnboardingProgress({ index }: { index: 0 | 1 | 2 }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 26,
            height: 5,
            borderRadius: 3,
            background: i <= index ? 'var(--c-primary, #6366f1)' : 'var(--c-input)',
          }}
        />
      ))}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--lp-muted2)', marginLeft: 4 }}>
        {index + 1} / 3
      </span>
    </div>
  )
}
