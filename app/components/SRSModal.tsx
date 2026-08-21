'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '@/app/lib/supabase'
import { validateUsernameFormat } from '@/app/lib/username'
import type { TokenBalance } from '@/app/lib/types'
import { startPinRecovery } from '@/app/lib/pin-recovery-client'
import { isSelfTransferAddress } from '@/app/lib/self-transfer'

export type ModalMode = 'send' | 'receive' | 'swap' | null
type Step = 'amount' | 'token' | 'confirm' | 'setup_pin' | 'confirm_pin' | 'pin' | 'progress' | 'success' | 'error' | 'form' | 'receive'
type ResolutionState = 'idle' | 'resolving' | 'found' | 'not_found' | 'invalid'

const EVM_RE = /^0x[0-9a-fA-F]{40}$/
// Tokens supported by Circle StablecoinKit on ARC testnet
const SWAPPABLE = new Set(['USDC', 'EURC'])
const TOKEN_LOGO_COLORS: Record<string, string> = {
  USDC: '#2775ca', EURC: '#1e63c4', ETH: '#627eea',
  USDT: '#26a17b', DEGEN: '#a36cf0',
}
const VERIFIED = new Set(['USDC', 'EURC', 'ETH', 'USDT'])
const SEND_PHASES = ['Signing transaction', 'Broadcasting to ARC', 'Confirming on-chain', 'Settled']
const SWAP_PHASES = ['Signing swap', 'Routing on ARC', 'Confirming on-chain', 'Settled']

function tokColor(symbol: string) { return TOKEN_LOGO_COLORS[symbol] ?? '#6366f1' }
function tokInitials(symbol: string) { return symbol.length <= 4 ? symbol : symbol.slice(0, 4) }
function tokFontSize(symbol: string) { return symbol.length >= 4 ? 9 : 12 }

function BadgeCheck() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="#2f6bff" />
      <path d="M7.5 12.2l3 3 6-6.4" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TokenLogo({ symbol, logoUrl, size = 38 }: { symbol: string; logoUrl?: string | null; size?: number }) {
  const [err, setErr] = useState(false)
  if (logoUrl && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={symbol} width={size} height={size} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={() => setErr(true)} />
    )
  }
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: tokColor(symbol), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: tokFontSize(symbol), fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {tokInitials(symbol)}
    </span>
  )
}

interface SwapQuote {
  estimatedOutput: { amount: string; token: string } | null
  stopLimit?: { amount: string; token: string } | null
  fees?: Array<{ amount: string; token: string; type: string }> | null
}

export interface SRSModalProps {
  mode: ModalMode
  onClose: () => void
  accessToken: string
  tokenList: TokenBalance[]
  walletAddress: string | null
  username: string | null
  hasPIN?: boolean
  onPINSet?: () => void
  onSuccess?: () => void
  initialSwapSymbol?: string | null
}

interface PinPadProps {
  step: Step
  pin: string
  pinError: string
  pinLoading: boolean
  title: string
  heading: string
  onKey: (key: string) => void
  onDelete: () => void
  onForgotPin: () => void
}

function PinPad({ step, pin, pinError, pinLoading, title, heading, onKey, onDelete, onForgotPin }: PinPadProps) {
  const isSetup = step === 'setup_pin' || step === 'confirm_pin'
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 54, height: 54, margin: '6px auto 0', borderRadius: 16, background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', boxShadow: '0 8px 30px rgba(99,102,241,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        {isSetup
          ? <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M2 20c0-4 4.5-7 10-7s10 3 10 7" /></svg>
          : <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>}
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, marginTop: 14, color: 'var(--c-text)' }}>{heading}</div>
      <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>{title}</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '24px 0 8px' }}>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} style={{ width: 14, height: 14, borderRadius: '50%', ...(i < pin.length ? { background: 'linear-gradient(135deg,#818cf8,#6366f1 52%,#4338ca)', boxShadow: '0 0 8px rgba(99,102,241,.6)' } : { background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)' }), display: 'inline-block', transition: 'background .15s, box-shadow .15s' }} />
        ))}
      </div>
      {pinError ? <p style={{ fontSize: 12.5, color: '#fb6f84', marginBottom: 16, minHeight: 20 }}>{pinError}</p> : <div style={{ marginBottom: 16, minHeight: 20 }} />}
      <div style={{ position: 'relative', minHeight: 200 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, maxWidth: 288, margin: '0 auto', opacity: pinLoading ? .35 : 1, pointerEvents: pinLoading ? 'none' : 'auto' }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => (
            <button key={i} onClick={key === '⌫' ? onDelete : key === '' ? undefined : () => onKey(key)} disabled={key === ''} style={{ height: 58, borderRadius: 14, border: '1px solid rgba(var(--c-fg-rgb),.07)', background: key === '' ? 'transparent' : 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 22, fontWeight: 600, cursor: key === '' ? 'default' : 'pointer', transition: 'background .1s', opacity: key === '' ? 0 : 1 }}>
              {key}
            </button>
          ))}
        </div>
        {pinLoading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 32, height: 32, borderRadius: '50%', border: '2.5px solid rgba(99,102,241,.3)', borderTopColor: '#818cf8', animation: 'srsSpin 0.8s linear infinite' }} /></div>}
      </div>
      {step === 'pin' && <button onClick={onForgotPin} disabled={pinLoading} style={{ marginTop: 12, border: 'none', background: 'transparent', color: '#818cf8', fontSize: 12.5, fontWeight: 600, cursor: pinLoading ? 'wait' : 'pointer' }}>Forgot PIN?</button>}
    </div>
  )
}

