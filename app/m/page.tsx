'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/app/lib/supabase'

const DEFAULT_BG = '#f5f4f2' // mock's thm-light --bg

export default function MPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [bg, setBg] = useState(DEFAULT_BG)

  // Locks the outer page against iOS Safari's rubber-band overscroll — a
  // fixed page with a scrollable <body> still bounces past its edges on a
  // pull gesture, briefly revealing whatever's behind it before snapping
  // back. The iframe's own document (the mock's real content) gets the
  // same lock via its `.mp-real` CSS.
  //
  // Also repaints the site's global html/body background (globals.css sets
  // it near-black — var(--c-page), meant for the desktop dashboard) to the
  // mock's actual current theme color, since ANY gap here — the bounce
  // above, a rounding sliver from a dynamic-toolbar resize, whatever —
  // would otherwise show that near-black site default instead of the
  // app's own background, reading as a stray black bar.
  useEffect(() => {
    const html = document.documentElement
    const prevHtml = html.style.cssText
    const prevBody = document.body.style.cssText
    html.style.cssText += `overscroll-behavior:none;height:100dvh;overflow:hidden;background:${bg}`
    document.body.style.cssText += `overscroll-behavior:none;height:100dvh;overflow:hidden;background:${bg}`
    return () => {
      html.style.cssText = prevHtml
      document.body.style.cssText = prevBody
    }
  }, [bg])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session
      if (!session) { setReady(true); return }
      const t = session.access_token
      try {
        // Read synchronously by the iframe's bootstrap script (before its
        // React tree mounts) so the mock UI can skip straight to the right
        // screen instead of replaying the fake onboarding animation.
        sessionStorage.setItem('mironpay:token', t)
        sessionStorage.setItem('mironpay:email', session.user.email ?? '')
      } catch {}
      // A wallet already existing is the one signal that onboarding
      // (username + PIN + wallet creation) is fully done for this user.
      let bootScreen = 'onboarding'
      try {
        const res = await fetch('/api/wallet', { headers: { Authorization: `Bearer ${t}` } })
        bootScreen = res.ok ? 'home' : 'onboarding'
      } catch {}
      try { sessionStorage.setItem('mironpay:bootScreen', bootScreen) } catch {}
      setToken(t)
      setReady(true)
    })
  }, [])

  // Depends on `ready` (not just `token`) — for a signed-out visitor `token`
  // stays null forever, so an effect keyed only on it would register this
  // listener on the pre-iframe render and never again once the iframe
  // actually mounts below.
  useEffect(() => {
    if (!ready) return
    const iframe = iframeRef.current
    if (!iframe) return
    const send = () => { if (token) iframe.contentWindow?.postMessage({ type: 'mironpay:auth', token, apiBase: '' }, '*') }
    async function onMessage(e: MessageEvent) {
      if (e.source !== iframe?.contentWindow) return
      if (e.data?.type === 'mironpay:ready') { send(); return }
      if (e.data?.type === 'mironpay:theme' && typeof e.data.color === 'string') {
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', e.data.color)
        setBg(e.data.color)
        return
      }
      if (e.data?.type === 'mironpay:signin') {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${window.location.origin}/auth/callback?next=/m`, skipBrowserRedirect: true },
        })
        if (!error && data?.url) window.location.href = data.url
      }
    }
    window.addEventListener('message', onMessage)
    iframe.addEventListener('load', send)
    if (iframe.contentDocument?.readyState === 'complete') send()
    return () => {
      window.removeEventListener('message', onMessage)
      iframe.removeEventListener('load', send)
    }
  }, [ready, token])

  if (!ready) {
    return <div style={{ position: 'fixed', inset: 0, background: bg }} />
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: bg }}>
      <iframe
        ref={iframeRef}
        // ?device=1 tells the mock this is a real phone (not the admin's
        // boxed /mobile-app preview) so it hides its fake status-bar clock
        // and notch pill — a URL param instead of sessionStorage because
        // sessionStorage is shared per-origin and would leak this flag into
        // /mobile-app's iframe too if both are visited in the same tab.
        src="/demo/mobile-app.html?device=1"
        title="MironPay"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  )
}
