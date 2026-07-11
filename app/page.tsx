'use client'

import { useEffect, useRef, useState, useCallback, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, isSupabaseConfigured } from '@/app/lib/supabase'
import { isOnboardingComplete } from '@/app/lib/onboarding'

/* ─────────── SVG Icons (from design system) ─────────── */
function IcGoogle({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 6.94L5.84 9.9C6.71 7.3 9.14 4.75 12 4.75Z" />
    </svg>
  )
}
function IcSun() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={12} r={4.2} />
      <path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6" />
    </svg>
  )
}
function IcMoon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}
function IcCheck({ size = 18, stroke = 'var(--c-success)' }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
function IcSpinner() {
  return (
    <span className="mp-spinner" style={{ width: 18, height: 18, borderRadius: '50%', border: '2.4px solid rgba(255,255,255,.35)', borderTopColor: '#fff', display: 'inline-block' }} />
  )
}
function IcCheckWhite({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
function IcArrow({ stroke = '#fff' }: { stroke?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  )
}
function IcSend() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
    </svg>
  )
}

/* Feature icons — exact SVG paths from design */
function FeatIcon01() {
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
function FeatIcon02() {
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 19v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <path d="M9.5 9.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  )
}
function FeatIcon03() {
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 4.5 13H11l-1 9 8.5-11H12z" />
    </svg>
  )
}
function FeatIcon04() {
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" />
      <rect x={4} y={8} width={16} height={12} rx={1} />
      <path d="M2 14h2M20 14h2M9 13v2M15 13v2" />
    </svg>
  )
}

/* Security icons */
function SecIcon({ d }: { d: string | string[]; size?: number }) {
  const paths = Array.isArray(d) ? d : [d]
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ color: '#818cf8', display: 'flex' }}>
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

/* ─────────── Aurora background ─────────── */
const TWINKLE_PTS: [number, number][] = [
  [8, 18], [22, 54], [37, 22], [49, 68], [61, 30], [73, 58], [86, 24], [92, 62],
  [15, 80], [44, 88], [67, 84], [31, 12], [78, 12], [56, 48],
]

const TWINKLE_DURS = [2.6, 3.3, 4.0, 4.7]

function AuroraCanvas() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div className="mp-drift1" style={{ position: 'absolute', top: '-18vh', left: '-12vw', width: '62vw', height: '62vw', borderRadius: '50%', background: 'radial-gradient(circle,rgba(99,102,241,.30),transparent 64%)', filter: 'blur(30px)' }} />
      <div className="mp-drift2" style={{ position: 'absolute', top: '24vh', right: '-16vw', width: '58vw', height: '58vw', borderRadius: '50%', background: 'radial-gradient(circle,rgba(139,124,255,.22),transparent 64%)', filter: 'blur(30px)' }} />
      <div className="mp-drift3" style={{ position: 'absolute', bottom: '-22vh', left: '18vw', width: '56vw', height: '56vw', borderRadius: '50%', background: 'radial-gradient(circle,rgba(34,198,224,.16),transparent 64%)', filter: 'blur(34px)' }} />
      <div style={{ position: 'absolute', inset: 0, opacity: .5 }}>
        {TWINKLE_PTS.map(([l, t], i) => (
          <div key={i} style={{
            position: 'absolute', left: `${l}%`, top: `${t}%`,
            width: 3, height: 3, borderRadius: '50%', background: 'var(--lp-star)',
            animation: `mpTwinkle ${TWINKLE_DURS[i % 4]}s ${(i * 0.31).toFixed(2)}s ease-in-out infinite`,
          }} />
        ))}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 50% 0%,transparent 40%,var(--lp-bg) 92%)' }} />
    </div>
  )
}

/* ─────────── Nav ─────────── */
type GoogleState = 'idle' | 'busy' | 'done'

