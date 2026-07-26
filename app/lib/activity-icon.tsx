import type { Transaction } from '@/app/lib/types'

/**
 * Shared icon/color rule for any transaction-history row app-wide: swap gets
 * its own icon (never conflated with a plain send), otherwise credit=green /
 * debit=red. Memo takes priority over all of this at the render layer (each
 * caller overrides bg/color when `tx.memo` is set) — kept there rather than
 * here since the memo override also drives a border + a memo icon+text the
 * row itself renders.
 */
export function getActivityIcon(tx: Transaction) {
  const desc = tx.description?.toLowerCase() ?? ''
  const isCredit = tx.type === 'credit'
  if (desc.includes('bridge')) return {
    bg: 'rgba(96,165,250,.16)', color: 'var(--c-blue-accent)',
    icon: <path d="M3 21V10l9-6 9 6v11M7 21v-7h10v7" />,
  }
  if (desc.includes('payroll')) return {
    bg: 'rgba(245,158,11,.16)', color: '#f59e0b',
    icon: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>,
  }
  if (desc.includes('yield')) return {
    bg: 'rgba(34,197,94,.14)', color: '#22c55e',
    icon: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  }
  if (desc.includes('swap')) return {
    bg: 'rgba(139,124,255,.16)', color: 'var(--c-purple-accent)',
    icon: <path d="M6 3h12M6 21h12M7 3c0 4 3 5 5 7 2-2 5-3 5-7M7 21c0-4 3-5 5-7 2 2 5 3 5 7" />,
  }
  if (isCredit) return {
    bg: 'rgba(45,212,191,.14)', color: '#2dd4bf',
    icon: <path d="M12 5v14M19 12l-7 7-7-7" />,
  }
  return {
    bg: 'rgba(251,111,132,.14)', color: '#fb6f84',
    icon: <path d="M12 19V5M5 12l7-7 7 7" />,
  }
}
