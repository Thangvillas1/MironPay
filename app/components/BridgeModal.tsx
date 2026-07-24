'use client'

import { useEffect, useRef, useState } from 'react'

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

// Block explorer base URL per chain — used to build clickable tx links on
// the result screen. 'arc' is the MironPay wallet's own chain, not one of
// the user-selectable external chains above.
const EXPLORERS: Record<string, string> = {
  arc: 'https://testnet.arcscan.app/tx/',
  ethereum_sepolia: 'https://sepolia.etherscan.io/tx/',
  base_sepolia: 'https://sepolia.basescan.org/tx/',
}

function chainLabel(slug: string) {
  if (slug === 'arc') return 'Arc'
  return CHAINS.find(c => c.slug === slug)?.label ?? slug
}

// EIP-3085/3326 network descriptors — required so the connected wallet
// actually switches to the testnet before signing. Without this, the wallet
// signs on whatever network it currently happens to be on (e.g. Ethereum
// mainnet), which would target a completely different contract at the same
// address and could spend real funds.
const WALLET_CHAINS: Record<string, {
  chainId: string; chainName: string; nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: string[]; blockExplorerUrls: string[]
}> = {
  ethereum_sepolia: {
    chainId: '0xaa36a7', chainName: 'Ethereum Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
  },
  base_sepolia: {
    chainId: '0x14a34', chainName: 'Base Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.base.org'],
    blockExplorerUrls: ['https://sepolia.basescan.org'],
  },
}

type Eip1193Provider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }

interface CallData { to: string; data: string; value: string }

async function sendCall(eth: Eip1193Provider, fromAddress: string, call: CallData): Promise<string> {
  return await eth.request({
    method: 'eth_sendTransaction',
    params: [{ from: fromAddress, to: call.to, data: call.data, value: call.value !== '0' ? `0x${BigInt(call.value).toString(16)}` : undefined }],
  }) as string
}

// The wallet only gives us a tx hash; the burn's on-chain effects (and the
// allowance the approve call raises) aren't guaranteed visible until it's
// actually mined. Poll for the receipt before moving to the next step.
async function waitForReceipt(eth: Eip1193Provider, txHash: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const receipt = await eth.request({ method: 'eth_getTransactionReceipt', params: [txHash] })
    if (receipt) {
      if ((receipt as { status?: string }).status === '0x0') {
        throw new Error(`Transaction ${txHash} reverted`)
      }
      return
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error(`Timed out waiting for transaction ${txHash} to be mined`)
}

async function ensureWalletOnChain(eth: Eip1193Provider, chainSlug: string) {
  const target = WALLET_CHAINS[chainSlug]
  if (!target) throw new Error(`Unknown chain for wallet switch: ${chainSlug}`)
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: target.chainId }] })
  } catch (err) {
    // 4902: chain not yet added to the wallet — add it, then switch.
    const code = (err as { code?: number } | null)?.code
    if (code === 4902) {
      await eth.request({ method: 'wallet_addEthereumChain', params: [target] })
    } else {
      throw err
    }
  }
}

// Wallet RPC rejections (wallet_switchEthereumChain, eth_sendTransaction,
// etc.) are typically plain objects like `{ code: 4001, message: '...' }`,
// not real Error instances — `String(e)` on those yields "[object Object]"
// since they don't override toString(). Pull `.message` out generically.
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  return String(e)
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--c-muted2)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', fontFamily: mono ? 'var(--font-mono)' : 'inherit', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function TxLink({ label, txHash, chain }: { label: string; txHash: string; chain: string }) {
  const base = EXPLORERS[chain]
  const href = base ? `${base}${txHash}` : null
  const short = `${txHash.slice(0, 8)}…${txHash.slice(-6)}`
  return (
    <a
      href={href ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        padding: '10px 14px', borderRadius: 12, background: 'rgba(var(--c-fg-rgb),.05)',
        border: '1px solid rgba(var(--c-fg-rgb),.07)', textDecoration: 'none',
        pointerEvents: href ? 'auto' : 'none', cursor: href ? 'pointer' : 'default',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--c-muted2)' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontFamily: 'var(--font-mono)', color: '#818cf8', fontWeight: 600 }}>
        {short}
        {href && (
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6" /><path d="M10 14 21 3" /></svg>
        )}
      </span>
    </a>
  )
}

