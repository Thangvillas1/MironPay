import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'MironPay',
  description: 'MironPay Store & Wallet on Arc',
  manifest: '/manifest-m.json',
  appleWebApp: {
    capable: true,
    // 'default' draws a solid, fixed white OS status bar that our page can
    // never repaint — a permanent seam against a dark theme. 'black-
    // translucent' instead lets the page draw all the way under the real
    // notch/status bar, so env(safe-area-inset-top) padding plus the
    // mock's own --bg color fills that area and tracks light/dark exactly.
    statusBarStyle: 'black-translucent',
    title: 'MironPay',
  },
}

// Matches the mock's default light background (thm-light --bg: #f5f4f2).
// Kept in sync at runtime with the in-app theme toggle (see app/m/page.tsx's
// 'mironpay:theme' listener) — this is just the pre-hydration fallback.
export const viewport: Viewport = {
  themeColor: '#f5f4f2',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function MLayout({ children }: { children: React.ReactNode }) {
  return children
}
