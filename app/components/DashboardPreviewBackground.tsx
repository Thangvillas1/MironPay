/**
 * Static, empty-state visual echo of the real dashboard (app/(app)/dashboard/page.tsx
 * + app/components/Sidebar.tsx), used only as the blurred backdrop on "/" before login.
 * No auth, no data fetching, no interactivity — deliberately a separate file so it can
 * never regress the real dashboard, which is wired to real money and real Circle/Supabase
 * calls. Mirrors the real dashboard's own mobile/desktop split (lg:hidden / hidden lg:flex)
 * so phones get the phone layout and desktops get the desktop layout, not one stretched
 * over the other.
 */
const QUICK_ACTIONS = [
  { label: 'Send', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M7 17L17 7M17 7H9M17 7v8" /></svg> },
  { label: 'Receive', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M17 7L7 17M7 17h8M7 17V9" /></svg> },
  { label: 'Swap', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M7 4v12M7 16l-3-3M7 16l3-3" /><path d="M17 20V8M17 8l-3 3M17 8l3 3" /></svg> },
  { label: 'Scan QR', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M14 21h3M21 14v3M21 21v.01" /></svg> },
]

const NAV_ITEMS = [
  { label: 'Dashboard', active: true, icon: <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9.5 20v-5h5v5" /></svg> },
  { label: 'Wallet', active: false, icon: <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="17" cy="14.5" r="1.2" /></svg> },
  { label: 'Payroll', active: false, icon: <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 12h18" /></svg> },
  { label: 'Leaderboard', active: false, icon: <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M7 5h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4v2a3 3 0 0 0 3 3" /><path d="M17 6h3v2a3 3 0 0 1-3 3" /><path d="M12 14v3" /><path d="M8.5 20h7l-.7-2.5h-5.6z" /></svg> },
  { label: 'Activity', active: false, icon: <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2 6 4-13 2 7h6" /></svg> },
]

function MobilePreview() {
  return (
    <div className="lg:hidden min-h-screen" style={{ background: 'var(--mpm-page)' }}>
      <div className="max-w-[440px] mx-auto px-[18px]" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 24px)', paddingBottom: 90 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[11px]">
            <span className="p-[2px] rounded-full inline-flex shrink-0" style={{ background: 'var(--mpm-grad-primary)' }}>
              <span className="w-[42px] h-[42px] rounded-full flex items-center justify-center overflow-hidden" style={{ background: 'var(--mpm-panel)' }}>
                <span style={{ color: 'var(--mpm-text)', fontSize: 15, fontWeight: 700 }}>M</span>
              </span>
            </span>
            <div>
              <div style={{ fontSize: 12.5, color: 'var(--mpm-muted)' }}>Welcome back</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--mpm-text)' }}>@wallet</div>
            </div>
          </div>
          <div className="w-9 h-9 rounded-full" style={{ background: 'var(--mpm-input)' }} />
        </div>

        <div className="relative overflow-hidden flex flex-col" style={{
          marginTop: 16, padding: '26px 24px 22px', borderRadius: 'var(--mpm-radius-xl)',
          background: 'linear-gradient(150deg, rgba(47,107,255,0.24), rgba(109,108,255,0.06) 55%), var(--mpm-glass-bg)',
          border: '1px solid var(--mpm-glass-border)', boxShadow: 'var(--mpm-glow-blue), var(--mpm-shadow-lg), inset 0 1px 0 var(--mpm-glass-hi)',
        }}>
          <div className="absolute pointer-events-none" style={{ top: -60, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(109,108,255,0.28), transparent 70%)' }} />
          <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--mpm-muted)', letterSpacing: '0.03em' }}>Total balance</div>
          <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.03em', color: 'var(--mpm-text)', lineHeight: 1, marginTop: 6 }}>$0.00</div>
          <div className="flex items-center gap-3" style={{ marginTop: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--mpm-muted2)' }}>Main <b style={{ color: 'var(--mpm-muted)', fontWeight: 600 }}>$0.00</b></span>
            <span style={{ fontSize: 11, color: 'var(--mpm-muted2)' }}>Agent <b style={{ color: 'var(--mpm-muted)', fontWeight: 600 }}>$0.00</b></span>
          </div>
        </div>

        <div className="mt-5 mb-2 px-1.5">
          <div className="flex justify-between">
            {QUICK_ACTIONS.map(a => (
              <div key={a.label} className="flex flex-col items-center gap-1.5">
                <div className="w-12 h-12 rounded-[12px] flex items-center justify-center" style={{ background: 'var(--mpm-input)', color: 'var(--mpm-muted)' }}>
                  {a.icon}
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--mpm-text)' }}>{a.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6" style={{
          background: 'var(--mpm-glass-bg)', borderRadius: 'var(--mpm-radius-lg)',
          border: '1px solid var(--mpm-glass-border)', boxShadow: 'inset 0 1px 0 var(--mpm-glass-hi)', padding: 6,
        }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3 px-2.5 py-2.5" style={{ borderBottom: i < 2 ? '1px solid var(--mpm-border)' : 'none' }}>
              <span className="w-9 h-9 rounded-full shrink-0" style={{ background: 'var(--mpm-input)' }} />
              <div className="flex-1 min-w-0">
                <div style={{ height: 10, width: 60, borderRadius: 4, background: 'var(--mpm-input)' }} />
                <div style={{ height: 8, width: 90, borderRadius: 4, background: 'var(--mpm-input)', marginTop: 6 }} />
              </div>
              <div style={{ height: 10, width: 40, borderRadius: 4, background: 'var(--mpm-input)' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DesktopSidebar() {
  return (
    <aside className="hidden lg:flex flex-col shrink-0" style={{ width: 236, height: '100vh', padding: '22px 14px', borderRight: '1px solid rgba(var(--c-fg-rgb),.08)', background: 'var(--c-panel)' }}>
      <div className="flex items-center gap-2.5 px-2" style={{ marginBottom: 26 }}>
        <span className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: 'var(--mpm-grad-primary)', color: '#fff', fontSize: 13, fontWeight: 700 }}>Mi</span>
        <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--c-text)' }}>MironPay</span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(item => (
          <div key={item.label} className="flex items-center gap-3 px-3" style={{
            height: 40, borderRadius: 10,
            background: item.active ? 'var(--mpm-grad-primary)' : 'transparent',
            color: item.active ? '#fff' : 'var(--c-muted)',
            fontSize: 14, fontWeight: 600,
          }}>
            {item.icon}{item.label}
          </div>
        ))}
      </nav>
    </aside>
  )
}

function DesktopPreview() {
  return (
    <div className="hidden lg:flex overflow-hidden" style={{ height: '100vh', background: 'radial-gradient(1000px 520px at 16% -8%,rgba(99,102,241,.18),transparent 60%),radial-gradient(760px 520px at 102% -4%,rgba(139,124,255,.10),transparent 56%),var(--c-page)' }}>
      <DesktopSidebar />
      <main style={{ flex: 1, minWidth: 0, padding: '24px 26px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 344px', gap: 22, height: '100vh', overflow: 'hidden' }}>
        {/* CONTENT COLUMN */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            <div style={{ position: 'relative', overflow: 'hidden', padding: '18px 20px', borderRadius: 14, background: 'var(--wc-blue-grad)', border: '1px solid var(--wc-blue-border)', boxShadow: '0 8px 32px rgba(99,102,241,.28)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-muted)' }}>Main Wallet</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-.02em', marginTop: 8 }}>$0.00</div>
              <div style={{ height: 46, marginTop: 10, borderRadius: 8, background: 'rgba(var(--c-fg-rgb),.05)' }} />
            </div>
            <div style={{ position: 'relative', overflow: 'hidden', padding: '18px 20px', borderRadius: 14, background: 'var(--wc-purple-grad)', border: '1px solid var(--wc-purple-border)', boxShadow: '0 8px 32px rgba(139,124,255,.28)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-muted)' }}>Agent Wallet</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-.02em', marginTop: 8 }}>$0.00</div>
              <div style={{ height: 46, marginTop: 10, borderRadius: 8, background: 'rgba(var(--c-fg-rgb),.05)' }} />
            </div>
            <div style={{ position: 'relative', overflow: 'hidden', padding: '18px 20px', borderRadius: 14, background: 'color-mix(in srgb, var(--c-panel) 55%, transparent)', border: '1px solid rgba(var(--c-fg-rgb),.10)', boxShadow: '0 10px 40px rgba(34,198,224,.22)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-muted)' }}>Agent status</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-.02em', marginTop: 8 }}>$0.00</div>
              <div style={{ height: 6, borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.06)', marginTop: 20 }} />
            </div>
          </div>
          {/* Agent chat placeholder */}
          <div style={{ borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.14)', flex: 1, minHeight: 0 }} />
        </section>

        {/* RIGHT RAIL — mirrors the real dashboard's "Your AI Agent" + "Recent Activity" column width */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={{ borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.14)', height: 220 }} />
          <div style={{ borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.14)', flex: 1, minHeight: 0 }} />
        </aside>
      </main>
    </div>
  )
}

export default function DashboardPreviewBackground() {
  return (
    <div aria-hidden="true">
      <MobilePreview />
      <DesktopPreview />
    </div>
  )
}