type Direction = 'withdraw' | 'deposit'
type Status = 'idle' | 'estimating' | 'submitting' | 'awaiting_signature' | 'completing' | 'success' | 'error'

// Shown one at a time on the progress screen while a real transfer is in
// flight (not during the quick "Estimate" fetch). Withdraw is one blocking
// backend call, so we advance the first few on a timer and hold on the last
// one until the real response comes back — same technique SRSModal.tsx uses
// for Send/Swap. Deposit has real sequential steps (wallet signatures), so
// its phase index is driven by the actual awaits instead of a timer.
const WITHDRAW_PHASES = ['Signing withdrawal', 'Burning on Arc', 'Waiting for attestation & minting on destination']
const DEPOSIT_PHASES = ['Connecting wallet', 'Approving USDC', 'Burning USDC', 'Waiting for attestation & minting into MironPay']

interface EstimateGasFee {
  name: string
  token: string
  blockchain: string
  fees: { gas: string; gasPrice?: string; fee: string } | null
  error?: unknown
}
interface EstimateFee {
  type: 'kit' | 'provider' | 'forwarder'
  token: string
  amount: string
}
interface EstimateInfo {
  gasFees: EstimateGasFee[]
  fees: EstimateFee[]
  totalUsd: number | null
  totalUsdComplete: boolean
}

function feeTypeLabel(type: string) {
  return type === 'provider' ? 'Bridge protocol fee' : type === 'forwarder' ? 'Relayer fee' : 'Service fee'
}

interface ResultInfo {
  direction: Direction
  chainSlug: string
  amount: string
  recipientAddress: string | null
  burnTxHash: string | null
  burnChain: string
  mintTxHash: string | null
  mintChain: string
}

export interface BridgeModalProps {
  open: boolean
  onClose: () => void
  accessToken: string
  walletAddress: string | null
  hasPIN?: boolean
  onSuccess?: () => void
}

