'use client'

import { useState } from 'react'

// Design preview of MironPay Mobile. It runs the mock in demo mode
// (?demo=1): no real wallet, session or API — every flow (onboarding, store,
// charge → paid / underpaid / expired) runs on simulated in-memory data, and
// reloading (or "Restart demo") starts over from the welcome screen.
// The real phone app is /m, which loads the same file without demo mode.
export default function MobileAppPage() {
  const [run, setRun] = useState(0)

  return (
    <div style={{ height: '100vh', overflow: 'hidden', padding: 24, color: 'var(--c-text)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, margin: '0 0 16px' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Mobile App</h1>
          <p style={{ fontSize: 13, color: 'var(--c-muted2)', margin: 0 }}>
            MironPay Mobile — QR payments for SME stores on Arc (interactive demo, simulated data)
          </p>
          <p style={{ fontSize: 12, color: 'var(--c-muted2)', margin: '6px 0 0' }}>
            Store test amounts: ending in <b>7</b> → customer underpays · ending in <b>9</b> → expires unpaid · anything else → paid after ~5s
          </p>
        </div>
        <button
          onClick={() => setRun(r => r + 1)}
          style={{ flexShrink: 0, height: 34, padding: '0 14px', borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Restart demo
        </button>
      </div>

      <div
        style={{
          flex: 1, minHeight: 0,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          borderRadius: 16, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.07)',
          padding: 20,
        }}
      >
        <div
          style={{
            width: 300, height: '100%', maxHeight: 640, aspectRatio: '390 / 844',
            borderRadius: 34, background: '#000',
            padding: 10, boxShadow: '0 20px 60px rgba(0,0,0,.35)',
          }}
        >
          <iframe
            key={run}
            src="/demo/mobile-app.html?demo=1"
            title="MironPay Mobile App preview"
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: 24, background: '#faf9f5' }}
          />
        </div>
      </div>
    </div>
  )
}
