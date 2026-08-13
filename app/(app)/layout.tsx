import { redirect } from 'next/navigation'
import AppShell from '@/app/components/AppShell'
import { getServerUser } from '@/app/lib/supabase-auth-server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/')

  return <AppShell>{children}</AppShell>
}
