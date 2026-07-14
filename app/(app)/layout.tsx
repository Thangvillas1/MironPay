'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/app/components/Sidebar'
import BottomTabBar from '@/app/components/BottomTabBar'
import DailyLoginTracker from '@/app/components/DailyLoginTracker'

// The chat page manages its own full-viewport layout and reserves space
// for the tab bar itself (dynamically, based on keyboard state) — the
// global static padding-bottom would otherwise double up with it.
const NO_CONTENT_PAD_ROUTES = ['/agent']

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const skipContentPad = NO_CONTENT_PAD_ROUTES.includes(pathname)

  return (
    <div className="min-h-screen bg-mp-bg">
      <DailyLoginTracker />
      <Sidebar />
      <div className={`lg:ml-[236px] ${skipContentPad ? '' : 'mp-app-content-pad'}`}>
        {children}
      </div>
      <BottomTabBar />
    </div>
  )
}
