import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'MironPay',
  description: 'MironPay Store & Wallet on Arc',
  manifest: '/manifest-m.json',
  appleWebApp: {
    capable: true,
    // 'default' reserves real space for iOS's own status bar instead of
    // letting page content draw underneath it — the mock's fake "9:41"
    // status bar (hidden on real devices, see mp-real CSS) was only ever
    // needed to fill that space when the bar was translucent/overlaid.
    statusBarStyle: 'default',
    title: 'MironPay',
  },
}

export default function MLayout({ children }: { children: React.ReactNode }) {
  return children
}