function Nav({ isLight, onToggle, onSignIn }: { isLight: boolean; onToggle: () => void; onSignIn: () => void }) {
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onScroll = () => {
      const nav = navRef.current; if (!nav) return
      const on = window.scrollY > 16
      nav.style.background = on ? 'var(--c-overlay)' : 'transparent'
      nav.style.backdropFilter = on ? 'blur(14px)' : 'none';
      (nav.style as unknown as Record<string,string>).webkitBackdropFilter = on ? 'blur(14px)' : 'none'
      nav.style.borderBottom = '1px solid ' + (on ? 'var(--c-border)' : 'transparent')
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 80), behavior: 'smooth' })
  }

  return (
    <header ref={navRef} style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40, transition: 'background .3s,backdrop-filter .3s' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', height: 70, padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
        {/* Logo */}
        <div onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/miron-logo-lockup-horizontal-dark.png" alt="MironPay" className="mp-logo-dark" style={{ height: 40, width: 'auto' }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/miron-logo-lockup-horizontal-light.png" alt="MironPay" className="mp-logo-light" style={{ height: 40, width: 'auto' }} />
        </div>
        {/* Links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          <a onClick={() => scrollTo('features')} className="mp-nav-link" style={{ fontSize: 14, fontWeight: 500, color: 'var(--lp-muted)', cursor: 'pointer' }}>Product</a>
          <a onClick={() => scrollTo('security')} className="mp-nav-link" style={{ fontSize: 14, fontWeight: 500, color: 'var(--lp-muted)', cursor: 'pointer' }}>Security</a>
          <a onClick={() => scrollTo('developers')} className="mp-nav-link" style={{ fontSize: 14, fontWeight: 500, color: 'var(--lp-muted)', cursor: 'pointer' }}>Transparency</a>
        </nav>
        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <button onClick={onToggle} className="mp-iconbtn" title="Toggle theme" style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid var(--c-border)', background: 'var(--c-input)', color: 'var(--lp-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            {isLight ? <IcSun /> : <IcMoon />}
          </button>
          <button onClick={onSignIn} className="mp-btn mp-btn-bounce" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 18px', borderRadius: 11, border: '1px solid rgba(0,0,0,.12)', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.12)', color: '#141221', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            <IcGoogle size={15} className="ic-google-logo" /> Sign in
          </button>
        </div>
      </div>
    </header>
  )
}

/* ─────────── Hero orb ─────────── */
/* ─────────── Hero ─────────── */
function Hero({ googleState, onSignIn, error }: { googleState: GoogleState; onSignIn: () => void; error?: string }) {
  const g = googleState
  const gBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11,
    height: 58, padding: '0 14px 0 30px', borderRadius: 9999,
    border: g === 'idle' ? '1px solid rgba(0,0,0,.12)' : 'none',
    fontSize: 15.5, fontWeight: 600, cursor: 'pointer',
    color: g === 'idle' ? '#141221' : '#fff',
    background: g === 'idle' ? '#fff' : 'var(--grad-primary)',
    boxShadow: g === 'idle' ? '0 1px 3px rgba(0,0,0,.12)' : 'var(--glow-primary)',
  } as React.CSSProperties

  // Measure the text column so the banner iframe can mask out that exact
  // region — the iframe's WebGL content ignores normal z-index (browser
  // compositor quirk with GPU-accelerated iframe content), so instead of
  // fighting stacking order we just never render pixels behind the text.
  const textRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const [maskStyle, setMaskStyle] = useState<{ WebkitMaskImage?: string; maskImage?: string }>({})

  useEffect(() => {
    const measure = () => {
      const textEl = textRef.current, sectionEl = sectionRef.current
      if (!textEl || !sectionEl) return
      const t = textEl.getBoundingClientRect()
      const s = sectionEl.getBoundingClientRect()
      const pad = 24
      const x = ((t.left - s.left - pad) / window.innerWidth) * 100
      const y = ((t.top - s.top - pad) / s.height) * 100
      const w = ((t.width + pad * 2) / window.innerWidth) * 100
      const h = ((t.height + pad * 2) / s.height) * 100
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' preserveAspectRatio='none'><defs><filter id='b'><feGaussianBlur stdDeviation='2'/></filter></defs><rect width='100' height='100' fill='#fff'/><rect x='${x}' y='${y}' width='${w}' height='${h}' rx='4' fill='#000' filter='url(#b)'/></svg>`
      const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
      setMaskStyle({ WebkitMaskImage: url, maskImage: url })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  return (
    <section ref={sectionRef} style={{ position: 'relative', zIndex: 1, isolation: 'isolate', maxWidth: 1240, margin: '0 auto', padding: '164px 28px 90px', minHeight: '100vh', display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 24, alignItems: 'center' }}>
      {/* falling coins/leaves banner — full-bleed across the viewport, breaking out of the section's maxWidth, masked to skip the text column */}
      <iframe
        src="/miron-banner.html"
        title=""
        style={{ position: 'absolute', top: 0, left: '50%', width: '100vw', height: '100%', transform: 'translateX(-50%)', border: 'none', zIndex: -1, pointerEvents: 'none', WebkitMaskSize: '100% 100%', maskSize: '100% 100%', ...maskStyle }}
      />
      {/* scrim — sits between the banner and the text, dims the banner ~50% so the text pops more */}
      <div style={{ position: 'absolute', top: 0, left: '50%', width: '100vw', height: '100%', transform: 'translateX(-50%)', zIndex: 0, pointerEvents: 'none', background: 'var(--lp-bg)', opacity: 0.5 }} />
      <div ref={textRef} style={{ position: 'relative', zIndex: 2, transform: 'translateZ(0)' }}>
        {/* eyebrow pill */}
        <div className="rv in" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 30, padding: '0 13px', borderRadius: 9999, background: 'var(--glass-bg)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid var(--glass-border)', fontSize: 11.5, fontWeight: 600, letterSpacing: '.02em', color: 'var(--lp-muted)' }}>
          <span className="mp-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 9px #6366f1', display: 'inline-block' }} />
          Arc Blockchain · Powered by Circle
        </div>
        {/* headline */}
        <h1 style={{ margin: '30px 0 0', fontSize: 'clamp(46px,5.4vw,84px)', lineHeight: .96, fontWeight: 800, letterSpacing: '-.045em' }}>
          Send money<br />like a{' '}
          <span style={{ fontStyle: 'italic', fontWeight: 600, background: 'var(--grad-primary)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>message.</span>
        </h1>
        {/* subtext */}
        <p style={{ margin: '30px 0 0', fontSize: 18.5, lineHeight: 1.62, color: 'var(--lp-muted)', maxWidth: 460 }}>
          MironPay turns stablecoins into something you just send. Tag a <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--lp-text)' }}>@handle</span>, hit send — settled on Arc in under a second. No seed phrase, no gas token.
        </p>
        {/* CTA row */}
        <div style={{ marginTop: 42 }}>
          <button onClick={onSignIn} className="mp-btn mp-btn-bounce" style={gBtn}>
            {g === 'idle' && <><IcGoogle size={20} className="ic-google-logo" /><span>Continue with Google</span><span style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 6 }}><IcArrow stroke="#141221" /></span></>}
            {g === 'busy' && <><IcSpinner /><span>Connecting…</span></>}
            {g === 'done' && <><IcCheckWhite /><span>Opening your wallet…</span></>}
          </button>
          <div style={{ marginTop: 14, fontSize: 13, color: 'var(--lp-muted2)' }}>Google only · no password, no seed phrase</div>
        </div>
        {error && <p style={{ margin: '14px 0 0', fontSize: 13, color: '#f87171' }}>{error}</p>}
      </div>

    </section>
  )
}

/* ─────────── Partner marquee ─────────── */
/* ─────────── Send / payment travel section ─────────── */
function SendSection() {
  const chipRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef<HTMLSpanElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const chip = chipRef.current
    const done = doneRef.current
    if (!chip) return

    const T_TRAVEL = 2300, T_HOLD = 1000, T_GAP = 700, CYCLE = T_TRAVEL + T_HOLD + T_GAP
    const ease = (k: number) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
    const placeChip = (p: number) => {
      const x = 12 + 76 * p
      const y = (1 - p) * (1 - p) * 38 + 2 * (1 - p) * p * 4 + p * p * 38
      chip.style.left = x + '%'
      chip.style.top = (y / 56 * 100) + '%'
    }
    const t0 = performance.now()
    const frame = (now: number) => {
      const t = (now - t0) % CYCLE
      if (t < T_TRAVEL) {
        const p = ease(t / T_TRAVEL)
        placeChip(p)
        chip.style.opacity = '1'
        chip.style.transform = `translate(-50%,-50%) scale(${1 + 0.06 * Math.sin(p * Math.PI)})`
        if (done) { done.style.opacity = '0'; done.style.transform = 'scale(.4)' }
      } else {
        placeChip(1)
        chip.style.opacity = t < T_TRAVEL + 140 ? '1' : '0'
        if (done) { const on = t < T_TRAVEL + T_HOLD; done.style.opacity = on ? '1' : '0'; done.style.transform = on ? 'scale(1)' : 'scale(.4)' }
      }
      rafRef.current = requestAnimationFrame(frame)
    }
    placeChip(0); chip.style.opacity = '0'
    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <section id="travel-sec" style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '120px 28px' }}>
      <div className="rv" style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 56px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#818cf8' }}>Pay anyone, instantly</div>
        <h2 style={{ margin: '16px 0 0', fontSize: 'clamp(34px,4.4vw,56px)', fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1.05 }}>
          Forget <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--lp-muted2)', fontWeight: 600, fontSize: '.62em' }}>0x7a3f…9c2e</span>.<br />
          Just send to <span style={{ color: '#818cf8' }}>@anyone</span>.
        </h2>
      </div>

      {/* stage */}
      <div style={{ position: 'relative', height: 300, maxWidth: 720, margin: '0 auto' }}>
        <svg viewBox="0 0 100 56" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
          <path d="M12 38 Q50 4 88 38" fill="none" stroke="rgba(var(--c-fg-rgb),0.28)" strokeWidth=".4" strokeDasharray="1.4 1.6" strokeLinecap="round" />
        </svg>
        {/* sender */}
        <div style={{ position: 'absolute', left: '12%', top: '68%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
          <div style={{ width: 74, height: 74, borderRadius: '50%', background: 'linear-gradient(140deg,#22c6e0,#0e9bb8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 24, boxShadow: '0 12px 34px rgba(34,198,224,.4)' }}>You</div>
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--lp-muted)' }}>Your wallet</div>
        </div>
        {/* recipient */}
        <div style={{ position: 'absolute', left: '88%', top: '68%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
          <div style={{ position: 'relative', width: 74, height: 74, borderRadius: '50%', background: 'linear-gradient(140deg,#818cf8,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 22, boxShadow: '0 12px 34px rgba(99,102,241,.45)' }}>
            SQ
            <span ref={doneRef} style={{ position: 'absolute', right: -6, bottom: -6, width: 30, height: 30, borderRadius: '50%', background: '#2dd4bf', border: '3px solid var(--lp-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transform: 'scale(.4)', transition: 'opacity .2s,transform .2s' }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </span>
          </div>
          <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600 }}>
            @seunghyeo
            <svg width={14} height={14} viewBox="0 0 24 24" fill="#3b82f6"><path d="M9 12l2 2 4-4M12 2l8 3v5c0 5-3.5 8.5-8 11C7.5 18.5 4 15 4 10V5z" /></svg>
          </div>
        </div>
        {/* traveling coin chip (RAF-driven) */}
        <div ref={chipRef} style={{ position: 'absolute', left: '12%', top: '67.86%', opacity: 0, transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 8, height: 46, padding: '0 16px', borderRadius: 9999, background: 'var(--grad-primary)', boxShadow: '0 14px 40px rgba(99,102,241,.55)', color: '#fff', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 15, whiteSpace: 'nowrap', willChange: 'left,top' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>$</span>
          +20.00 USDC
        </div>
      </div>

      {/* 3 points */}
      <div className="rv" style={{ display: 'flex', justifyContent: 'center', gap: 34, marginTop: 48, flexWrap: 'wrap' }}>
        {['Verified blue check', 'Resolved on-chain', 'Settled in 1.8s'].map(s => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14.5, color: 'var(--lp-text)' }}>
            <IcCheck size={18} stroke="var(--lp-success)" />{s}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ─────────── Features ─────────── */
const FEATURES = [
  { num: '01', title: 'Sign in with Google',  desc: 'No seed phrase, no private key, no password. Your wallet is created the instant you sign in — backed by Circle.', c: '#6366f1', icon: <FeatIcon01 />, rv: 'rv-l', flip: '' },
  { num: '02', title: 'Pay by @username',      desc: 'Send USDC to a handle, not a 42-character hex address. Verified recipients carry a blue check, so you always know who you pay.', c: '#8b7cff', icon: <FeatIcon02 />, rv: 'rv-r', flip: 'flex-direction:row-reverse' },
  { num: '03', title: 'Settled in a second',   desc: 'Transactions confirm on Arc in about a second — fast enough to feel instant, with fees paid in USDC.', c: '#22c6e0', icon: <FeatIcon03 />, rv: 'rv-l', flip: '' },
  { num: '04', title: 'An agent that acts',    desc: 'Tell the Miron Agent what to do in plain language. It sends, swaps and checks balances on-chain — and shows the receipt.', c: '#2dd4bf', icon: <FeatIcon04 />, rv: 'rv-r', flip: 'flex-direction:row-reverse' },
]

function Features() {
  const [signIn, handle, settled, agent] = FEATURES
  const small = [signIn, settled, agent]
  const fCardStyle: React.CSSProperties = { borderRadius: 20, background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', border: '1px solid var(--glass-border)', boxShadow: 'inset 0 1px 0 var(--glass-hi)' }

  return (
    <section id="features" style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '80px 28px' }}>
      <div className="rv" style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#818cf8' }}>Why MironPay</div>
        <h2 style={{ margin: '16px 0 0', fontSize: 'clamp(32px,4.2vw,52px)', fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1.05 }}>A wallet that feels<br />like a chat app</h2>
      </div>
      <div className="rv-s" style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 22 }}>
        {/* stacked small cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {small.map(f => (
            <div key={f.num} style={{ ...fCardStyle, padding: 26, flex: 1, display: 'flex', alignItems: 'center', gap: 18 }}>
              <span style={{ flex: 'none', display: 'flex', width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', color: '#fff', background: `linear-gradient(140deg,${f.c},${f.c}bb)`, boxShadow: `0 12px 28px ${f.c}45` }}>
                {f.icon}
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 700, letterSpacing: '-.01em' }}>{f.title}</h3>
                <p style={{ margin: '5px 0 0', fontSize: 13.5, lineHeight: 1.5, color: 'var(--lp-muted)' }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
        {/* large spotlight card — Pay by @username */}
        <div style={{ ...fCardStyle, padding: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ display: 'flex', width: 84, height: 84, borderRadius: 24, alignItems: 'center', justifyContent: 'center', color: '#fff', background: `linear-gradient(140deg,${handle.c},${handle.c}bb)`, boxShadow: `0 16px 40px ${handle.c}55` }}>
            {handle.icon}
          </span>
          <h3 style={{ margin: '26px 0 0', fontSize: 30, fontWeight: 700, letterSpacing: '-.02em' }}>{handle.title}</h3>
          <p style={{ margin: '13px 0 0', fontSize: 16.5, lineHeight: 1.62, color: 'var(--lp-muted)', maxWidth: 420 }}>{handle.desc}</p>
        </div>
      </div>
    </section>
  )
}

/* ─────────── Agent chat ─────────── */
const VSTYLE_MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--lp-text)' }
const VSTYLE_GOOD: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--lp-success)' }
type Row = { k: string; v: string; vStyle: React.CSSProperties }
type ChatMsg = { isUser?: boolean; isAgent?: boolean; text?: string; title?: string; accent?: string; rows?: Row[] }
const SCENES = [
  { cmd: 'send 20 USDC to @seunghyeo', title: 'Sent successfully', accent: 'var(--lp-success)', rows: [{ k: 'To', v: '@seunghyeo', vStyle: VSTYLE_MONO }, { k: 'Amount', v: '−20.00 USDC', vStyle: VSTYLE_MONO }, { k: 'Fee · settled', v: '~0.001 · 1.8s', vStyle: VSTYLE_GOOD }] },
  { cmd: 'swap 100 USDC for EURC',       title: 'Swap complete',     accent: '#818cf8', rows: [{ k: 'You paid', v: '−100.00 USDC', vStyle: VSTYLE_MONO }, { k: 'You received', v: '+99.42 EURC', vStyle: VSTYLE_GOOD }, { k: 'Rate', v: '1 USDC ≈ 0.9942 EURC', vStyle: VSTYLE_MONO }] },
  { cmd: 'what is the BTC price right now?', title: 'Fetched via x402', accent: '#f5b748', rows: [{ k: 'BTC', v: '$67,240.18', vStyle: VSTYLE_MONO }, { k: '24h', v: '+2.4%', vStyle: VSTYLE_GOOD }, { k: 'Paid', v: '$0.01 USDC · x402', vStyle: VSTYLE_GOOD }] },
  { cmd: 'what is my balance?',          title: 'Your wallets',       accent: '#818cf8', rows: [{ k: 'Main', v: '2,480.55 USDC', vStyle: VSTYLE_MONO }, { k: 'Agent AI', v: '320.00 USDC', vStyle: VSTYLE_MONO }, { k: 'X402', v: '64.20 USDC', vStyle: VSTYLE_MONO }] },
]

function AgentSection() {
  const [feed, setFeed] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const after = useCallback((ms: number, fn: () => void) => { const t = setTimeout(fn, ms); timers.current.push(t); return t }, [])

  const runChat = useCallback(() => {
    let i = 0
    const loop = () => {
      const sc = SCENES[i % SCENES.length]
      setFeed([]); setDraft(''); setTyping(false)
      let n = 0; setDraft('')
      const step = () => {
        n++; setDraft(sc.cmd.slice(0, n))
        if (n < sc.cmd.length) after(34 + Math.random() * 46, step)
        else after(360, () => {
          setFeed([{ isUser: true, text: sc.cmd }]); setDraft(''); setTyping(true)
          after(1250, () => {
            setTyping(false)
            setFeed([{ isUser: true, text: sc.cmd }, { isAgent: true, title: sc.title, accent: sc.accent, rows: sc.rows }])
            i++; after(3000, loop)
          })
        })
      }
      after(220, step)
    }
    loop()
  }, [after])

  useEffect(() => {
    const activeTimers = timers.current
    runChat()
    return () => activeTimers.forEach(clearTimeout)
  }, [runChat])

  return (
    <section style={{ position: 'relative', zIndex: 1, maxWidth: 1080, margin: '0 auto', padding: '100px 28px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 54, alignItems: 'center' }}>
        {/* left */}
        <div className="rv-l">
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#818cf8' }}>Miron Agent · Circle x402</div>
          <h2 style={{ margin: '16px 0 0', fontSize: 'clamp(30px,3.8vw,46px)', fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1.08 }}>Just tell it<br />what to do</h2>
          <p style={{ margin: '18px 0 0', fontSize: 16, lineHeight: 1.65, color: 'var(--lp-muted)', maxWidth: 420 }}>Send, swap, check a price — in plain language. Behind the scenes, the agent settles pay-per-request x402 micropayments on its own, cents at a time, no invoices.</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 24, fontSize: 13, color: 'var(--lp-success)', fontWeight: 600 }}>
            <span className="mp-pulse-fast" style={{ width: 7, height: 7, borderRadius: '50%', background: '#2dd4bf', display: 'inline-block' }} />
            Online · on-chain verified
          </div>
        </div>

        {/* chat */}
        <div className="rv-r" style={{ display: 'flex', flexDirection: 'column', gap: 11, minHeight: 250, justifyContent: 'flex-end' }}>
            {feed.map((m, i) => (
              <div key={i}>
                {m.isUser && (
                  <div style={{ alignSelf: 'flex-end', maxWidth: '78%', padding: '11px 15px', borderRadius: '16px 16px 5px 16px', background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)', color: '#fff', fontSize: 14, fontFamily: 'var(--font-mono)', display: 'flex', justifyContent: 'flex-end', marginLeft: 'auto' }}>
                    {m.text}
                  </div>
                )}
                {m.isAgent && (
                  <div style={{ alignSelf: 'flex-start', width: '90%', padding: '14px 16px', borderRadius: '16px 16px 16px 5px', background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', border: '1px solid var(--glass-border)', boxShadow: 'inset 0 1px 0 var(--glass-hi)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: m.accent }}>
                      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      {m.title}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
                      {m.rows?.map((r, j) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: 'var(--lp-muted)' }}>{r.k}</span>
                          <span style={r.vStyle}>{r.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5, padding: '13px 17px', borderRadius: '16px 16px 16px 5px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                {[0, .18, .36].map((d, i) => (
                  <span key={i} className={`mp-bounce-${i}`} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--lp-muted)', display: 'inline-block' }} />
                ))}
              </div>
            )}
            {/* composer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, height: 46, padding: '0 6px 0 16px', borderRadius: 14, background: 'var(--glass-bg)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid var(--glass-border)' }}>
              <span style={{ flex: 1, fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--lp-text)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {draft}<span className="mp-cursor" />
              </span>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--grad-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <IcSend />
              </span>
            </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────── Security ─────────── */
const SECURITY = [
  { title: 'Circle-secured wallets', d: ['M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z'] },
  { title: 'PIN-protected', d: ['M4 10h16v10H4z', 'M8 10V7a4 4 0 0 1 8 0v3'] },
  { title: 'Agent spending limits', d: ['m9 12 2 2 4-4M12 3l8 3v5c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V6z'] },
  { title: 'On-chain',      d: ['M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'] },
]

function Security() {
  return (
    <section id="security" style={{ position: 'relative', zIndex: 1, maxWidth: 840, margin: '0 auto', padding: '90px 28px', textAlign: 'center' }}>
      {/* shield glow */}
      <div className="rv-s" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <div className="orb-sphere" style={{ position: 'absolute', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle,rgba(99,102,241,.34),transparent 66%)', filter: 'blur(6px)' }} />
        <div style={{ position: 'relative', width: 108, height: 108, borderRadius: 28, background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
      </div>
      <h2 className="rv" style={{ margin: '24px 0 0', fontSize: 'clamp(30px,3.8vw,46px)', fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1.08 }}>
        Your PIN. Your approval.<br />Enforced on-chain.
      </h2>
      <p className="rv" style={{ margin: '18px auto 0', fontSize: 16, lineHeight: 1.6, color: 'var(--lp-muted)', maxWidth: 520 }}>
        Circle-secured wallets, every transfer authorized by your PIN, agent spending capped on-chain — and every transaction verifiable on the Arc explorer.
      </p>
      <div className="rv" style={{ display: 'flex', justifyContent: 'center', gap: 38, marginTop: 36, flexWrap: 'wrap' }}>
        {SECURITY.map(s => (
          <div key={s.title} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 600 }}>
            <SecIcon d={s.d} /> {s.title}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ─────────── Transparency / typewriter terminal ─────────── */
const CODE_TOKENS: Array<{ s: string; c: string }> = [
  { s: '✓', c: 'var(--lp-success)' }, { s: ' Transaction confirmed', c: 'var(--lp-terminal-text)' }, { s: '   Arc Testnet\n', c: 'var(--lp-muted2)' },
  { s: '\n  hash      ', c: 'var(--lp-muted2)' }, { s: '0x7a3f…9c2e', c: '#a5b4fc' },
  { s: '\n  from      ', c: 'var(--lp-muted2)' }, { s: '@you', c: 'var(--lp-terminal-text)' },
  { s: '\n  to        ', c: 'var(--lp-muted2)' }, { s: '@seunghyeo', c: 'var(--lp-terminal-text)' }, { s: '  ✓ verified', c: 'var(--lp-success)' },
  { s: '\n  amount    ', c: 'var(--lp-muted2)' }, { s: '20.00 USDC', c: 'var(--lp-text)' },
  { s: '\n  fee       ', c: 'var(--lp-muted2)' }, { s: '0.0011 USDC', c: 'var(--lp-terminal-text)' },
  { s: '\n  block     ', c: 'var(--lp-muted2)' }, { s: '#4,821,663', c: '#a5b4fc' },
  { s: '\n  status    ', c: 'var(--lp-muted2)' }, { s: 'Finalized · 1.8s', c: 'var(--lp-success)' },
]
const CODE_TOTAL = CODE_TOKENS.reduce((a, t) => a + t.s.length, 0)

function Transparency() {
  const [chars, setChars] = useState(0)
  const [started, setStarted] = useState(false)
  const codeRef = useRef<HTMLPreElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = codeRef.current; if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) {
        setStarted(true)
        const step = (n: number) => { setChars(n); if (n < CODE_TOTAL) { timer.current = setTimeout(() => step(n + 1), 15) } }
        setTimeout(() => step(1), 150)
        obs.disconnect()
      }
    }, { threshold: 0.25 })
    obs.observe(el)
    return () => { obs.disconnect(); if (timer.current) clearTimeout(timer.current) }
  }, [started])

  const view: Array<{ s: string; c: string }> = []
  let left = started ? chars : 0
  for (const t of CODE_TOKENS) {
    if (left <= 0) break
    view.push({ s: t.s.slice(0, left), c: t.c })
    left -= t.s.length
  }

  return (
    <section id="developers" style={{ position: 'relative', zIndex: 1, maxWidth: 1080, margin: '0 auto', padding: '90px 28px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 54, alignItems: 'center' }}>
        {/* left */}
        <div className="rv-l">
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#818cf8' }}>On-chain transparency</div>
          <h2 style={{ margin: '16px 0 0', fontSize: 'clamp(30px,3.8vw,46px)', fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1.08 }}>
            Every payment,<br />on the record
          </h2>
          <p style={{ margin: '18px 0 0', fontSize: 16, lineHeight: 1.65, color: 'var(--lp-muted)', maxWidth: 420 }}>
            No black box. Each transfer is a real transaction on Arc — with a hash, a block and a finalized status you can check yourself on the public explorer.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
            {['Real transaction hash for every transfer', 'Finalized on Arc in ~1.8 seconds', 'Publicly verifiable — nothing hidden'].map(p => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 14.5, color: 'var(--lp-text)' }}>
                <span style={{ flex: 'none', display: 'flex' }}><IcCheck size={18} stroke="var(--lp-success)" /></span>{p}
              </div>
            ))}
          </div>
          <button className="mp-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, height: 46, padding: '0 22px', marginTop: 26, borderRadius: 12, border: 'none', background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            View on Arc explorer <IcArrow />
          </button>
        </div>

        {/* terminal */}
        <div className="rv-r" style={{ borderRadius: 18, overflow: 'hidden', border: '1px solid var(--glass-border)', background: 'var(--lp-terminal-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '1px solid var(--c-border)' }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#fb6f84' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#f5b748' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#2dd4bf' }} />
            <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--lp-muted2)' }}>arc-explorer · tx receipt</span>
          </div>
          <pre ref={codeRef} id="dev-code" style={{ margin: 0, padding: 20, minHeight: 216, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.85, color: 'var(--lp-terminal-text)', whiteSpace: 'pre-wrap' }}>
            {view.map((t, i) => <span key={i} style={{ color: t.c }}>{t.s}</span>)}
            {chars < CODE_TOTAL && (
              <span className="mp-blink-teal" />
            )}
          </pre>
        </div>
      </div>
    </section>
  )
}

/* ─────────── CTA ─────────── */
function CTA({ googleState, onSignIn }: { googleState: GoogleState; onSignIn: () => void }) {
  const g = googleState
  const ctaBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
    height: 60, padding: '0 34px', borderRadius: 16,
    border: g === 'idle' ? '1px solid rgba(0,0,0,.12)' : 'none',
    fontSize: 17, fontWeight: 600, cursor: 'pointer',
    color: g === 'idle' ? '#141221' : '#fff',
    background: g === 'idle' ? '#fff' : 'var(--grad-primary)',
    boxShadow: g === 'idle' ? '0 1px 3px rgba(0,0,0,.12)' : 'var(--glow-primary)',
  } as React.CSSProperties

  return (
    <section style={{ position: 'relative', zIndex: 1, maxWidth: 820, margin: '0 auto', padding: '110px 28px 90px', textAlign: 'center' }}>
      <h2 className="rv" style={{ margin: 0, fontSize: 'clamp(38px,5vw,64px)', fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1.02 }}>
        Start sending<br />in <span style={{ background: 'var(--grad-primary)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>seconds.</span>
      </h2>
      <p className="rv" style={{ margin: '22px auto 0', fontSize: 17, color: 'var(--lp-muted)', maxWidth: 480, lineHeight: 1.6 }}>
        No seed phrase. No gas surprises. Just your Google account and a handle.
      </p>
      <div className="rv" style={{ display: 'flex', justifyContent: 'center', marginTop: 36 }}>
        <button onClick={onSignIn} className="mp-btn mp-btn-bounce" style={ctaBtn}>
          {g === 'idle' && <><IcGoogle size={22} className="ic-google-logo" /><span>Continue with Google</span></>}
          {g === 'busy' && <><IcSpinner /><span>Connecting…</span></>}
          {g === 'done' && <><IcCheckWhite size={21} /><span>Opening your wallet…</span></>}
        </button>
      </div>
    </section>
  )
}

/* ─────────── Footer ─────────── */
function Footer() {
  return (
    <footer style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '40px 28px 56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>M</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Miron<span style={{ color: '#818cf8' }}>Pay</span></span>
        <span style={{ marginLeft: 10, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--lp-muted2)' }}>
          <span className="mp-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: '#2dd4bf', boxShadow: '0 0 8px #2dd4bf', display: 'inline-block' }} />
          Arc Testnet · v0.1.0-beta
        </span>
      </div>
      <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
        {['Product', 'Security', 'Transparency', 'Privacy', 'Terms'].map(l => (
          <a key={l} className="mp-foot-link" style={{ color: 'var(--lp-muted)', cursor: 'pointer' }}>{l}</a>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--lp-muted2)' }}>© 2026 MironPay</div>
    </footer>
  )
}

/* ─────────── Scroll reveal wiring ─────────── */
function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } })
    }, { threshold: 0.16, rootMargin: '0px 0px -7% 0px' })
    document.querySelectorAll('.rv:not(.in),.rv-l:not(.in),.rv-r:not(.in),.rv-s:not(.in)').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
}

/* ─────────── Parallax ─────────── */
function useParallax() {
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return; ticking = true
      requestAnimationFrame(() => {
        document.querySelectorAll<HTMLElement>('[data-par]').forEach(el => {
          const s = parseFloat(el.dataset.par || '0')
          el.style.transform = `translate3d(0,${window.scrollY * s}px,0)`
        })
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
}

/* ─────────── Page ─────────── */
/**
 * Slim entry screen shown only when the app is launched standalone (opened
 * from the home-screen icon, not a regular browser tab) — a PWA user is in
 * "app mode" already, so the full scrolling marketing site (hero, features,
 * testimonials, footer) is the wrong thing to show; they want straight to
 * sign-in, matching the design handoff's Splash→Login flow. Regular browser
 * visits still get the full landing page below, untouched.
 */
function StandaloneLoginScreen({ googleState, onSignIn, error }: { googleState: GoogleState; onSignIn: () => void; error?: string }) {
  const g = googleState
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', background: 'var(--lp-bg)', color: 'var(--lp-text)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" style={{ width: 72, height: 72, borderRadius: 20, boxShadow: 'var(--glow-primary)' }} />
      <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.01em', marginTop: 22 }}>Miron<span style={{ color: '#8487F5' }}>Pay</span></h1>
      <p style={{ fontSize: 14.5, color: 'var(--lp-muted)', marginTop: 8, maxWidth: 260, lineHeight: 1.55 }}>
        No seed phrase, no password. Just your Google account.
      </p>

      {error && (
        <p style={{ marginTop: 18, fontSize: 12.5, color: '#fb6f84', background: 'rgba(251,111,132,.10)', border: '1px solid rgba(251,111,132,.25)', borderRadius: 10, padding: '9px 12px', maxWidth: 300 }}>
          {error}
        </p>
      )}

      <button
        onClick={onSignIn}
        disabled={g !== 'idle'}
        className="mp-btn-bounce"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11,
          height: 54, width: '100%', maxWidth: 320, marginTop: 28, padding: '0 20px', borderRadius: 9999,
          border: g === 'idle' ? '1px solid rgba(0,0,0,.12)' : 'none',
          fontSize: 15.5, fontWeight: 600, cursor: g === 'idle' ? 'pointer' : 'default',
          color: g === 'idle' ? '#141221' : '#fff',
          background: g === 'idle' ? '#fff' : 'var(--grad-primary)',
          boxShadow: g === 'idle' ? '0 1px 3px rgba(0,0,0,.12)' : 'var(--glow-primary)',
        }}
      >
        {g === 'idle' && <><IcGoogle size={20} />Sign in with Google</>}
        {g === 'busy' && <><IcSpinner />Connecting…</>}
        {g === 'done' && <><IcCheckWhite />Opening your wallet…</>}
      </button>

      <p style={{ fontSize: 11.5, color: 'var(--lp-muted2)', marginTop: 26, maxWidth: 280, lineHeight: 1.5 }}>
        By continuing you agree to MironPay&apos;s Terms & Privacy Policy.
      </p>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const [isLight, setIsLight] = useState(false)
  const [googleState, setGoogleState] = useState<GoogleState>('idle')
  const [googleError, setGoogleError] = useState('')
  const [isStandalone, setIsStandalone] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  useReveal()
  useParallax()

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('theme') === 'light') {
      startTransition(() => setIsLight(true))
      document.documentElement.classList.add('light')
    }
  }, [])

  // Detect standalone (installed PWA) launch — matchMedia covers Android/
  // desktop installs, navigator.standalone covers iOS Safari's older API.
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true
    setIsStandalone(standalone)

    if (!standalone || !isSupabaseConfigured) { setCheckingSession(false); return }

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session && await isOnboardingComplete(data.session.user.id)) {
        router.replace('/dashboard')
        return
      }
      setCheckingSession(false)
    })
  }, [router])

  const toggleTheme = () => {
    setIsLight(prev => {
      const next = !prev
      document.documentElement.classList.toggle('light', next)
      localStorage.setItem('theme', next ? 'light' : 'dark')
      return next
    })
  }

  const handleSignIn = async () => {
    if (googleState !== 'idle') return
    setGoogleError('')

    if (!isSupabaseConfigured) {
      setGoogleError('Supabase is not configured.')
      return
    }

    setGoogleState('busy')

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      })

      if (error) { setGoogleState('idle'); setGoogleError(error.message); return }
      if (!data.url) { setGoogleState('idle'); setGoogleError('Could not get OAuth URL from Supabase.'); return }

      setGoogleState('done')
      window.location.href = data.url
    } catch (err) {
      setGoogleState('idle')
      setGoogleError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  if (isStandalone) {
    if (checkingSession) {
      return <div style={{ minHeight: '100vh', background: 'var(--lp-bg)' }} />
    }
    return <StandaloneLoginScreen googleState={googleState} onSignIn={handleSignIn} error={googleError} />
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: 'var(--lp-bg)', color: 'var(--lp-text)', fontFamily: 'var(--font-sans)', overflowX: 'hidden' }}>
      <AuroraCanvas />
      <Nav isLight={isLight} onToggle={toggleTheme} onSignIn={handleSignIn} />
      <Hero googleState={googleState} onSignIn={handleSignIn} error={googleError} />
      <SendSection />
      <Features />
      <AgentSection />
      <Security />
      <Transparency />
      <CTA googleState={googleState} onSignIn={handleSignIn} />
      <Footer />
    </div>
  )
}
