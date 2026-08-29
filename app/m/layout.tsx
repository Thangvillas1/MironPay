import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'MironPay',
  description: 'MironPay Store & Wallet on Arc',
  manifest: '/manifest-m.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MironPay',
  },
}

export default function MLayout({ children }: { children: React.ReactNode }) {
  return children
}
