'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/app/lib/supabase'
import type { TokenBalance, Transaction } from '@/app/lib/types'

type RealData = {
  totalUsd: number
  usdc: TokenBalance | null
  eurc: TokenBalance | null
  transactions: Transaction[]
}

const ACTIVITY_MOCK_NAMES = ['lena.eth', '0x8f24…D3ac', 'Swap → EURC', 'Café Anna', 'bruno.eth']

function fmt2(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function txLabel(tx: Transaction) {
  const dateStr = new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const verb = tx.type === 'credit' ? 'Received' : tx.description?.toLowerCase().includes('swap') ? 'Converted' : 'Sent'
  return { dateStr, verb }
}

function walkAndReplace(doc: Document, match: string, replacement: string) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  while (node) {
    if (node.textContent?.trim() === match) node.textContent = replacement
    node = walker.nextNode() as Text | null
  }
}

function findButtonWithExactText(doc: Document, exactText: string): HTMLElement | null {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  while (node) {
    if (node.textContent?.trim() === exactText) {
      return node.parentElement?.closest('button') as HTMLElement | null
    }
    node = walker.nextNode() as Text | null
  }
  return null
}

function hideButtonWithExactText(doc: Document, exactText: string) {
  const btn = findButtonWithExactText(doc, exactText)
  if (btn) btn.style.display = 'none'
}

function setTokenIcon(btn: HTMLElement, logoUrl: string) {
  if (btn.querySelector('[data-real-logo]')) return // already patched, avoid re-shifting leaf order
  const iconEl = getLeafTextElements(btn)[0]
  if (!iconEl) return
  iconEl.setAttribute('data-real-logo', '1')
  iconEl.innerHTML = ''
  const img = btn.ownerDocument.createElement('img')
  img.src = logoUrl
  img.alt = ''
  img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;display:block'
  iconEl.appendChild(img)
}

function getLeafTextElements(root: Element): HTMLElement[] {
  const out: HTMLElement[] = []
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let node = walker.nextNode() as HTMLElement | null
  while (node) {
    if (node.children.length === 0 && node.textContent && node.textContent.trim().length > 0) out.push(node)
    node = walker.nextNode() as HTMLElement | null
  }
  return out
}

function patchRealData(doc: Document, data: RealData) {
  // Total assets ("$17,074" + ".87" mock)
  const [intPart, decPart] = fmt2(data.totalUsd).split('.')
  walkAndReplace(doc, '$17,074', `$${intPart}`)
  walkAndReplace(doc, '.87', `.${decPart}`)

  // USDC row
  if (data.usdc) {
    const amt = parseFloat(data.usdc.amount) || 0
    walkAndReplace(doc, '12,480.50 USDC', `${fmt2(amt)} USDC`)
    walkAndReplace(doc, '$12,480.50', `$${fmt2(data.usdc.usdValue ?? amt)}`)
    if (data.usdc.logoUrl) {
      const btn = findButtonWithExactText(doc, 'USDC')
      if (btn) setTokenIcon(btn, data.usdc.logoUrl)
    }
  }

  // EURC row
  if (data.eurc) {
    const amt = parseFloat(data.eurc.amount) || 0
    walkAndReplace(doc, '2,150.00 EURC', `${fmt2(amt)} EURC`)
    walkAndReplace(doc, '$2,331.25', `$${fmt2(data.eurc.usdValue ?? amt)}`)
    if (data.eurc.logoUrl) {
      const btn = findButtonWithExactText(doc, 'EURC')
      if (btn) setTokenIcon(btn, data.eurc.logoUrl)
    }
  } else {
    hideButtonWithExactText(doc, 'EURC')
  }

  // Fake tokens not held in the real wallet — hide
  hideButtonWithExactText(doc, 'USDT')
  hideButtonWithExactText(doc, 'ETH')

  // Activity list — swap mock rows for real recent transactions
  ACTIVITY_MOCK_NAMES.forEach((name, i) => {
    const btn = findButtonWithExactText(doc, name)
    if (!btn) return
    const tx = data.transactions[i]
    if (!tx) { btn.style.display = 'none'; return }
    const leaves = getLeafTextElements(btn)
    const { dateStr, verb } = txLabel(tx)
    if (leaves[0]) leaves[0].textContent = tx.description || tx.tokenSymbol
    if (leaves[1]) leaves[1].textContent = `${dateStr} · ${verb}`
    if (leaves[2]) leaves[2].textContent = `${tx.type === 'credit' ? '+' : '−'}${fmt2(Math.abs(tx.amount))}`
    if (leaves[3]) leaves[3].style.display = 'none' // no live FX rate on hand for the VND line
  })
}

export default function MobileAppPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [realData, setRealData] = useState<RealData | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token
      if (!token) return
      const res = await fetch('/api/wallet', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const d = await res.json()
      const tokenList: TokenBalance[] = d.tokenList ?? []
      setRealData({
        totalUsd: tokenList.reduce((sum, t) => sum + (t.usdValue ?? 0), 0),
        usdc: tokenList.find((t) => t.symbol === 'USDC') ?? null,
        eurc: tokenList.find((t) => t.symbol === 'EURC') ?? null,
        transactions: (d.transactions ?? []) as Transaction[],
      })
    })
  }, [])

  useEffect(() => {
    if (!realData) return
    const iframe = iframeRef.current
    if (!iframe) return

    let debounceId: ReturnType<typeof setTimeout>
    function apply() {
      const doc = iframe?.contentDocument
      if (doc && realData) patchRealData(doc, realData)
    }
    function onLoad() {
      apply()
      const doc = iframe?.contentDocument
      if (!doc) return
      const observer = new MutationObserver(() => {
        clearTimeout(debounceId)
        debounceId = setTimeout(apply, 80)
      })
      observer.observe(doc.body, { subtree: true, childList: true, characterData: true })
    }

    iframe.addEventListener('load', onLoad)
    if (iframe.contentDocument?.readyState === 'complete') onLoad()
    return () => iframe.removeEventListener('load', onLoad)
  }, [realData])

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
