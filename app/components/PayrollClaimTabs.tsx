'use client'

export type PayrollClaimRole = 'company' | 'employee' | 'settings'

const TABS: { role: PayrollClaimRole; label: string }[] = [
  { role: 'company', label: 'Run Payroll' },
  { role: 'employee', label: 'Claim Box' },
  { role: 'settings', label: 'Company' },
]

export default function PayrollClaimTabs({ role, onChange }: { role: PayrollClaimRole; onChange: (role: PayrollClaimRole) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
      <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 13, background: 'var(--c-panel)', border: '1px solid rgba(255,255,255,.07)' }}>
        {TABS.map((tab) => {
          const active = role === tab.role
          return (
            <button
              key={tab.role}
              onClick={() => onChange(tab.role)}
              style={{
                height: 36,
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                borderRadius: 9,
                border: 'none',
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: active ? 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)' : 'transparent',
                color: active ? '#fff' : 'var(--c-muted)',
                boxShadow: active ? '0 8px 30px rgba(99,102,241,.42)' : 'none',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--c-muted2)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2dd4bf', boxShadow: '0 0 8px #2dd4bf' }} />
          ARC network
        </span>
        <span>·</span>
        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>Claim Box v1.1.1</span>
      </div>
    </div>
  )
}
