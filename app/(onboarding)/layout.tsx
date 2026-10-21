import { redirect } from 'next/navigation'
import { hasServerSession } from '@/app/lib/supabase-auth-server'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasServerSession())) redirect('/')

  return <>{children}</>
}
