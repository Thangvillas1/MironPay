import Sidebar from '@/app/components/Sidebar'
import BottomTabBar from '@/app/components/BottomTabBar'
import DailyLoginTracker from '@/app/components/DailyLoginTracker'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-mp-bg">
      <DailyLoginTracker />
      <Sidebar />
      <div className="lg:ml-[236px]">
        {children}
      </div>
      <BottomTabBar />
    </div>
  )
}
