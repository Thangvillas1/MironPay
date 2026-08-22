import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { circleClient } from '@/app/lib/circle'

export const AGENT_LEVEL_CAPS: Readonly<Record<string, number>> = Object.freeze({
  Newcomer: 5,
  Builder: 10,
  Trader: 20,
  Elite: 50,
})

export function levelCap(level: string | null | undefined): number {
  return AGENT_LEVEL_CAPS[level ?? 'Newcomer'] ?? AGENT_LEVEL_CAPS.Newcomer
}

/** Financial amounts use a dot decimal and at most 6 decimals. Grouping commas
 * are rejected instead of being guessed ("1,000" must never become 1 USDC). */
export function parseAgentAmount(value: unknown): number | null {
  const raw = typeof value === 'string' ? value.trim() : String(value ?? '')
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(raw)) return null
  const amount = Number(raw)
  return Number.isSafeInteger(amount * 1_000_000) && amount > 0 ? amount : null
}

type CircleTokenBalance = {
  amount?: string
  token?: { id?: string; name?: string; symbol?: string; tokenAddress?: string | null }
}

const ARC_USDC = '0x3600000000000000000000000000000000000000'

export function resolveCanonicalAgentToken(
  balances: CircleTokenBalance[],
  symbol: string,
): CircleTokenBalance | null {
  const wanted = symbol.toUpperCase()
  const candidates = balances.filter((entry) => entry.token?.symbol?.toUpperCase() === wanted)
  const configuredAddress = wanted === 'USDC'
    ? ARC_USDC
    : wanted === 'EURC'
      ? process.env.ARC_TESTNET_EURC_ADDRESS?.toLowerCase()
      : null

  if (configuredAddress) {
    const canonical = candidates.filter((entry) => entry.token?.tokenAddress?.toLowerCase() === configuredAddress)
    return canonical.sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0))[0] ?? null
  }

  // Until EURC's canonical address is configured, accept only an unambiguous
  // Circle token record. Duplicate-symbol assets fail closed.
  return candidates.length === 1 ? candidates[0] : null
}

export async function assertCircleWalletBinding(walletId: string, expectedAddress: string): Promise<void> {
  const result = await circleClient.getWallet({ id: walletId })
  const wallet = result.data?.wallet
  if (!wallet?.address || wallet.address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error('CIRCLE_WALLET_BINDING_MISMATCH')
  }
}

export function hasInternalAgentAuthorization(request: Request): boolean {
  const expected = internalAgentAuthorizationHeader()
  const supplied = request.headers.get('x-miron-agent-internal')
  if (!expected || !supplied) return false
  const left = Buffer.from(supplied)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function internalAgentAuthorizationHeader(): string | null {
  const secret = process.env.AGENT_INTERNAL_SECRET || process.env.AGENT_INTENT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  return secret ? createHmac('sha256', secret).update('miron-agent-internal-v1').digest('base64url') : null
}

export function stableCircleIdempotencyKey(userId: string, purpose: string): string {
  const hex = createHash('sha256').update(`mironpay:${purpose}:${userId}`).digest('hex').slice(0, 32).split('')
  hex[12] = '5'
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}
