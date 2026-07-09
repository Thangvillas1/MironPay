'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { useAuthStore } from '@/app/store/auth'
import { useWalletStore } from '@/app/store/wallet'

const IcSun = () => (
  <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
)
const IcMoon = () => (
  <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

type NavItem = {
  label: string
  href: string
  activeOn: string[]
  disabled?: boolean
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    activeOn: ['/dashboard', '/token', '/agent'],
    icon: (
      <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9.5 20v-5h5v5" />
      </svg>
    ),
  },
  {
    label: 'Wallet',
    href: '/wallet',
    activeOn: ['/wallet'],
    icon: (
      <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="17" cy="14.5" r="1.2" />
      </svg>
    ),
  },
  {
    label: 'Launchpad',
    href: '/launchpad',
    activeOn: ['/launchpad'],
    icon: (
      <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 16c-1.5 1.3-2 5-2 5s3.7-.5 5-2" /><path d="M9 14c5-8 9-9 12-9 0 3-1 7-9 12" />
        <path d="M9 14l-3-1 1-3" /><path d="M10 15l1 3 3-1" /><circle cx="15" cy="9" r="1.4" />
      </svg>
    ),
  },
  {
    label: 'Business',
    href: '#',
    activeOn: [],
    disabled: true,
    icon: (
      <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 12h18" />
      </svg>
    ),
  },
  {
    label: 'Leaderboard',
    href: '#',
    activeOn: [],
    disabled: true,
    icon: (
      <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 5h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4v2a3 3 0 0 0 3 3" />
        <path d="M17 6h3v2a3 3 0 0 1-3 3" /><path d="M12 14v3" /><path d="M8.5 20h7l-.7-2.5h-5.6z" />
      </svg>
    ),
  },
  {
    label: 'Activity',
    href: '#',
    activeOn: [],
    disabled: true,
    icon: (
      <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h4l2 6 4-13 2 7h6" />
      </svg>
    ),
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, setUser } = useAuthStore()
  const { tokenList, setWallet, setTransactions, setTokenList, setWalletAddress, setLastFetched } = useWalletStore()

  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    setIsDark(localStorage.getItem('theme') !== 'light')
  }, [])

  function toggleTheme() {
    const newDark = !isDark
    setIsDark(newDark)
    localStorage.setItem('theme', newDark ? 'dark' : 'light')
    document.documentElement.classList.toggle('light', !newDark)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setUser(null)
    setWallet(null)
    setTransactions([])
    setTokenList([])
    setWalletAddress(null)
    setLastFetched(0)
    router.replace('/')
  }

  const handle = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'User'
  const initials = handle.slice(0, 1).toUpperCase()
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined

  return (
    <aside
      className="hidden lg:flex fixed left-0 top-0 bottom-0 flex-col z-40"
      style={{ width: 236, background: 'var(--c-sidebar)', borderRight: '1px solid var(--c-border)', padding: '22px 16px' }}
    >
      {/* ── Logo ── */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 0 26px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/miron-logo-lockup-horizontal-dark.png" alt="MironPay" className="mp-logo-dark" style={{ height: 54, width: 'auto' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/miron-logo-lockup-horizontal-light.png" alt="MironPay" className="mp-logo-light" style={{ height: 54, width: 'auto' }} />
      </div>

      {/* ── Navigation ── */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.activeOn.some(p => pathname.startsWith(p))

          if (item.disabled) {
            return (
              <div
                key={item.label}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 13px', borderRadius: 10,
                  fontSize: 14.5, fontWeight: 500,
                  color: 'var(--c-muted)', opacity: 0.4, cursor: 'not-allowed',
                }}
              >
                {item.icon}
                {item.label}
              </div>
            )
          }

          if (isActive) {
            return (
              <Link
                key={item.label}
                href={item.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 13px', borderRadius: 10, textDecoration: 'none',
                  fontSize: 14.5, fontWeight: 600,
                  color: 'var(--c-on-primary)',
                  background: 'var(--grad-primary)',
                  boxShadow: 'var(--glow-primary)',
                }}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className="mp-nav-item"
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 13px', borderRadius: 10, textDecoration: 'none',
                fontSize: 14.5, fontWeight: 500,
              }}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}

        <button
          onClick={toggleTheme}
          className="mp-nav-item"
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '11px 13px', borderRadius: 10, border: 'none', background: 'none',
            fontSize: 14.5, fontWeight: 500, cursor: 'pointer', width: '100%', textAlign: 'left',
          }}
        >
          {isDark ? <IcSun /> : <IcMoon />}
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
      </nav>

      <div style={{ flex: 1 }} />

      {/* ── Bottom card ── */}
      <div style={{ padding: 13, borderRadius: 14, background: 'var(--c-panel)', border: '1px solid var(--c-border)' }}>
        {/* User info */}
        <button
          onClick={handleSignOut}
          style={{
            display: 'flex', alignItems: 'center', gap: 11,
            width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          <div style={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
            background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{initials}</span>
            }
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
              {handle}
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-muted)', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.email}
            </div>
          </div>
        </button>
      </div>
    </aside>
  )
}
