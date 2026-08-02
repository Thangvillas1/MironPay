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
  hidden?: boolean
  icon: React.ReactNode
  children?: NavItem[]
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
    hidden: true, // temporarily hidden — flip back to false to bring it back
    icon: (
      <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 16c-1.5 1.3-2 5-2 5s3.7-.5 5-2" /><path d="M9 14c5-8 9-9 12-9 0 3-1 7-9 12" />
        <path d="M9 14l-3-1 1-3" /><path d="M10 15l1 3 3-1" /><circle cx="15" cy="9" r="1.4" />
      </svg>
    ),
  },
  {
    label: 'Business Apps',
    href: '/payroll',
    activeOn: ['/payroll', '/invoice', '/store', '/business'],
    icon: (
      <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 12h18" />
      </svg>
    ),
    children: [
      {
        label: 'Payroll',
        href: '/payroll/claim/new',
        activeOn: ['/payroll/claim'],
        icon: null,
      },
      {
        label: 'Invoice',
        href: '#',
        activeOn: [],
        disabled: true,
        icon: null,
      },
      {
        label: 'Store',
        href: '#',
        activeOn: [],
        disabled: true,
        icon: null,
      },
      {
        label: 'Other',
        href: '#',
        activeOn: [],
        disabled: true,
        icon: null,
      },
    ],
  },
  {
    label: 'Mobile App',
    href: '/mobile-app',
    activeOn: ['/mobile-app'],
    icon: (
      <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="2" width="12" height="20" rx="2" /><line x1="10" y1="19" x2="14" y2="19" />
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
  const [username, setUsername] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    setIsDark(localStorage.getItem('theme') !== 'light')
  }, [])

  useEffect(() => {
    if (!user?.id) return
    supabase.from('profiles').select('username').eq('id', user.id).single()
      .then(({ data }) => setUsername(data?.username ?? null))
  }, [user?.id])

  function handleCopyUsername() {
    if (!username) return
    navigator.clipboard.writeText(`@${username}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

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
        {NAV_ITEMS.filter(item => !item.hidden).map((item) => {
          const isActive = item.activeOn.some(p => pathname.startsWith(p))

          if (item.children) {
            const isOpen = expanded === item.label || isActive
            return (
              <div key={item.label}>
                <button
                  onClick={() => setExpanded(isOpen ? null : item.label)}
                  className="mp-nav-item"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 13px', borderRadius: 10, border: 'none', background: 'none',
                    fontSize: 14.5, fontWeight: isActive ? 600 : 500, cursor: 'pointer', width: '100%', textAlign: 'left',
                    color: isActive ? 'var(--c-text)' : undefined,
                  }}
                >
                  {item.icon}
                  <span style={{ flex: 1 }}>{item.label}</span>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 31, marginTop: 2, marginBottom: 2 }}>
                    {item.children.map((child) => {
                      const childActive = child.activeOn.some(p => pathname.startsWith(p))

                      if (child.disabled) {
                        return (
                          <div
                            key={child.label}
                            style={{
                              padding: '9px 13px', borderRadius: 8,
                              fontSize: 13.5, fontWeight: 500,
                              color: 'var(--c-muted)', opacity: 0.4, cursor: 'not-allowed',
                            }}
                          >
                            {child.label}
                          </div>
                        )
                      }

                      return (
                        <Link
                          key={child.label}
                          href={child.href}
                          className={childActive ? undefined : 'mp-nav-item'}
                          style={{
                            padding: '9px 13px', borderRadius: 8, textDecoration: 'none',
                            fontSize: 13.5, fontWeight: childActive ? 600 : 500,
                            color: childActive ? 'var(--c-on-primary)' : undefined,
                            background: childActive ? 'var(--grad-primary)' : 'none',
                          }}
                        >
                          {child.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
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

          <div style={{ minWidth: 0, flex: 1 }}>
            <button
              onClick={handleCopyUsername}
              disabled={!username}
              title={username ? 'Copy @username' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'none', border: 'none', padding: 0,
                cursor: username ? 'pointer' : 'default', width: '100%',
              }}
            >
              <span style={{
                fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)', fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left',
              }}>
                {username ? `@${username}` : handle}
              </span>
              {username && (
                copied ? (
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--c-success)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--c-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
                  </svg>
                )
              )}
            </button>
            <div style={{ fontSize: 12, color: 'var(--c-muted)', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.email}
            </div>
          </div>

          <button
            onClick={handleSignOut}
            title="Sign out"
            className="mp-iconbtn"
            style={{
              flexShrink: 0, width: 28, height: 28, borderRadius: 8, border: 'none', background: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-muted)',
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
