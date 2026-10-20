'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '@/app/lib/supabase'
import { PENDING_TX_STATES, type TokenBalance, type Transaction } from '@/app/lib/types'

// Shape the mock (public/demo/mobile-app.html) reads in applyRealWallet().
type MockToken = { sym: string; name: string; bal: number; price: number | null; ch24: number | null; logo: string | null }
type MockTx = {
  who: string; kind: 'in' | 'out' | 'swap'; meta: string; amt: number; tok: string; memo?: string
  hash?: string; from?: string; to?: string; dateLine: string; timeStr: string
}
type MockWallet = {
  tokens: MockToken[]; txs: MockTx[]
  username: string | null; email: string; address: string; qr: string | null
}

function shortAddr(a?: string) {
  return a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : (a ?? '')
}

function toMockToken(t: TokenBalance): MockToken {
  const bal = parseFloat(t.amount) || 0
  return {
    sym: t.symbol,
    name: t.name,
    bal,
    // Same per-unit price the desktop wallet values this holding at.
    price: t.usdValue != null && bal > 0 ? t.usdValue / bal : null,
    ch24: t.change24hPct,
    logo: t.logoUrl,
  }
}

function toMockTx(tx: Transaction, myAddress: string): MockTx {
  const d = new Date(tx.created_at)
  const label = tx.description || (tx.type === 'credit' ? 'Received' : 'Sent')
  const kind: MockTx['kind'] = label === 'Swap' ? 'swap' : tx.type === 'credit' ? 'in' : 'out'
  const counterparty = tx.type === 'credit' ? tx.sourceAddress : tx.destinationAddress
  const generic = label === 'Received' || label === 'Sent'
  const pending = tx.state && PENDING_TX_STATES.has(tx.state) ? ' · Pending' : ''
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return {
    who: generic ? shortAddr(counterparty) || label : label,
    kind,
    meta: `${day} · ${label}${pending}`,
    amt: tx.type === 'credit' ? Math.abs(tx.amount) : -Math.abs(tx.amount),
    tok: tx.tokenSymbol,
    memo: tx.memo,
    hash: tx.txHash,
    from: shortAddr(tx.sourceAddress ?? (tx.type === 'credit' ? undefined : myAddress)) || undefined,
    to: shortAddr(tx.destinationAddress ?? (tx.type === 'credit' ? myAddress : undefined)) || undefined,
    dateLine: `${date} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
    timeStr: `${date} · ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
  }
}

export default function MobileAppPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [wallet, setWallet] = useState<MockWallet | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)

  // Same sources as the desktop wallet: /api/wallet for balances, prices and
  // history, profiles for the @username, the session for the email.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session
      const token = session?.access_token
      if (!session || !token) return
      setAuthToken(token)
      const [res, profileRes] = await Promise.all([
        fetch('/api/wallet', { headers: { Authorization: `Bearer ${token}` } }),
        supabase.from('profiles').select('username').eq('id', session.user.id).single(),
      ])
      if (!res.ok) return
      const d = await res.json()
      const address: string = d.walletAddress ?? ''
      // Desktop Receive encodes the bare wallet address; level H so the
      // mock's centered logo overlay doesn't break scanning.
      const qr = address
        ? await QRCode.toDataURL(address, { errorCorrectionLevel: 'H', margin: 1, width: 388 }).catch(() => null)
        : null
      setWallet({
        tokens: ((d.tokenList ?? []) as TokenBalance[]).map(toMockToken),
        txs: ((d.transactions ?? []) as Transaction[]).map((tx) => toMockTx(tx, address)),
        username: profileRes.data?.username ?? null,
        email: session.user.email ?? '',
        address,
        qr,
      })
    })
  }, [])

  // Bridges the Supabase access token into the sandboxed demo iframe so its
  // Store/POS screens can call the real /api/merchant/* endpoints directly
  // (same-origin fetch, no CORS) instead of the mock's simulated state.
  useEffect(() => {
    if (!authToken) return
    const iframe = iframeRef.current
    if (!iframe) return
    const send = () => iframe.contentWindow?.postMessage({ type: 'mironpay:auth', token: authToken, apiBase: '' }, '*')
    function onReady(e: MessageEvent) {
      if (e.source === iframe?.contentWindow && e.data?.type === 'mironpay:ready') send()
    }
    window.addEventListener('message', onReady)
    iframe.addEventListener('load', send)
    if (iframe.contentDocument?.readyState === 'complete') send()
    return () => {
      window.removeEventListener('message', onReady)
      iframe.removeEventListener('load', send)
    }
  }, [authToken])

  // Pushes the real wallet into the mock's own state (applyRealWallet), so
  // every figure it derives — total, fiat line, allocation, 24h move,
  // activity, receive QR — comes from live data. Re-sent on iframe load and
  // on its 'ready' ping in case the wallet resolves before the mock mounts.
  useEffect(() => {
    if (!wallet) return
    const iframe = iframeRef.current
    if (!iframe) return
    const send = () => iframe.contentWindow?.postMessage({ type: 'mironpay:wallet', wallet }, '*')
    function onReady(e: MessageEvent) {
      if (e.source === iframe?.contentWindow && e.data?.type === 'mironpay:ready') send()
    }
    window.addEventListener('message', onReady)
    iframe.addEventListener('load', send)
    if (iframe.contentDocument?.readyState === 'complete') send()
    return () => {
      window.removeEventListener('message', onReady)
      iframe.removeEventListener('load', send)
    }
  }, [wallet])

  return (
    <div style={{ height: '100vh', overflow: 'hidden', padding: 24, color: 'var(--c-text)', display: 'flex', flexDirection: 'column' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Mobile App</h1>
      <p style={{ fontSize: 13, color: 'var(--c-muted2)', margin: '0 0 16px' }}>
        MironPay Mobile — QR payments for SME stores on Arc (design preview, live balance)
      </p>

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
            ref={iframeRef}
            src="/demo/mobile-app.html"
            title="MironPay Mobile App preview"
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: 24, background: '#faf9f5' }}
          />
        </div>
      </div>
    </div>
  )
}
