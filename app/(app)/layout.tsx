import { redirect } from 'next/navigation'
import AppShell from '@/app/components/AppShell'
import { hasServerSession } from '@/app/lib/supabase-auth-server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasServerSession())) redirect('/')

  return <AppShell>{children}</AppShell>
}
