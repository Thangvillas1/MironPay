import { redirect } from 'next/navigation'
import { getServerUser } from '@/app/lib/supabase-auth-server'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/')

  return <>{children}</>
}
