// Shared formatters/constants for the Launchpad UI. Project content itself
// (seed data) lives in Supabase (launchpad_submissions/launchpad_sales) and
// on-chain (IDOLaunchpad.sol) — see app/api/launchpad/sales/*.

export type ProjectStatus = 'live' | 'soon' | 'ended'

const TEAM_ACCENT_POOL = ['#6366f1', '#8b7cff', '#22c6e0']

export function fmtUsd(n: number): string {
  if (n >= 1000) {
    const k = n / 1000
    return '$' + (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'K'
  }
  return '$' + n.toLocaleString('en-US')
}
export function fmtNum(n: number): string { return n.toLocaleString('en-US') }
export function fmtPrice(n: number): string { return '$' + n.toFixed(3) }
export function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}
export function teamAccent(i: number): string { return TEAM_ACCENT_POOL[i % TEAM_ACCENT_POOL.length] }

export const STATUS_PILL: Record<ProjectStatus, { label: string; bg: string; fg: string }> = {
  live: { label: 'Live', bg: 'rgba(45,212,191,.14)', fg: '#2dd4bf' },
  soon: { label: 'Upcoming', bg: 'rgba(99,102,241,.14)', fg: 'var(--c-indigo-light)' },
  ended: { label: 'Ended', bg: 'rgba(var(--c-fg-rgb),.05)', fg: 'var(--c-muted)' },
}

export const CTA_LABEL: Record<ProjectStatus, string> = { live: 'View sale', soon: 'Details', ended: 'Results' }
