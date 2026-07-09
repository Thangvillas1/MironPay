'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Tab = {
  label: string
  href: string
  activeOn: string[]
  icon: (active: boolean) => React.ReactNode
}

const TABS: Tab[] = [
  {
    label: 'Wallet',
    href: '/dashboard',
    activeOn: ['/dashboard', '/token'],
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.6} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    label: 'Contacts',
    href: '#',
    activeOn: [],
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.6} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    label: 'Agent',
    href: '/agent',
    activeOn: ['/agent'],
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.6} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
        <path d="M12 2l2.4 6.4L21 9l-5.4 5 1.8 7L12 17.5 6.6 21l1.8-7L3 9l6.6-.6z" />
      </svg>
    ),
  },
  {
    label: 'Leaderboard',
    href: '#',
    activeOn: [],
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.6} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
        <rect x="3" y="12" width="4" height="9" rx="1" />
        <rect x="10" y="6" width="4" height="15" rx="1" />
        <rect x="17" y="2" width="4" height="19" rx="1" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    href: '#',
    activeOn: [],
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.6} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
]

export default function BottomTabBar() {
  const pathname = usePathname()

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-mp-card border-t border-white/8" style={{ height: 56 }}>
      <div className="max-w-lg mx-auto h-full flex">
        {TABS.map((tab) => {
          const isActive = tab.activeOn.some((p) => pathname.startsWith(p))
          const isDisabled = tab.href === '#'

          if (isDisabled) {
            return (
              <div key={tab.label} className="flex-1 flex flex-col items-center justify-center gap-0.5 opacity-25 text-mp-muted">
                {tab.icon(false)}
                <span className="text-[9px] font-medium tracking-wide">{tab.label}</span>
              </div>
            )
          }

          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-mp-primary' : 'text-mp-muted hover:text-mp-text'
              }`}
            >
              {tab.icon(isActive)}
              <span className="text-[9px] font-medium tracking-wide">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
