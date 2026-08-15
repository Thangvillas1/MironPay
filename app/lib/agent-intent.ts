import { createHmac, randomUUID, timingSafeEqual } from 'crypto'

export type AgentAction = {
  type: 'send' | 'swap' | 'gateway_deposit' | 'gateway_withdraw' | 'launchpad_contribute'
  amount: string
  to?: string
  token?: string
  tokenIn?: string
  tokenOut?: string
  projectId?: string
  walletSource?: 'agent' | 'main'
  intentProof?: string
}

type IntentPayload = {
  userId: string
  action: AgentAction
  sourceMessage: string
  expiresAt: number
  nonce: string
}

const SUPPORTED_TOKENS = new Set(['USDC', 'EURC'])
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
const USERNAME = /^@[a-z0-9_]{3,20}$/i
const MAX_INTENT_AGE_MS = 2 * 60 * 1000

function intentSecret(): string {
  const secret = process.env.AGENT_INTENT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('AGENT_INTENT_SECRET is not configured')
  return secret
}

function withoutProof(action: AgentAction): AgentAction {
  const normalized: AgentAction = {
    type: action.type,
    amount: String(action.amount ?? '').trim(),
    walletSource: action.walletSource === 'main' ? 'main' : 'agent',
  }
  if (action.to) normalized.to = action.to.trim()
  if (action.token) normalized.token = action.token.trim().toUpperCase()
  if (action.tokenIn) normalized.tokenIn = action.tokenIn.trim().toUpperCase()
  if (action.tokenOut) normalized.tokenOut = action.tokenOut.trim().toUpperCase()
  if (action.projectId) normalized.projectId = action.projectId.trim()
  return normalized
}

function explicitAmounts(message: string): number[] {
  const stripped = message
    .replace(/0x[a-fA-F0-9]{40}/g, ' ')
    .replace(/@[a-z0-9_]+/gi, ' ')
  return Array.from(stripped.matchAll(/(?:^|\s)(\d+(?:[.,]\d+)?)(?=\s|[a-zA-Z]|$)/g))
    .map(match => Number(match[1].replace(',', '.')))
    .filter(Number.isFinite)
}

function containsToken(message: string, token: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9])${token}(?:$|[^a-z0-9])`, 'i').test(message)
}

export function validateAgentIntent(
  sourceMessage: string,
  candidate: AgentAction,
): { ok: true; action: AgentAction } | { ok: false; error: string } {
  const action = withoutProof(candidate)
  const amount = Number(action.amount.replace(',', '.'))
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Please specify a valid amount greater than zero.' }
  }

  const amountWasTyped = explicitAmounts(sourceMessage)
    .some(value => Math.abs(value - amount) < 1e-9)
  if (!amountWasTyped) {
    return { ok: false, error: 'Please include the exact amount in your command.' }
  }

  const normalizedCommand = sourceMessage.normalize('NFD').replace(/\p{Diacritic}/gu, '')
  if (/\b(?:all|max|everything|het|toan bo)\b/i.test(normalizedCommand)) {
    return { ok: false, error: 'Please use an exact numeric amount instead of all or max.' }
  }

  if (action.type === 'send') {
    const token = action.token ?? ''
    if (!SUPPORTED_TOKENS.has(token) || !containsToken(sourceMessage, token)) {
      return { ok: false, error: 'Please specify either USDC or EURC in the send command.' }
    }
    if (!action.to || (!USERNAME.test(action.to) && !EVM_ADDRESS.test(action.to))) {
      return { ok: false, error: 'Please provide a valid @username or 0x recipient address.' }
    }
    if (!sourceMessage.toLowerCase().includes(action.to.toLowerCase())) {
      return { ok: false, error: 'Please include the recipient in the same command.' }
    }
  }

  if (action.type === 'swap') {
    const tokenIn = action.tokenIn ?? ''
    const tokenOut = action.tokenOut ?? ''
    if (!SUPPORTED_TOKENS.has(tokenIn) || !SUPPORTED_TOKENS.has(tokenOut) || tokenIn === tokenOut) {
      return { ok: false, error: 'A swap must use two different supported tokens: USDC and EURC.' }
    }
    if (!containsToken(sourceMessage, tokenIn) || !containsToken(sourceMessage, tokenOut)) {
      return { ok: false, error: 'Please include both swap tokens in the same command.' }
    }
  }

  if ((action.type === 'gateway_deposit' || action.type === 'gateway_withdraw')
    && !/\b(?:x402|gateway)\b/i.test(sourceMessage)) {
    return { ok: false, error: 'Please mention X402 or Gateway explicitly for this operation.' }
  }

  return { ok: true, action }
}

export function issueAgentIntent(userId: string, action: AgentAction, sourceMessage: string): string {
  const payload: IntentPayload = {
    userId,
    action: withoutProof(action),
    sourceMessage,
    expiresAt: Date.now() + MAX_INTENT_AGE_MS,
    nonce: randomUUID(),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', intentSecret())
    .update(`miron-agent-intent-v1.${encoded}`)
    .digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyAgentIntent(proof: string, userId: string): IntentPayload | null {
  const [encoded, suppliedSignature] = proof.split('.')
  if (!encoded || !suppliedSignature) return null

  const expectedSignature = createHmac('sha256', intentSecret())
    .update(`miron-agent-intent-v1.${encoded}`)
    .digest('base64url')
  const supplied = Buffer.from(suppliedSignature)
  const expected = Buffer.from(expectedSignature)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as IntentPayload
    if (payload.userId !== userId || payload.expiresAt < Date.now()) return null
    const validation = validateAgentIntent(payload.sourceMessage, payload.action)
    return validation.ok ? { ...payload, action: validation.action } : null
  } catch {
    return null
  }
}

export function sameAgentAction(left: AgentAction, right: AgentAction): boolean {
  return JSON.stringify(withoutProof(left)) === JSON.stringify(withoutProof(right))
}

export function isEvmAddress(value: string): boolean {
  return EVM_ADDRESS.test(value)
}
