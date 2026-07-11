'use client'

import ThemeToggle from './ThemeToggle'

export type AuthStep = 'login' | 'callback' | 'username' | 'confirm' | 'pin' | 'done'

const STAGES: { key: AuthStep; label: string }[] = [
  { key: 'login', label: 'Sign in' },
  { key: 'callback', label: 'Verifying' },
  { key: 'username', label: 'Username' },
  { key: 'confirm', label: 'Confirm' },
  { key: 'pin', label: 'PIN' },
]

function stageStatus(stageKey: AuthStep, current: AuthStep): 'done' | 'active' | 'upcoming' {
  const order: AuthStep[] = ['login', 'callback', 'username', 'confirm', 'pin', 'done']
  const stageIdx = order.indexOf(stageKey)
  const currentIdx = order.indexOf(current)
  if (current === 'done') return 'done'
  if (stageIdx < currentIdx) return 'done'
  if (stageIdx === currentIdx) return 'active'
  return 'upcoming'
}

export default function AuthShell({
  step,
  cardWidth = 460,
  cardPadding = 32,
  center = true,
  children,
}: {
  step: AuthStep
  cardWidth?: number
  cardPadding?: number
  center?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen relative" style={{ background: 'var(--lp-bg)' }}>
      {/* Radial glows — same treatment as landing hero */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(60% 45% at 12% -6%, rgba(99,102,241,.30), transparent 60%), ' +
            'radial-gradient(55% 42% at 92% 0%, rgba(34,198,224,.16), transparent 60%)',
        }}
      />

      {/* Top bar */}
      <header
        className="fixed top-0 inset-x-0 z-20 flex items-center justify-between"
        style={{ padding: '20px 34px', borderBottom: '1px solid var(--c-border)', background: 'var(--lp-bg)' }}
      >
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt=""
            className="shrink-0"
            style={{ width: 34, height: 34, borderRadius: 10, boxShadow: 'var(--glow-primary)' }}
          />
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--lp-text)' }}>
            Miron<span style={{ color: 'var(--c-primary, #818cf8)' }}>Pay</span>
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-1.5" aria-label="Onboarding progress">
          {STAGES.map((stage, i) => {
            const status = stageStatus(stage.key, step)
            return (
              <div key={stage.key} className="flex items-center gap-1.5">
                <div
                  className="flex items-center gap-1.5 rounded-full"
                  style={{
                    padding: '5px 11px',
                    fontSize: 11.5,
                    fontWeight: 600,
                    background: status === 'active' ? 'rgba(99,102,241,.16)' : 'transparent',
                    color:
                      status === 'active' ? '#818cf8' : status === 'done' ? 'var(--lp-success)' : 'var(--lp-muted2)',
                  }}
                >
                  <span
                    className="rounded-full shrink-0"
                    style={{
                      width: 5,
                      height: 5,
                      background: status === 'upcoming' ? 'var(--lp-muted2)' : status === 'done' ? 'var(--lp-success)' : '#818cf8',
                    }}
                  />
                  {stage.label}
                </div>
                {i < STAGES.length - 1 && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--lp-muted2)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                )}
              </div>
            )
          })}
        </nav>

        <ThemeToggle className="w-[38px] h-[38px]" />
      </header>

      <main className={`relative z-10 min-h-screen flex ${center ? 'items-center' : 'items-start'} justify-center px-4`} style={{ paddingTop: 96, paddingBottom: 40 }}>
        <div
          style={{
            width: '100%',
            maxWidth: cardWidth,
            borderRadius: 22,
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            border: '1px solid var(--glass-border)',
            boxShadow: 'inset 0 1px 0 var(--glass-hi), 0 30px 80px rgba(3,8,20,.45), var(--glow-primary)',
            padding: cardPadding,
          }}
        >
          {children}
        </div>
      </main>
    </div>
  )
}