export default function BridgeModal({ open, onClose, accessToken, walletAddress, hasPIN = false, onSuccess }: BridgeModalProps) {
  const [direction, setDirection] = useState<Direction>('withdraw')
  const [chainSlug, setChainSlug] = useState(CHAINS[0].slug)
  const [amount, setAmount] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ResultInfo | null>(null)
  const [estimate, setEstimate] = useState<EstimateInfo | null>(null)
  const [chainMenuOpen, setChainMenuOpen] = useState(false)
  const estimateSeq = useRef(0)
  // Withdraw spends from the user's custodial MironPay wallet — same as
  // Send/Swap in SRSModal.tsx, it must be authorized with the account PIN
  // first. Deposit doesn't touch the custodial wallet (the user's own
  // connected browser wallet signs it), so it skips this.
  const [pinStep, setPinStep] = useState(false)
  const [pinValue, setPinValue] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinVerifying, setPinVerifying] = useState(false)
  const [phase, setPhase] = useState(0)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const withdrawPhaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Warn on tab close/refresh while a real transfer is mid-flight — closing
  // now would leave an approve/burn signed but MironPay never told about it
  // (deposit), or a withdraw whose result the user never saw (withdraw).
  useEffect(() => {
    const busyNow = status === 'submitting' || status === 'awaiting_signature' || status === 'completing'
    if (!busyNow) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [status])

  // Auto-estimate whenever the inputs that affect fees change, instead of
  // requiring a manual click. Debounced so we don't fire a request (and burn
  // through CoinGecko's rate limit) on every keystroke while typing an
  // amount. Only runs when idle/showing a previous estimate — never while a
  // real submit is in flight or a result/error screen is showing.
  useEffect(() => {
    if (!open) return
    if (status !== 'idle' && status !== 'estimating') return
    if (!amount || parseFloat(amount) <= 0) return
    const mySeq = ++estimateSeq.current
    const handle = setTimeout(() => {
      if (estimateSeq.current === mySeq) runEstimate()
    }, 600)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, chainSlug, direction, open])

  if (!open) return null

  function reset() {
    if (withdrawPhaseTimer.current) clearTimeout(withdrawPhaseTimer.current)
    setStatus('idle'); setError(null); setResult(null); setEstimate(null)
    setAmount(''); setRecipientAddress(''); setChainMenuOpen(false)
    setPinStep(false); setPinValue(''); setPinError(null)
    setPhase(0); setShowExitConfirm(false)
  }

  function handleClose() {
    const busyNow = status === 'submitting' || status === 'awaiting_signature' || status === 'completing'
    if (busyNow) { setShowExitConfirm(true); return }
    reset()
    onClose()
  }

  function forceClose() {
    reset()
    onClose()
  }

  function startWithdraw() {
    if (!hasPIN) {
      setError('Set up a PIN first (Send → Confirm with PIN) before withdrawing.')
      setStatus('error')
      return
    }
    setPinError(null); setPinValue(''); setPinStep(true)
  }

  async function confirmPinAndWithdraw(enteredPin: string) {
    setPinVerifying(true); setPinError(null)
    try {
      const res = await fetch('/api/auth/pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ pin: enteredPin }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setPinError(d.error === 'Incorrect PIN' ? 'Incorrect PIN — try again' : d.error ?? 'PIN verification failed')
        setPinValue('')
        setPinVerifying(false)
        return
      }
      setPinStep(false)
      setPinVerifying(false)
      await submitWithdraw()
    } catch {
      setPinError('Connection error — try again')
      setPinValue('')
      setPinVerifying(false)
    }
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
      setEstimate({ gasFees: json.gasFees ?? [], fees: json.fees ?? [], totalUsd: json.totalUsd ?? null, totalUsdComplete: json.totalUsdComplete ?? true })
      setStatus('idle')
    } catch (e) {
      setError(errorMessage(e))
      setStatus('error')
    }
  }

  async function submitWithdraw() {
    setError(null)
    setStatus('submitting')
    setPhase(0)
    // The withdraw endpoint is one blocking call — we don't get real
    // progress ticks from it. Advance through the first phases on a timer
    // and hold on the last one ("waiting for attestation & minting", the
    // genuinely slow part) until the real response lands.
    const advance = () => {
      setPhase(p => {
        const next = p + 1
        if (next < WITHDRAW_PHASES.length - 1) {
          withdrawPhaseTimer.current = setTimeout(advance, 1200)
        }
        return Math.min(next, WITHDRAW_PHASES.length - 1)
      })
    }
    withdrawPhaseTimer.current = setTimeout(advance, 900)
    try {
      const res = await fetch('/api/wallet/bridge/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ externalChain: chainSlug, amount, recipientAddress }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Withdraw failed')
      setResult({
        direction: 'withdraw', chainSlug, amount, recipientAddress,
        burnTxHash: json.burnTxHash ?? null, burnChain: 'arc',
        mintTxHash: json.mintTxHash ?? null, mintChain: chainSlug,
      })
      setStatus('success')
      onSuccess?.()
    } catch (e) {
      setError(errorMessage(e))
      setStatus('error')
    } finally {
      if (withdrawPhaseTimer.current) clearTimeout(withdrawPhaseTimer.current)
    }
  }

  async function submitDeposit() {
    setError(null)
    if (typeof window === 'undefined' || !(window as unknown as { ethereum?: unknown }).ethereum) {
      setError('No browser wallet found. Install MetaMask (or another injected wallet) to deposit.')
      setStatus('error')
      return
    }
    const eth = (window as unknown as { ethereum: Eip1193Provider }).ethereum

    try {
      setStatus('awaiting_signature')
      setPhase(0) // "Connecting wallet"
      const accounts = await eth.request({ method: 'eth_requestAccounts' }) as string[]
      const fromAddress = accounts[0]
      if (!fromAddress) throw new Error('No account returned by wallet')

      // Force the wallet onto the correct testnet before signing anything —
      // otherwise it signs on whatever network it currently happens to be
      // on (e.g. Ethereum mainnet), targeting a different contract at the
      // same address and risking real funds.
      await ensureWalletOnChain(eth, chainSlug)

      // Backend builds the unsigned approve (if needed) + burn calldata
      // (source = user's own external wallet, destination = this MironPay
      // wallet on Arc) — nothing is signed or executed server-side for
      // this leg.
      const prepRes = await fetch('/api/wallet/bridge/deposit/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ externalChain: chainSlug, amount, fromAddress }),
      })
      const prep = await prepRes.json()
      if (!prepRes.ok) throw new Error(prep.error || 'Could not prepare deposit')

      // The CCTP contract needs an on-chain allowance before it can pull the
      // user's USDC for the burn — without this, the burn tx would revert
      // ("ERC20: transfer amount exceeds allowance"). Sign it as its own
      // transaction and wait for it to actually be mined before signing the
      // burn, since the burn's allowance check reads on-chain state.
      if (prep.approve) {
        setPhase(1) // "Approving USDC"
        const approveTxHash = await sendCall(eth, fromAddress, prep.approve)
        await waitForReceipt(eth, approveTxHash)
      }

      setPhase(2) // "Burning USDC"
      const burnTxHash = await sendCall(eth, fromAddress, prep.burn)

      setStatus('completing')
      setPhase(3) // "Waiting for attestation & minting into MironPay"
      const completeRes = await fetch('/api/wallet/bridge/deposit/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ externalChain: chainSlug, burnTxHash }),
      })
      const complete = await completeRes.json()
      if (!completeRes.ok) throw new Error(complete.error || 'Could not complete deposit')

      setResult({
        direction: 'deposit', chainSlug, amount, recipientAddress: walletAddress,
        burnTxHash, burnChain: chainSlug,
        mintTxHash: complete.mintTxHash ?? null, mintChain: 'arc',
      })
      setStatus('success')
      onSuccess?.()
    } catch (e) {
      setError(errorMessage(e))
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
        style={{ position: 'relative', width: 432, maxWidth: '94vw', maxHeight: '90vh', borderRadius: 22, ...S.panel, border: '1px solid rgba(var(--c-fg-rgb),.14)', boxShadow: '0 30px 80px rgba(3,8,20,.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {showExitConfirm && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(6,4,16,.85)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ textAlign: 'center', maxWidth: 300 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(251,191,36,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /></svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', marginBottom: 8 }}>Transfer still in progress</div>
              <p style={{ fontSize: 13, color: 'var(--c-muted)', lineHeight: 1.5, marginBottom: 20 }}>
                Closing now won&apos;t stop it — it&apos;ll keep going in the background, but you won&apos;t see the result here.
                {direction === 'deposit' && ' Check the Activity list or the block explorer later to confirm it completed.'}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowExitConfirm(false)} style={{ flex: 1, ...S.input, background: 'linear-gradient(135deg,#818cf8,#6366f1 52%,#4338ca)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Keep waiting</button>
                <button onClick={forceClose} style={{ flex: 1, ...S.input, cursor: 'pointer', fontWeight: 600 }}>Exit anyway</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid rgba(var(--c-fg-rgb),.07)', flexShrink: 0 }}>
          <div style={{ width: 34 }} />
          <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: 'var(--c-text)', textAlign: 'center', marginRight: 34 }}>Bridge</span>
          <button onClick={handleClose} style={S.btn34}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 20px' }}>
          {pinStep ? (
            <div style={{ animation: 'srsStep .25s ease', textAlign: 'center' }}>
              <div style={{ width: 54, height: 54, margin: '6px auto 0', borderRadius: 16, background: 'linear-gradient(135deg,#818cf8,#6366f1 52%,#4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              </div>
              <div style={{ fontSize: 19, fontWeight: 700, marginTop: 14, color: 'var(--c-text)' }}>Enter your PIN</div>
              <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>
                6-digit PIN to authorize withdrawing {amount} USDC to {recipientAddress.slice(0, 6)}…{recipientAddress.slice(-4)}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '24px 0 8px' }}>
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} style={{ width: 14, height: 14, borderRadius: '50%', ...(i < pinValue.length ? { background: 'linear-gradient(135deg,#818cf8,#6366f1 52%,#4338ca)', boxShadow: '0 0 8px rgba(99,102,241,.6)' } : { background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)' }), display: 'inline-block', transition: 'background .15s, box-shadow .15s' }} />
                ))}
              </div>

              {pinError
                ? <p style={{ fontSize: 12.5, color: '#fb6f84', marginBottom: 16, minHeight: 20 }}>{pinError}</p>
                : <div style={{ marginBottom: 16, minHeight: 20 }} />}

              {pinVerifying ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2.5px solid rgba(99,102,241,.3)', borderTopColor: '#818cf8', animation: 'srsSpin 0.8s linear infinite' }} />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, maxWidth: 288, margin: '0 auto' }}>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
                    <button
                      key={i}
                      disabled={k === ''}
                      onClick={() => {
                        if (k === '⌫') { setPinValue(v => v.slice(0, -1)); setPinError(null); return }
                        if (k === '' || pinValue.length >= 6) return
                        const next = pinValue + k
                        setPinValue(next); setPinError(null)
                        if (next.length === 6) setTimeout(() => confirmPinAndWithdraw(next), 300)
                      }}
                      style={{ height: 58, borderRadius: 14, border: '1px solid rgba(var(--c-fg-rgb),.07)', background: k === '' ? 'transparent' : 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 22, fontWeight: 600, cursor: k === '' ? 'default' : 'pointer', opacity: k === '' ? 0 : 1 }}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              )}

              <button onClick={() => setPinStep(false)} disabled={pinVerifying} style={{ marginTop: 18, background: 'none', border: 'none', color: 'var(--c-muted)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            </div>
          ) : status === 'submitting' || status === 'awaiting_signature' || status === 'completing' ? (
            <div style={{ animation: 'srsStep .25s ease', padding: '6px 2px' }}>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto' }}>
                  <svg width={72} height={72} viewBox="0 0 72 72" style={{ animation: 'srsSpin 1s linear infinite' }}>
                    <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(var(--c-fg-rgb),.07)" strokeWidth={5} />
                    <circle cx="36" cy="36" r="30" fill="none" stroke="#6366f1" strokeWidth={5} strokeLinecap="round" strokeDasharray="60 200" />
                  </svg>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 16, color: 'var(--c-text)' }}>
                  {direction === 'withdraw' ? 'Withdrawing…' : 'Depositing…'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>
                  {status === 'awaiting_signature' ? 'Confirm in your wallet' : 'This can take a bit on testnet — please keep this window open'}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(direction === 'withdraw' ? WITHDRAW_PHASES : DEPOSIT_PHASES).map((label, i) => {
                  const done = phase > i
                  const active = phase === i
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 12, background: done ? 'rgba(34,197,94,.05)' : active ? 'rgba(99,102,241,.08)' : 'rgba(var(--c-fg-rgb),.03)', border: `1px solid ${done ? 'rgba(34,197,94,.2)' : active ? 'rgba(99,102,241,.3)' : 'rgba(var(--c-fg-rgb),.05)'}`, transition: 'all .3s' }}>
                      <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', ...(done ? { background: 'rgba(34,197,94,.2)', color: '#22c55e' } : active ? { border: '2px solid #6366f1', animation: 'srsSpin 1s linear infinite' } : { background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)', color: 'var(--c-muted2)', fontSize: 11, fontWeight: 600 }) }}>
                        {done ? <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg> : active ? null : <span>{i + 1}</span>}
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: done ? 500 : active ? 600 : 400, color: done ? '#22c55e' : active ? 'var(--c-text)' : 'var(--c-muted2)', transition: 'color .3s' }}>{label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : status === 'success' && result ? (
            <div style={{ textAlign: 'center', padding: '12px 0 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e', marginBottom: 18 }}>
                {result.direction === 'withdraw' ? 'Withdrawal complete' : 'Deposit complete'}
              </div>

              <div style={{ textAlign: 'left', background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)', borderRadius: 14, padding: '14px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Row label="Direction" value={result.direction === 'withdraw' ? 'Withdraw' : 'Deposit'} />
                <Row label="Amount" value={`${result.amount} USDC`} mono />
                <Row label="Route" value={result.direction === 'withdraw' ? `Arc → ${chainLabel(result.chainSlug)}` : `${chainLabel(result.chainSlug)} → Arc`} />
                {result.recipientAddress && (
                  <Row label={result.direction === 'withdraw' ? 'Recipient' : 'To wallet'} value={`${result.recipientAddress.slice(0, 6)}…${result.recipientAddress.slice(-4)}`} mono />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                {result.burnTxHash && (
                  <TxLink label={`Burn tx (${chainLabel(result.burnChain)})`} txHash={result.burnTxHash} chain={result.burnChain} />
                )}
                {result.mintTxHash && (
                  <TxLink label={`Mint tx (${chainLabel(result.mintChain)})`} txHash={result.mintTxHash} chain={result.mintChain} />
                )}
              </div>

              <button onClick={handleClose} style={{ ...S.input, background: 'linear-gradient(135deg,#818cf8,#6366f1 52%,#4338ca)', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer' }}>Done</button>
            </div>
          ) : status === 'error' && !busy ? (
            <div style={{ textAlign: 'center', padding: '12px 0 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444', marginBottom: 10 }}>
                {direction === 'withdraw' ? 'Withdrawal failed' : 'Deposit failed'}
              </div>
              {error && (
                <div style={{ fontSize: 13, color: 'var(--c-muted)', lineHeight: 1.5, marginBottom: 20, background: 'rgba(239,68,68,.08)', borderRadius: 12, padding: '10px 14px' }}>
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleClose} style={{ flex: 1, ...S.input, cursor: 'pointer', fontWeight: 600 }}>Close</button>
                <button onClick={() => { setStatus('idle'); setError(null) }} style={{ flex: 1, ...S.input, background: 'linear-gradient(135deg,#818cf8,#6366f1 52%,#4338ca)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Try again</button>
              </div>
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
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <button
                  type="button"
                  onClick={() => setChainMenuOpen(o => !o)}
                  disabled={busy}
                  style={{ ...S.input, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
                >
                  <span>{chainLabel(chainSlug)}</span>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--c-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: chainMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
                </button>
                {chainMenuOpen && (
                  <>
                    <div onClick={() => setChainMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1001 }} />
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 1002, background: 'var(--c-panel)', border: '1px solid rgba(var(--c-fg-rgb),.14)', borderRadius: 12, boxShadow: '0 12px 32px rgba(3,8,20,.35)', overflow: 'hidden' }}>
                      {CHAINS.map(c => {
                        const selected = c.slug === chainSlug
                        return (
                          <button
                            key={c.slug}
                            type="button"
                            onClick={() => { setChainSlug(c.slug); setEstimate(null); setChainMenuOpen(false) }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,.16)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = selected ? 'rgba(99,102,241,.10)' : 'transparent' }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', fontSize: 13.5, fontWeight: selected ? 600 : 500, background: selected ? 'rgba(99,102,241,.10)' : 'transparent', color: 'var(--c-text)', border: 'none', cursor: 'pointer' }}
                          >
                            {c.label}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

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
                <div style={{ marginBottom: 14, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.07)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {estimate.fees.length === 0 && estimate.gasFees.length === 0 ? (
                    <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>
                      This testnet route didn&apos;t return a fee estimate — you can still proceed; actual gas is paid automatically by MironPay&apos;s relayer.
                    </span>
                  ) : (
                    <>
                      {estimate.fees.length === 0 && (
                        <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>No protocol/kit fee for this transfer.</span>
                      )}
                      {estimate.fees.map((f, i) => (
                        <Row key={`fee-${i}`} label={feeTypeLabel(f.type)} value={`${f.amount} ${f.token}`} mono />
                      ))}
                      {estimate.gasFees.map((g, i) => (
                        <Row
                          key={`gas-${i}`}
                          label={`Gas · ${g.name} (${chainLabel(g.blockchain === 'Arc_Testnet' ? 'arc' : g.blockchain)})`}
                          value={g.fees ? `${g.fees.fee} ${g.token}` : g.error ? 'Unavailable on testnet' : '—'}
                          mono
                        />
                      ))}
                      {estimate.totalUsd != null && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 8, marginTop: 2, borderTop: '1px solid rgba(var(--c-fg-rgb),.08)' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#818cf8' }}>
                            Estimated total{!estimate.totalUsdComplete && ' (partial)'}
                          </span>
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: '#818cf8', fontFamily: 'var(--font-mono)' }}>
                            {estimate.totalUsd < 0.01 ? '< $0.01' : `≈ $${estimate.totalUsd.toFixed(2)}`}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={runEstimate}
                  disabled={!amount || parseFloat(amount) <= 0 || busy}
                  title="Preview the protocol and gas fees for this transfer before confirming — doesn't submit anything"
                  style={{ flex: 1, ...S.input, cursor: 'pointer', fontWeight: 600, opacity: (!amount || busy) ? 0.5 : 1 }}
                >
                  {status === 'estimating' ? 'Estimating…' : 'Estimate'}
                </button>
                <button
                  onClick={direction === 'withdraw' ? startWithdraw : submitDeposit}
                  disabled={!canSubmit}
                  style={{ flex: 1, ...S.input, background: 'linear-gradient(135deg,#818cf8,#6366f1 52%,#4338ca)', color: '#fff', border: 'none', fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5 }}
                >
                  {direction === 'withdraw' ? 'Withdraw' : 'Connect & Deposit'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
