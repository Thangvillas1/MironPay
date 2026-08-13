import AppShell from '@/app/components/AppShell'

export default function MobileAppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