export default function SRSModal({
  mode, onClose, accessToken, tokenList, walletAddress, username,
  hasPIN = false, onPINSet, onSuccess, initialSwapSymbol,
}: SRSModalProps) {
  // ── Step ───────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(mode === 'receive' ? 'receive' : mode === 'swap' ? 'form' : 'amount')
  const [tokenSelectFor, setTokenSelectFor] = useState<'send' | 'swapIn' | 'swapOut'>('send')

  // ── Send state ─────────────────────────────────────────────────────────────
  const [recipient, setRecipient] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [sendTokenIdx, setSendTokenIdx] = useState(0)
  const [resolution, setResolution] = useState<ResolutionState>('idle')
  const [resolvedAddress, setResolvedAddress] = useState('')
  const [resolvedUsername, setResolvedUsername] = useState('')

  // ── Swap state ─────────────────────────────────────────────────────────────
  // Swap is always between USDC and EURC, even if the wallet has never held
  // one of them yet — that's the whole point of swapping into it. Fall back
  // to a zero-balance placeholder for whichever side isn't in tokenList.
  const swapTokens: TokenBalance[] = Array.from(SWAPPABLE).map(symbol => (
    tokenList.find(t => t.symbol === symbol) ?? {
      symbol,
      name: symbol === 'USDC' ? 'USD Coin' : 'Euro Coin',
      amount: '0',
      usdValue: 0,
      change24hPct: null,
      logoUrl: null,
      isVerified: true,
      tokenAddress: null,
    }
  ))
  const hasSwapBalance = swapTokens.some(t => parseFloat(t.amount) > 0)
  const [swapAmount, setSwapAmount] = useState('')
  const initialSwapInIdx = (() => {
    const preselected = initialSwapSymbol ? swapTokens.findIndex(t => t.symbol === initialSwapSymbol) : -1
    if (preselected >= 0) return preselected
    return parseFloat(swapTokens[0]?.amount ?? '0') > 0 ? 0 : 1
  })()
  const [swapInIdx, setSwapInIdx] = useState(initialSwapInIdx)
  const [swapOutIdx, setSwapOutIdx] = useState(initialSwapInIdx === 0 ? 1 : 0)
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null)
  const [swapQuoteLoading, setSwapQuoteLoading] = useState(false)
  const [swapQuoteError, setSwapQuoteError] = useState('')
  const swapDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [slippagePct, setSlippagePct] = useState('30')
  const [slipCustomFocused, setSlipCustomFocused] = useState(false)
  const slippageBps = Math.round((parseFloat(slippagePct) || 0) * 100)

  // ── PIN state ──────────────────────────────────────────────────────────────
  const [pin, setPin] = useState('')
  const [setupPin, setSetupPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)
  const pinAutoRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transactionPinRef = useRef('')

  // ── Progress ───────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState(0)
  const phaseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const txStatusRef = useRef<{ ok: boolean; error?: string } | null>(null)
  const abortedRef = useRef(false)
  const [txHash, setTxHash] = useState('')
  const [txError, setTxError] = useState('')
  const [swapAmountOut, setSwapAmountOut] = useState('')

  // ── Receive ────────────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Reset on mode open ──────────────────────────────────────────────────────
  // ── Username resolution ─────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'amount') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const raw = recipient.trim()
    if (!raw || resolution !== 'resolving') return
    if (raw.startsWith('@')) {
      const uname = raw.slice(1).toLowerCase()
      debounceRef.current = setTimeout(async () => {
        const { data } = await supabase.rpc('resolve_username', { p_username: uname })
        if (data) {
          setResolvedAddress(data); setResolvedUsername(uname); setResolution('found')
        } else {
          setResolvedAddress(''); setResolvedUsername(''); setResolution('not_found')
        }
      }, 500)
      return
    }
    if (raw.startsWith('0x')) {
      debounceRef.current = setTimeout(async () => {
        const { data } = await supabase.rpc('resolve_wallet_address', { p_wallet_address: raw })
        setResolvedUsername(data ?? ''); setResolution('found')
      }, 400)
      return
    }
  }, [recipient, resolution, step])

  // ── Swap quote ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'form') return
    if (swapDebounce.current) clearTimeout(swapDebounce.current)
    const amt = parseFloat(swapAmount)
    if (!swapAmount || isNaN(amt) || amt <= 0 || !accessToken) return
    const tokIn = swapTokens[swapInIdx]; const tokOut = swapTokens[swapOutIdx]
    if (!tokIn || !tokOut || tokIn.symbol === tokOut.symbol) return
    swapDebounce.current = setTimeout(async () => {
      setSwapQuote(null)
      setSwapQuoteError('')
      setSwapQuoteLoading(true)
      try {
        const params = new URLSearchParams({ tokenIn: tokIn.symbol, tokenOut: tokOut.symbol, amountIn: swapAmount, slippageBps: String(slippageBps) })
        const res = await fetch(`/api/wallet/swap/estimate?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } })
        let d: Record<string, unknown> = {}
        try { d = await res.json() } catch { /* skip */ }
        if (res.ok) setSwapQuote(d as unknown as SwapQuote)
        else setSwapQuoteError((d.error as string) ?? 'Quote error')
      } catch (e) { setSwapQuoteError(e instanceof Error ? e.message : 'Connection error') }
      setSwapQuoteLoading(false)
    }, 700)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapAmount, swapInIdx, swapOutIdx, step, slippageBps])

  function handleRecipientChange(value: string) {
    const raw = value.trim()
    setRecipient(value)
    setResolvedAddress('')
    setResolvedUsername('')

    if (!raw) {
      setResolution('idle')
    } else if (raw.startsWith('@')) {
      setResolution(validateUsernameFormat(raw.slice(1).toLowerCase()) ? 'invalid' : 'resolving')
    } else if (raw.startsWith('0x') && EVM_RE.test(raw)) {
      setResolvedAddress(raw)
      setResolution('resolving')
    } else {
      setResolution('invalid')
    }
  }

  // ── Cleanup timers ──────────────────────────────────────────────────────────
  function clearTimers() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (pinAutoRef.current) clearTimeout(pinAutoRef.current)
    if (phaseRef.current) clearTimeout(phaseRef.current)
    if (swapDebounce.current) clearTimeout(swapDebounce.current)
  }
  function handleClose() {
    abortedRef.current = true
    clearTimers()
    setPin('')
    transactionPinRef.current = ''
    onClose()
  }

  // ── PIN keypad (shared across pin / setup_pin / confirm_pin) ───────────────
  function handlePinKey(k: string) {
    if (pin.length >= 6 || pinLoading) return
    const next = pin + k
    setPin(next)
    setPinError('')
    if (next.length < 6) return
    if (pinAutoRef.current) clearTimeout(pinAutoRef.current)
    if (step === 'setup_pin') {
      pinAutoRef.current = setTimeout(() => { setSetupPin(next); setPin(''); setStep('confirm_pin') }, 300)
    } else if (step === 'confirm_pin') {
      pinAutoRef.current = setTimeout(() => handleConfirmPin(next), 300)
    } else {
      pinAutoRef.current = setTimeout(() => handleVerifyPin(next), 300)
    }
  }
  function handlePinDel() {
    if (pinLoading) return
    if (pinAutoRef.current) clearTimeout(pinAutoRef.current)
    setPin(p => p.slice(0, -1))
  }

  async function handleVerifyPin(enteredPin: string) {
    setPinLoading(true); setPinError('')
    try {
      const res = await fetch('/api/auth/pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ pin: enteredPin }),
      })
      if (res.ok) {
        transactionPinRef.current = enteredPin
        enterProgress()
      } else {
        const d = await res.json()
        setPinError(d.error === 'Incorrect PIN' ? 'Incorrect PIN — try again' : d.error ?? 'Verification failed')
        setPin('')
      }
    } catch {
      setPinError('Connection error — try again')
      setPin('')
    }
    setPinLoading(false)
  }

  async function handleConfirmPin(confirmedPin: string) {
    if (confirmedPin !== setupPin) {
      setPinError("PINs don't match — start again")
      setPin(''); setSetupPin(''); setStep('setup_pin')
      return
    }
    setPinLoading(true)
    try {
      const res = await fetch('/api/auth/pin/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ pin: confirmedPin }),
      })
      if (res.ok) {
        transactionPinRef.current = confirmedPin
        onPINSet?.()
        enterProgress()
      } else {
        const d = await res.json()
        setPinError(d.error ?? 'Failed to save PIN')
        setPin('')
      }
    } catch {
      setPinError('Connection error — try again')
      setPin('')
    }
    setPinLoading(false)
  }

  async function handleForgotPin() {
    if (pinAutoRef.current) clearTimeout(pinAutoRef.current)
    setPinLoading(true)
    setPinError('')
    try {
      await startPinRecovery()
    } catch (error) {
      setPinError(error instanceof Error ? error.message : 'Could not open Google verification.')
      setPinLoading(false)
    }
  }

  // ── Progress + TX ───────────────────────────────────────────────────────────
  function enterProgress() {
    txStatusRef.current = null
    abortedRef.current = false
    setPhase(0); setStep('progress')
    if (mode === 'send') runSendTx()
    if (mode === 'swap') runSwapTx()
    runPhases()
  }

  function runPhases() {
    let p = 0
    const advance = async () => {
      p++; setPhase(p)
      if (p < 3) {
        phaseRef.current = setTimeout(advance, 750)
        return
      }
      // Phase 3 ("Settled") active — wait for real tx result
      let waited = 0
      while (txStatusRef.current === null && waited < 30000 && !abortedRef.current) {
        await new Promise<void>(r => { phaseRef.current = setTimeout(r, 200) })
        waited += 200
      }
      if (abortedRef.current) return
      if (txStatusRef.current?.ok) {
        setPhase(4) // all phases done
        phaseRef.current = setTimeout(() => { onSuccess?.(); setStep('success') }, 500)
      } else {
        setTxError(txStatusRef.current?.error ?? 'Transaction failed. Please try again.')
        setStep('error')
      }
    }
    phaseRef.current = setTimeout(advance, 750)
  }

  async function runSendTx() {
    try {
      const sendTok = tokenList[sendTokenIdx]
      const transactionPin = transactionPinRef.current
      transactionPinRef.current = ''
      const res = await fetch('/api/wallet/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ destinationAddress: resolvedAddress, amount: sendAmount.trim(), memo: memo.trim(), tokenSymbol: sendTok?.symbol, pin: transactionPin }),
      })
      const d = await res.json()
      if (res.ok) {
        setTxHash(d.txHash ?? '')
        txStatusRef.current = { ok: true }
      } else {
        txStatusRef.current = { ok: false, error: d.error ?? 'Send failed' }
      }
    } catch (e) {
      txStatusRef.current = { ok: false, error: e instanceof Error ? e.message : 'Send failed' }
    }
  }

  async function runSwapTx() {
    try {
      const tokIn = swapTokens[swapInIdx]; const tokOut = swapTokens[swapOutIdx]
      const transactionPin = transactionPinRef.current
      transactionPinRef.current = ''
      const res = await fetch('/api/wallet/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ tokenIn: tokIn?.symbol, tokenOut: tokOut?.symbol, amountIn: swapAmount, slippageBps, pin: transactionPin }),
      })
      const d = await res.json()
      if (res.ok) {
        setTxHash(d.txHash ?? ''); setSwapAmountOut(d.amountOut ?? '')
        txStatusRef.current = { ok: true }
      } else {
        txStatusRef.current = { ok: false, error: d.error ?? 'Swap failed' }
      }
    } catch (e) {
      txStatusRef.current = { ok: false, error: e instanceof Error ? e.message : 'Swap failed' }
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  function handleBack() {
    setPinError('')
    if (step === 'token') setStep(tokenSelectFor === 'send' ? 'amount' : 'form')
    else if (step === 'confirm') setStep('amount')
    else if (step === 'setup_pin') setStep(mode === 'swap' ? 'form' : 'confirm')
    else if (step === 'confirm_pin') { setSetupPin(''); setPin(''); setPinError(''); setStep('setup_pin') }
    else if (step === 'pin') { setPin(''); transactionPinRef.current = ''; setStep(mode === 'swap' ? 'form' : 'confirm') }
  }

  function openTokenSelect(from: 'send' | 'swapIn' | 'swapOut') { setTokenSelectFor(from); setStep('token') }

  function selectToken(idx: number) {
    if (tokenSelectFor === 'send') {
      setSendTokenIdx(idx)
      setStep('amount')
      return
    }
    // Swap-in and swap-out share the same token universe (swapTokens). Picking
    // a token already selected on the other side flips them instead of
    // letting pay/receive collapse onto the same token.
    if (tokenSelectFor === 'swapIn') {
      if (idx === swapOutIdx) setSwapOutIdx(swapInIdx)
      setSwapInIdx(idx)
    } else {
      if (idx === swapInIdx) setSwapInIdx(swapOutIdx)
      setSwapOutIdx(idx)
    }
    setSwapQuote(null)
    setStep('form')
  }

  function flipSwap() {
    const tmp = swapInIdx; setSwapInIdx(swapOutIdx); setSwapOutIdx(tmp)
    setSwapAmount(''); setSwapQuote(null); setSwapQuoteError('')
  }

  async function handleCopyAddress() {
    if (!walletAddress) return
    await navigator.clipboard.writeText(walletAddress)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const sendTok = tokenList[sendTokenIdx]
  const swapIn = swapTokens[swapInIdx]
  const swapOut = swapTokens[swapOutIdx]
  const sendBal = parseFloat(sendTok?.amount ?? '0')
  const swapInBal = parseFloat(swapIn?.amount ?? '0')
  const sendFee = 0.001
  const sendTotal = (parseFloat(sendAmount || '0') + sendFee).toFixed(4)
  const isSelfRecipient = isSelfTransferAddress(resolvedAddress, [walletAddress])
  const canSend = resolution === 'found' && !isSelfRecipient && parseFloat(sendAmount) > 0
  const canSwap = parseFloat(swapAmount) > 0 && swapQuote?.estimatedOutput != null
  const swapReceiveAmt = swapQuote?.estimatedOutput?.amount ?? ''
  const showBack = ['token', 'confirm', 'pin', 'setup_pin', 'confirm_pin'].includes(step)

  const displayRecipient = resolvedUsername ? `@${resolvedUsername}` : recipient

  const modalTitle: Record<Step, string> = {
    amount: 'Send', token: 'Select Token', confirm: 'Review Send',
    setup_pin: 'Set Your PIN', confirm_pin: 'Confirm Your PIN',
    pin: 'Authorize', progress: mode === 'swap' ? 'Swapping…' : 'Sending…',
    success: mode === 'swap' ? 'Swap Complete' : 'Transfer Sent',
    error: 'Transaction Failed',
    form: 'Swap', receive: 'Receive',
  }

  const phases = mode === 'swap' ? SWAP_PHASES : SEND_PHASES

  if (!mode) return null

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    panel: { background: 'var(--c-panel)' } as React.CSSProperties,
    input: { background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)', borderRadius: 12, color: 'var(--c-text)', outline: 'none', width: '100%', fontSize: 14, padding: '12px 14px', fontFamily: 'inherit' } as React.CSSProperties,
    row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' } as React.CSSProperties,
    rowBorder: { borderTop: '1px solid rgba(var(--c-fg-rgb),.07)' } as React.CSSProperties,
    muted: { color: 'var(--c-muted)', fontSize: 13.5 } as React.CSSProperties,
    label: { fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase' as const, color: 'var(--c-muted2)' },
    grad: { background: 'linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)', boxShadow: '0 8px 30px rgba(99,102,241,.42)' } as React.CSSProperties,
    card: { borderRadius: 14, background: 'rgba(var(--c-fg-rgb),.04)', border: '1px solid rgba(var(--c-fg-rgb),.07)', overflow: 'hidden' } as React.CSSProperties,
    btn34: { display: 'flex', width: 34, height: 34, alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(var(--c-fg-rgb),.07)', background: 'rgba(var(--c-fg-rgb),.05)', borderRadius: 10, color: 'var(--c-muted)', cursor: 'pointer', flexShrink: 0 } as React.CSSProperties,
  }

  // ── PIN pad (shared) ────────────────────────────────────────────────────────
  const pinTitle = step === 'setup_pin' ? 'Create a 6-digit PIN' : step === 'confirm_pin' ? 'Re-enter your PIN' : mode === 'swap' ? '6-digit PIN to authorize swap' : '6-digit PIN to authorize transfer'
  const pinHeading = step === 'setup_pin' ? 'Set your PIN' : step === 'confirm_pin' ? 'Confirm your PIN' : 'Enter your PIN'
  // Keep the modal frame fixed from review through authorization/result.
  // Without this, opening the taller PIN pad re-centers the panel ~40px up,
  // which looks like the whole screen is shaking. `min()` keeps short
  // viewports within the existing 90vh scroll boundary.
  const stableTransactionFrame = ['confirm', 'pin', 'setup_pin', 'confirm_pin', 'progress', 'success', 'error'].includes(step)

  return (
    <div
      onClick={handleClose}
      className="srs-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(6,4,16,.66)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'srsScrim .2s ease' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="srs-panel"
        style={{ width: 432, maxWidth: '94vw', minHeight: stableTransactionFrame ? 'min(621px, 90vh)' : undefined, maxHeight: '90vh', borderRadius: 22, ...S.panel, border: '1px solid rgba(var(--c-fg-rgb),.14)', boxShadow: '0 30px 80px rgba(3,8,20,.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'srsUp 340ms cubic-bezier(.22,1,.36,1)' }}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid rgba(var(--c-fg-rgb),.07)', flexShrink: 0 }}>
          {showBack
            ? <button onClick={handleBack} style={{ ...S.btn34, color: 'var(--c-text)' }}>
                <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
            : <div style={{ width: 34 }} />
          }
          <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: 'var(--c-text)', textAlign: 'center', marginRight: 34 }}>{modalTitle[step]}</span>
          <button onClick={handleClose} style={S.btn34}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="srs-pad" style={{ flex: 1, overflowY: 'auto', padding: '22px 20px' }}>

          {/* ────────── TOKEN SELECT ────────── */}
          {step === 'token' && (
            <div style={{ animation: 'srsStep .25s ease' }}>
              <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                {tokenSelectFor === 'send'
                  ? 'Choose which token to send. Verified tokens show a blue check.'
                  : tokenSelectFor === 'swapIn'
                  ? 'Choose the token to pay with. Only Circle-supported tokens on ARC.'
                  : 'Choose the token to receive. Only Circle-supported tokens on ARC.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {(tokenSelectFor === 'send' ? tokenList : swapTokens).map((t, i) => {
                  const fiat = t.usdValue != null ? `$${t.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
                  const bal = parseFloat(t.amount)
                  const balStr = bal < 1 ? bal.toFixed(4) : bal.toFixed(2)
                  const isSelected = tokenSelectFor === 'send' ? i === sendTokenIdx : tokenSelectFor === 'swapIn' ? i === swapInIdx : i === swapOutIdx
                  const isVerified = t.isVerified || VERIFIED.has(t.symbol)
                  return (
                    <button key={t.symbol} onClick={() => selectToken(i)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 14, background: isSelected ? 'rgba(99,102,241,.07)' : 'rgba(var(--c-fg-rgb),.05)', border: `1px solid ${isSelected ? '#6366f1' : 'rgba(var(--c-fg-rgb),.07)'}`, cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'border-color .15s' }}>
                      <TokenLogo symbol={t.symbol} logoUrl={t.logoUrl} size={38} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--c-text)' }}>{t.name}</span>
                          {isVerified && <BadgeCheck />}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--c-muted2)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{t.symbol}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>{fiat}</div>
                        <div style={{ fontSize: 12, color: 'var(--c-muted2)', marginTop: 2 }}>{balStr} {t.symbol}</div>
                      </div>
                      {isSelected && (
                        <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#818cf8,#6366f1 52%,#4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12 }}>✓</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ────────── SEND AMOUNT ────────── */}
          {step === 'amount' && (
            <div style={{ animation: 'srsStep .25s ease', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <p style={S.label}>Recipient</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(var(--c-fg-rgb),.05)', border: `1px solid ${resolution === 'found' && !isSelfRecipient ? 'rgba(45,212,191,.4)' : resolution === 'invalid' || resolution === 'not_found' || isSelfRecipient ? 'rgba(251,111,132,.4)' : 'rgba(var(--c-fg-rgb),.14)'}`, marginTop: 8 }}>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#818cf8,#6366f1 52%,#4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {recipient ? recipient[0].toUpperCase() : '?'}
                  </span>
                  <input value={recipient} onChange={e => handleRecipientChange(e.target.value)} placeholder="@username or 0x address" spellCheck={false} autoComplete="off" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 14, fontFamily: 'var(--font-mono)' }} />
                  {resolution === 'found' && !isSelfRecipient && (
                    <svg width={18} height={18} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="rgba(45,212,191,.2)" /><path d="M7.5 12.2l3 3 6-6.4" fill="none" stroke="#2dd4bf" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </div>
                {(resolution === 'invalid' || resolution === 'not_found') && (
                  <p style={{ fontSize: 11, color: '#fb6f84', marginTop: 5, paddingLeft: 2 }}>
                    {resolution === 'not_found' ? `@${recipient.slice(1)} is not registered on MironPay` : 'Enter @username or 0x wallet address'}
                  </p>
                )}
                {resolution === 'resolving' && <p style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 5 }}>Resolving...</p>}
                {resolution === 'found' && !isSelfRecipient && recipient.trim().startsWith('@') && (
                  <p style={{ fontSize: 11, color: '#2dd4bf', marginTop: 5, paddingLeft: 2, fontFamily: 'var(--font-mono)' }}>
                    {resolvedAddress.slice(0, 6)}…{resolvedAddress.slice(-6)}
                  </p>
                )}
                {resolution === 'found' && !isSelfRecipient && recipient.trim().startsWith('0x') && (
                  <p style={{ fontSize: 11, marginTop: 5, paddingLeft: 2 }}>
                    {resolvedUsername ? (
                      <span style={{ color: '#2dd4bf' }}>@{resolvedUsername}</span>
                    ) : (
                      <span style={{ color: 'var(--c-muted)' }}>No MironPay username linked to this address</span>
                    )}
                  </p>
                )}
                {resolution === 'found' && isSelfRecipient && (
                  <p style={{ fontSize: 11, color: '#fb6f84', marginTop: 5, paddingLeft: 2 }}>You cannot send to your own wallet.</p>
                )}
              </div>

              <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
                <p style={{ ...S.label, marginBottom: 10 }}>Amount</p>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input value={sendAmount} onChange={e => setSendAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" style={{ width: 180, textAlign: 'center', background: 'transparent', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 48, fontWeight: 700, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }} />
                  <button onClick={() => openTokenSelect('send')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)', cursor: 'pointer' }}>
                    <TokenLogo symbol={sendTok?.symbol ?? 'USDC'} logoUrl={sendTok?.logoUrl} size={22} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)' }}>{sendTok?.symbol ?? 'USDC'}</span>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--c-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--c-muted2)', marginTop: 8 }}>Balance: {sendBal < 1 ? sendBal.toFixed(4) : sendBal.toFixed(2)} {sendTok?.symbol}</p>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {['10', '25', '50', 'Max'].map(c => (
                  <button key={c} onClick={() => setSendAmount(c === 'Max' ? sendBal.toString() : c)} style={{ flex: 1, height: 38, borderRadius: 10, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{c}</button>
                ))}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={S.label}>Memo <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--c-muted)' }}>· optional</span></span>
                  <span style={{ fontSize: 11, color: 'var(--c-muted2)', fontVariantNumeric: 'tabular-nums' }}>{memo.length}/80</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)' }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--c-muted)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
                  <input value={memo} onChange={e => setMemo(e.target.value.slice(0, 80))} placeholder="Add a note — e.g. invoice #1024" maxLength={80} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 14 }} />
                </div>
                <p style={{ fontSize: 11, color: 'var(--c-muted2)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
                  Memo is recorded on-chain and visible to the recipient.
                </p>
              </div>

              <button onClick={() => canSend && setStep('confirm')} disabled={!canSend} style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', fontSize: 15, fontWeight: 600, color: '#fff', cursor: canSend ? 'pointer' : 'not-allowed', ...(canSend ? S.grad : { background: 'rgba(var(--c-fg-rgb),.07)', color: 'var(--c-muted2)' }), marginTop: 4, transition: 'all .15s' }}>
                Continue
              </button>
            </div>
          )}

          {/* ────────── SEND CONFIRM ────────── */}
          {step === 'confirm' && (
            <div style={{ animation: 'srsStep .25s ease' }}>
              <div style={{ textAlign: 'center', padding: '8px 0 22px' }}>
                <p style={S.label}>You&apos;re sending</p>
                <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-.03em', marginTop: 6, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>
                  {sendAmount} <span style={{ fontSize: 18, color: 'var(--c-muted)' }}>{sendTok?.symbol}</span>
                </div>
              </div>

              <div style={S.card}>
                <div style={S.row}>
                  <span style={S.muted}>To</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#818cf8,#6366f1 52%,#4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>
                      {(resolvedUsername || recipient)[0]?.toUpperCase() ?? '?'}
                    </span>
                    {displayRecipient}
                  </span>
                </div>
                <div style={{ ...S.row, ...S.rowBorder }}>
                  <span style={S.muted}>Network</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>ARC · Circle</span>
                </div>
                {memo && (
                  <div style={{ ...S.row, ...S.rowBorder, alignItems: 'flex-start' }}>
                    <span style={{ ...S.muted, flexShrink: 0 }}>Memo</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', textAlign: 'right', wordBreak: 'break-word', maxWidth: '60%' }}>{memo}</span>
                  </div>
                )}
                <div style={{ ...S.row, ...S.rowBorder }}>
                  <span style={S.muted}>Network fee</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: '#2dd4bf' }}>~{sendFee.toFixed(4)} {sendTok?.symbol}</span>
                </div>
                <div style={{ ...S.row, ...S.rowBorder, background: 'rgba(var(--c-fg-rgb),.02)' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)' }}>Total</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>{sendTotal} {sendTok?.symbol}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 12, color: 'var(--c-muted2)' }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" /></svg>
                {hasPIN ? 'You\'ll authorize this with your PIN.' : 'You\'ll create a PIN to authorize this transfer.'}
              </div>

              <button onClick={() => setStep(hasPIN ? 'pin' : 'setup_pin')} style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', ...S.grad, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 18 }}>
                {hasPIN ? 'Confirm with PIN' : 'Create PIN & Send'}
              </button>
            </div>
          )}

          {/* ────────── PIN STEPS (shared pad) ────────── */}
          {(step === 'pin' || step === 'setup_pin' || step === 'confirm_pin') && (
            <PinPad step={step} pin={pin} pinError={pinError} pinLoading={pinLoading} title={pinTitle} heading={pinHeading} onKey={handlePinKey} onDelete={handlePinDel} onForgotPin={handleForgotPin} />
          )}

          {/* ────────── PROGRESS ────────── */}
          {step === 'progress' && (
            <div style={{ animation: 'srsStep .25s ease', padding: '6px 2px' }}>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto' }}>
                  <svg width={72} height={72} viewBox="0 0 72 72" style={{ animation: 'srsSpin 1s linear infinite' }}>
                    <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(var(--c-fg-rgb),.07)" strokeWidth={5} />
                    <circle cx="36" cy="36" r="30" fill="none" stroke="#6366f1" strokeWidth={5} strokeLinecap="round" strokeDasharray="60 200" />
                  </svg>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 16, color: 'var(--c-text)' }}>
                  {mode === 'swap' ? `Swapping ${swapIn?.symbol}…` : `Sending ${sendTok?.symbol}…`}
                </div>
                <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>Please keep this window open</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {phases.map((label, i) => {
                  const done = phase > i
                  const active = phase === i
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 12, background: done ? 'rgba(45,212,191,.05)' : active ? 'rgba(99,102,241,.08)' : 'rgba(var(--c-fg-rgb),.03)', border: `1px solid ${done ? 'rgba(45,212,191,.2)' : active ? 'rgba(99,102,241,.3)' : 'rgba(var(--c-fg-rgb),.05)'}`, transition: 'all .3s' }}>
                      <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', ...(done ? { background: 'rgba(45,212,191,.2)', color: '#2dd4bf' } : active ? { border: '2px solid #6366f1', animation: 'srsSpin 1s linear infinite' } : { background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.14)', color: 'var(--c-muted2)', fontSize: 11, fontWeight: 600 }) }}>
                        {done ? <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg> : active ? null : <span>{i + 1}</span>}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: done ? 500 : active ? 600 : 400, color: done ? '#2dd4bf' : active ? 'var(--c-text)' : 'var(--c-muted2)', transition: 'color .3s' }}>{label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ────────── SUCCESS ────────── */}
          {step === 'success' && (
            <div style={{ animation: 'srsStep .25s ease', textAlign: 'center', padding: '8px 0' }}>
              <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'rgba(45,212,191,.12)', border: '1px solid rgba(45,212,191,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', animation: 'srsPop 400ms cubic-bezier(.22,1,.36,1)' }}>
                <svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 16, color: 'var(--c-text)' }}>
                {mode === 'swap' ? 'Swap complete!' : `Sent ${sendAmount} ${sendTok?.symbol}`}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--c-muted)', marginTop: 6 }}>
                {mode === 'swap'
                  ? `${swapAmount} ${swapIn?.symbol} → ${swapAmountOut || swapQuote?.estimatedOutput?.amount || '…'} ${swapOut?.symbol}`
                  : `to ${displayRecipient} on ARC`}
              </div>

              {memo && mode === 'send' && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, padding: '6px 12px', borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.05)', border: '1px solid rgba(var(--c-fg-rgb),.1)' }}>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--c-muted)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
                  <span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>{memo}</span>
                </div>
              )}

              {txHash && (
                <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, padding: '12px 16px', borderRadius: 12, background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)', textDecoration: 'none' }}>
                  <div>
                    <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--c-indigo-light)', marginBottom: 3 }}>View on ARC Explorer</p>
                    <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#6366f1' }}>{txHash.slice(0, 14)}…{txHash.slice(-8)}</p>
                  </div>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--c-indigo-light)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>
                </a>
              )}

              <button onClick={handleClose} style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', ...S.grad, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 20 }}>
                Done
              </button>
            </div>
          )}

          {/* ────────── ERROR ────────── */}
          {step === 'error' && (
            <div style={{ animation: 'srsStep .25s ease', textAlign: 'center', padding: '8px 0' }}>
              <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'rgba(251,111,132,.12)', border: '1px solid rgba(251,111,132,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', animation: 'srsPop 400ms cubic-bezier(.22,1,.36,1)' }}>
                <svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke="#fb6f84" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 16, color: 'var(--c-text)' }}>Transaction Failed</div>
              <div style={{ fontSize: 13.5, color: '#fb6f84', marginTop: 8, padding: '0 12px', lineHeight: 1.5 }}>{txError}</div>

              {txHash && (
                <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, padding: '12px 16px', borderRadius: 12, background: 'rgba(251,111,132,.06)', border: '1px solid rgba(251,111,132,.2)', textDecoration: 'none' }}>
                  <div>
                    <p style={{ fontSize: 11.5, fontWeight: 600, color: '#fb6f84', marginBottom: 3 }}>View failed tx on Explorer</p>
                    <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#fb6f84', opacity: 0.7 }}>{txHash.slice(0, 14)}…{txHash.slice(-8)}</p>
                  </div>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fb6f84" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>
                </a>
              )}

              <button onClick={handleClose} style={{ width: '100%', height: 52, borderRadius: 14, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 24 }}>
                Close
              </button>
            </div>
          )}

          {/* ────────── RECEIVE ────────── */}
          {step === 'receive' && (
            <div style={{ animation: 'srsStep .25s ease' }}>
              <p style={{ fontSize: 13.5, color: 'var(--c-muted)', marginBottom: 20, lineHeight: 1.6, textAlign: 'center' }}>
                Share your address to receive any token on ARC Testnet.
              </p>
              {walletAddress ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                    <div style={{ background: '#ffffff', borderRadius: 16, padding: 16 }}>
                      <QRCodeSVG value={walletAddress} size={188} bgColor="#ffffff" fgColor="#000000" level="M" />
                    </div>
                  </div>
                  {username && (
                    <div style={{ textAlign: 'center', marginBottom: 14 }}>
                      <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text)' }}>@{username}</p>
                      <p style={{ fontSize: 12, color: 'var(--c-muted2)', marginTop: 3 }}>MironPay username</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(var(--c-fg-rgb),.04)', border: '1px solid rgba(var(--c-fg-rgb),.09)', marginBottom: 14 }}>
                    <span style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--c-text)', wordBreak: 'break-all' }}>
                      {walletAddress.slice(0, 6)}…{walletAddress.slice(-6)}
                    </span>
                    <button onClick={handleCopyAddress} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, background: copied ? 'rgba(45,212,191,.15)' : 'rgba(var(--c-fg-rgb),.06)', border: `1px solid ${copied ? 'rgba(45,212,191,.3)' : 'rgba(var(--c-fg-rgb),.1)'}`, color: copied ? '#2dd4bf' : 'var(--c-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                      {copied
                        ? <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                        : <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                      }
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={handleCopyAddress} style={{ flex: 1, height: 48, borderRadius: 12, border: '1px solid rgba(var(--c-fg-rgb),.14)', background: 'rgba(var(--c-fg-rgb),.05)', color: 'var(--c-text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" /></svg>
                      Share
                    </button>
                    <button onClick={handleClose} style={{ flex: 1, height: 48, borderRadius: 12, border: 'none', ...S.grad, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Done
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(99,102,241,.4)', borderTopColor: '#6366f1', animation: 'srsSpin 0.8s linear infinite', margin: '0 auto 12px' }} />
                  <p style={{ fontSize: 13, color: 'var(--c-muted2)' }}>Loading wallet...</p>
                </div>
              )}
            </div>
          )}

          {/* ────────── SWAP FORM ────────── */}
          {step === 'form' && (
            <div style={{ animation: 'srsStep .25s ease', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!hasSwapBalance ? (
                <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)', marginBottom: 8 }}>Nothing to swap yet</p>
                  <p style={{ fontSize: 13, color: 'var(--c-muted)', lineHeight: 1.6 }}>
                    You need some USDC or EURC in your wallet to start a swap. Only Circle-supported tokens on ARC testnet are swappable.
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ ...S.card, padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <p style={S.label}>You pay</p>
                      <p style={{ fontSize: 12, color: 'var(--c-muted2)' }}>Balance: {swapInBal < 1 ? swapInBal.toFixed(4) : swapInBal.toFixed(2)} {swapIn?.symbol}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input value={swapAmount} onChange={e => { setSwapAmount(e.target.value.replace(/[^0-9.]/g, '')); setSwapQuote(null) }} placeholder="0.00" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 32, fontWeight: 700, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }} />
                      <button onClick={() => openTokenSelect('swapIn')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.06)', border: '1px solid rgba(var(--c-fg-rgb),.14)', cursor: 'pointer', flexShrink: 0 }}>
                        <TokenLogo symbol={swapIn?.symbol ?? 'USDC'} logoUrl={swapIn?.logoUrl} size={22} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)' }}>{swapIn?.symbol ?? 'USDC'}</span>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--c-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      {[25, 50, 75, 100].map(pct => (
                        <button key={pct} onClick={() => { setSwapAmount((swapInBal * pct / 100).toFixed(6)); setSwapQuote(null) }} style={{ flex: 1, height: 28, borderRadius: 7, border: '1px solid rgba(var(--c-fg-rgb),.1)', background: 'rgba(var(--c-fg-rgb),.04)', color: 'var(--c-muted)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>{pct === 100 ? 'Max' : `${pct}%`}</button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button onClick={flipSwap} style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--c-panel)', border: '3px solid rgba(var(--c-fg-rgb),.07)', color: 'var(--c-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform .2s' }}>
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" /></svg>
                    </button>
                  </div>

                  <div style={{ ...S.card, padding: '16px 18px' }}>
                    <p style={{ ...S.label, marginBottom: 8 }}>You receive</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, fontSize: 32, fontWeight: 700, letterSpacing: '-.02em', color: swapReceiveAmt ? '#2dd4bf' : 'var(--c-muted2)', fontVariantNumeric: 'tabular-nums' }}>
                        {swapQuoteLoading ? <span style={{ fontSize: 14, color: 'var(--c-muted2)' }}>Calculating…</span> : swapReceiveAmt || '0.00'}
                      </div>
                      <button onClick={() => openTokenSelect('swapOut')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9999, background: 'rgba(var(--c-fg-rgb),.06)', border: '1px solid rgba(var(--c-fg-rgb),.14)', cursor: 'pointer', flexShrink: 0 }}>
                        <TokenLogo symbol={swapOut?.symbol ?? 'EURC'} logoUrl={swapOut?.logoUrl} size={22} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)' }}>{swapOut?.symbol ?? 'EURC'}</span>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--c-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                      </button>
                    </div>
                  </div>

                  {/* ── Slippage tolerance ── */}
                  <div style={{ padding: '15px 16px 16px', borderRadius: 14, background: 'rgba(var(--c-fg-rgb),.04)', border: '1px solid rgba(var(--c-fg-rgb),.07)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)' }}>
                        Slippage tolerance
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--c-muted2)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: slippageBps > 2000 ? '#fb6f84' : slippageBps < 500 ? '#f5b748' : 'var(--c-text)' }}>{slippagePct}%</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[{ label: 'Auto', value: '30' }, { label: '0.5%', value: '0.5' }, { label: '1.0%', value: '1.0' }].map(({ label, value }) => {
                        const active = !slipCustomFocused && slippagePct === value
                        return (
                          <button key={value} onClick={() => { setSlippagePct(value); setSlipCustomFocused(false) }} style={{ flex: 1, height: 36, borderRadius: 10, border: `1px solid ${active ? '#6366f1' : 'rgba(var(--c-fg-rgb),.14)'}`, background: active ? 'rgba(99,102,241,.12)' : 'rgba(var(--c-fg-rgb),.05)', color: active ? 'var(--c-indigo-light)' : 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
                        )
                      })}
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', borderRadius: 10, border: `1px solid ${slipCustomFocused ? '#6366f1' : 'rgba(var(--c-fg-rgb),.14)'}`, background: 'rgba(var(--c-fg-rgb),.05)' }}>
                        <input
                          value={slipCustomFocused ? slippagePct : ''}
                          onFocus={() => setSlipCustomFocused(true)}
                          onChange={e => {
                            const v = e.target.value.replace(/[^0-9.]/g, '')
                            setSlippagePct(v === '' ? '0' : Math.min(50, parseFloat(v) || 0).toString())
                          }}
                          placeholder="Custom"
                          style={{ width: '100%', minWidth: 0, textAlign: 'center', background: 'transparent', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}
                        />
                        <span style={{ fontSize: 13, color: 'var(--c-muted2)', flexShrink: 0 }}>%</span>
                      </div>
                    </div>
                    {slippageBps < 500 && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(245,183,72,.1)', color: '#f5b748', fontSize: 12, lineHeight: 1.45 }}>
                        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                        ARC testnet liquidity is thin — slippage below 5% often causes swaps to fail.
                      </div>
                    )}
                    {slippageBps > 2000 && slippagePct !== '30' && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(251,111,132,.1)', color: '#fb6f84', fontSize: 12, lineHeight: 1.45 }}>
                        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                        High slippage — you may receive significantly less than estimated.
                      </div>
                    )}
                  </div>

                  {swapQuote?.estimatedOutput && (
                    <div style={S.card}>
                      <div style={S.row}>
                        <span style={S.muted}>Rate</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>1 {swapIn?.symbol} ≈ {(parseFloat(swapReceiveAmt || '0') / parseFloat(swapAmount || '1')).toFixed(4)} {swapOut?.symbol}</span>
                      </div>
                      {swapQuote.stopLimit?.amount && (
                        <div style={{ ...S.row, ...S.rowBorder }}>
                          <span style={S.muted}>Minimum received</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{swapQuote.stopLimit.amount} {swapOut?.symbol}</span>
                        </div>
                      )}
                      <div style={{ ...S.row, ...S.rowBorder }}>
                        <span style={S.muted}>Network fee</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#2dd4bf' }}>~0.001 {swapIn?.symbol}</span>
                      </div>
                    </div>
                  )}
                  {swapQuoteError && <p style={{ fontSize: 12, color: '#fb6f84', textAlign: 'center' }}>{swapQuoteError}</p>}

                  <button onClick={() => canSwap && setStep(hasPIN ? 'pin' : 'setup_pin')} disabled={!canSwap} style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', fontSize: 15, fontWeight: 600, color: '#fff', cursor: canSwap ? 'pointer' : 'not-allowed', ...(canSwap ? S.grad : { background: 'rgba(var(--c-fg-rgb),.07)', color: 'var(--c-muted2)' }), marginTop: 4 }}>
                    {swapQuoteLoading ? 'Getting quote…' : canSwap ? (hasPIN ? 'Review swap' : 'Create PIN & swap') : 'Review swap'}
                  </button>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
