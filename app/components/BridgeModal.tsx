'use client'

import { useState } from 'react'

// Standalone bridge modal — deliberately NOT wired into SRSModal.tsx / its
// ModalMode union, so the existing send/receive/swap flow stays untouched.
// See app/lib/circle-bridge-kit.ts for the withdraw/deposit split rationale.

const S = {
  panel: { background: 'var(--c-panel)' } as React.CSSProperties,
  input: { background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)', borderRadius: 12, color: 'var(--c-text)', outline: 'none', width: '100%', fontSize: 14, padding: '12px 14px', fontFamily: 'inherit' } as React.CSSProperties,
  btn34: { display: 'flex', width: 34, height: 34, alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(var(--c-fg-rgb),.07)', background: 'rgba(var(--c-fg-rgb),.05)', borderRadius: 10, color: 'var(--c-muted)', cursor: 'pointer', flexShrink: 0 } as React.CSSProperties,
}

const CHAINS = [
  { slug: 'ethereum_sepolia', label: 'Ethereum Sepolia' },
  { slug: 'base_sepolia', label: 'Base Sepolia' },
]

type Direction = 'withdraw' | 'deposit'
type Status = 'idle' | 'estimating' | 'submitting' | 'awaiting_signature' | 'completing' | 'success' | 'error'

export interface BridgeModalProps {
  open: boolean
  onClose: () => void
  accessToken: string
  walletAddress: string | null
  onSuccess?: () => void
}

export default function BridgeModal({ open, onClose, accessToken, walletAddress, onSuccess }: BridgeModalProps) {
  const [direction, setDirection] = useState<Direction>('withdraw')
  const [chainSlug, setChainSlug] = useState(CHAINS[0].slug)
  const [amount, setAmount] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [resultTxHash, setResultTxHash] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<{ gasFees: unknown; fees: unknown } | null>(null)

  if (!open) return null

  function reset() {
    setStatus('idle'); setError(null); setResultTxHash(null); setEstimate(null)
    setAmount(''); setRecipientAddress('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function runEstimate() {
    setError(null)
    setStatus('estimating')
    try {
      const params = new URLSearchParams({ direction, externalChain: chainSlug, amount })
      const res = await fetch(`/api/wallet/bridge/estimate?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Estimate failed')
      setEstimate({ gasFees: json.gasFees, fees: json.fees })
      setStatus('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  async function submitWithdraw() {
    setError(null)
    setStatus('submitting')
    try {
      const res = await fetch('/api/wallet/bridge/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ externalChain: chainSlug, amount, recipientAddress }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Withdraw failed')
      setResultTxHash(json.mintTxHash || json.burnTxHash)
      setStatus('success')
      onSuccess?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  async function submitDeposit() {
    setError(null)
    if (typeof window === 'undefined' || !(window as unknown as { ethereum?: unknown }).ethereum) {
      setError('No browser wallet found. Install MetaMask (or another injected wallet) to deposit.')
      setStatus('error')
      return
    }
    const eth = (window as unknown as { ethereum: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    } }).ethereum

    try {
      setStatus('awaiting_signature')
      const accounts = await eth.request({ method: 'eth_requestAccounts' }) as string[]
      const fromAddress = accounts[0]
      if (!fromAddress) throw new Error('No account returned by wallet')

      // Backend builds the unsigned burn calldata (source = user's own
      // external wallet, destination = this MironPay wallet on Arc) —
      // nothing is signed or executed server-side for this leg.
      const prepRes = await fetch('/api/wallet/bridge/deposit/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ externalChain: chainSlug, amount, fromAddress }),
      })
      const prep = await prepRes.json()
      if (!prepRes.ok) throw new Error(prep.error || 'Could not prepare deposit')

      const burnTxHash = await eth.request({
        method: 'eth_sendTransaction',
        params: [{ from: fromAddress, to: prep.to, data: prep.data, value: prep.value !== '0' ? `0x${BigInt(prep.value).toString(16)}` : undefined }],
      }) as string

      setStatus('completing')
      const completeRes = await fetch('/api/wallet/bridge/deposit/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ externalChain: chainSlug, burnTxHash }),
      })
      const complete = await completeRes.json()
      if (!completeRes.ok) throw new Error(complete.error || 'Could not complete deposit')

      setResultTxHash(complete.mintTxHash)
      setStatus('success')
      onSuccess?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  const busy = status === 'estimating' || status === 'submitting' || status === 'awaiting_signature' || status === 'completing'
  const canSubmit = amount && parseFloat(amount) > 0 && (direction === 'withdraw' ? !!recipientAddress : true) && !busy

  return (
    <div
      onClick={handleClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(6,4,16,.66)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 432, maxWidth: '94vw', maxHeight: '90vh', borderRadius: 22, ...S.panel, border: '1px solid rgba(var(--c-fg-rgb),.14)', boxShadow: '0 30px 80px rgba(3,8,20,.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid rgba(var(--c-fg-rgb),.07)', flexShrink: 0 }}>
          <div style={{ width: 34 }} />
          <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: 'var(--c-text)', textAlign: 'center', marginRight: 34 }}>Bridge</span>
          <button onClick={handleClose} style={S.btn34}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 20px' }}>
          {status === 'success' ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)', marginBottom: 8 }}>
                {direction === 'withdraw' ? 'Withdrawal complete' : 'Deposit complete'}
              </div>
              {resultTxHash && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-muted)', wordBreak: 'break-all', marginBottom: 16 }}>
                  {resultTxHash}
                </div>
              )}
              <button onClick={handleClose} style={{ ...S.input, background: 'linear-gradient(135deg,#818cf8,#6366f1 52%,#4338ca)', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer' }}>Done</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                {(['withdraw', 'deposit'] as Direction[]).map(d => (
                  <button
                    key={d}
                    onClick={() => { setDirection(d); reset() }}
                    disabled={busy}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${direction === d ? '#6366f1' : 'rgba(var(--c-fg-rgb),.14)'}`, background: direction === d ? 'rgba(99,102,241,.12)' : 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)' }}
                  >
                    {d === 'withdraw' ? 'Withdraw' : 'Deposit'}
                  </button>
                ))}
              </div>

              <p style={{ fontSize: 12.5, color: 'var(--c-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                {direction === 'withdraw'
                  ? 'Send USDC from your MironPay wallet (Arc) to an address on another testnet.'
                  : 'Send USDC from a connected wallet on another testnet into your MironPay wallet (Arc). Requires connecting a browser wallet (e.g. MetaMask) to sign.'}
              </p>

              <label style={{ fontSize: 12, color: 'var(--c-muted2)', display: 'block', marginBottom: 6 }}>
                {direction === 'withdraw' ? 'Destination chain' : 'Source chain'}
              </label>
              <select
                value={chainSlug}
                onChange={e => { setChainSlug(e.target.value); setEstimate(null) }}
                disabled={busy}
                style={{ ...S.input, marginBottom: 14 }}
              >
                {CHAINS.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </select>

              <label style={{ fontSize: 12, color: 'var(--c-muted2)', display: 'block', marginBottom: 6 }}>Amount (USDC)</label>
              <input
                type="number" min="0" step="any" placeholder="0.00"
                value={amount}
                onChange={e => { setAmount(e.target.value); setEstimate(null) }}
                disabled={busy}
                style={{ ...S.input, marginBottom: 14, fontFamily: 'var(--font-mono)' }}
              />

              {direction === 'withdraw' && (
                <>
                  <label style={{ fontSize: 12, color: 'var(--c-muted2)', display: 'block', marginBottom: 6 }}>Recipient address</label>
                  <input
                    type="text" placeholder="0x..."
                    value={recipientAddress}
                    onChange={e => setRecipientAddress(e.target.value)}
                    disabled={busy}
                    style={{ ...S.input, marginBottom: 14, fontFamily: 'var(--font-mono)' }}
                  />
                </>
              )}

              {direction === 'deposit' && walletAddress && (
                <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 14 }}>
                  Deposits go to your MironPay wallet: <span style={{ fontFamily: 'var(--font-mono)' }}>{walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}</span>
                </div>
              )}

              {estimate && (
                <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 14, background: 'rgba(var(--c-fg-rgb),.05)', borderRadius: 10, padding: '10px 12px' }}>
                  Estimate fetched — review fees before confirming.
                </div>
              )}

              {error && (
                <div style={{ fontSize: 12.5, color: '#ef4444', marginBottom: 14, background: 'rgba(239,68,68,.08)', borderRadius: 10, padding: '10px 12px' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={runEstimate}
                  disabled={!amount || parseFloat(amount) <= 0 || busy}
                  style={{ flex: 1, ...S.input, cursor: 'pointer', fontWeight: 600, opacity: (!amount || busy) ? 0.5 : 1 }}
                >
                  {status === 'estimating' ? 'Estimating…' : 'Estimate'}
                </button>
                <button
                  onClick={direction === 'withdraw' ? submitWithdraw : submitDeposit}
                  disabled={!canSubmit}
                  style={{ flex: 1, ...S.input, background: 'linear-gradient(135deg,#818cf8,#6366f1 52%,#4338ca)', color: '#fff', border: 'none', fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5 }}
                >
                  {status === 'submitting' ? 'Submitting…'
                    : status === 'awaiting_signature' ? 'Confirm in wallet…'
                    : status === 'completing' ? 'Completing…'
                    : direction === 'withdraw' ? 'Withdraw' : 'Connect & Deposit'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
