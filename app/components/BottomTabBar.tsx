'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUIStore } from '@/app/store/ui'

type Tab = {
  label: string
  href: string
  activeOn: string[]
  icon: (active: boolean) => React.ReactNode
}

const TABS: Tab[] = [
  {
    label: 'Home',
    href: '/dashboard',
    activeOn: ['/dashboard', '/token'],
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.6} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-[21px] h-[21px]">
        <path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9.5 20v-5h5v5" />
      </svg>
    ),
  },
  {
    label: 'Agent',
    href: '/agent',
    activeOn: ['/agent'],
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.6} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-[21px] h-[21px]">
        <path d="M12 2l2.4 6.4L21 9l-5.4 5 1.8 7L12 17.5 6.6 21l1.8-7L3 9l6.6-.6z" />
      </svg>
    ),
  },
  {
    label: 'Launchpad',
    href: '/launchpad',
    activeOn: ['/launchpad'],
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.6} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-[21px] h-[21px]">
        <path d="M5 16c-1.5 1.3-2 5-2 5s3.7-.5 5-2" /><path d="M9 14c5-8 9-9 12-9 0 3-1 7-9 12" />
        <path d="M9 14l-3-1 1-3" /><path d="M10 15l1 3 3-1" /><circle cx="15" cy="9" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    href: '/settings',
    activeOn: ['/settings'],
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.6} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-[21px] h-[21px]">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
]

export default function BottomTabBar() {
  const pathname = usePathname()
  const keyboardOpen = useUIStore((s) => s.keyboardOpen)

  if (keyboardOpen) return null

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40"
      style={{
        height: 'calc(var(--mpm-tabbar-h) + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'var(--mpm-panel)',
        borderTop: '1px solid var(--mpm-border)',
      }}
    >
      <div className="max-w-lg mx-auto h-full flex" style={{ height: 'var(--mpm-tabbar-h)' }}>
        {TABS.map((tab) => {
          const isActive = tab.activeOn.some((p) => pathname.startsWith(p))
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
              style={{ color: isActive ? 'var(--mpm-primary)' : 'var(--mpm-muted)' }}
            >
              {tab.icon(isActive)}
              <span className="text-[9px] font-medium tracking-wide">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
