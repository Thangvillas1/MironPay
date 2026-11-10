import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { circleClient } from '@/app/lib/circle'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { isSelfTransferAddress, normalizeWalletAddress } from '@/app/lib/self-transfer'
import { ARC_TESTNET_TOKENS, resolveRegistryToken, type RegistryToken } from '@/app/lib/arc-token-registry'

const ARC_BLOCKCHAIN = 'ARC-TESTNET' as const

export class TransferPreflightError extends Error {
  constructor(message: string, public status = 400, public code?: string) {
    super(message)
  }
}

/** Exact decimal compare without floats: a >= b for non-negative decimal strings. */
function decimalGte(a: string, b: string): boolean {
  const [ai, af = ''] = a.split('.')
  const [bi, bf = ''] = b.split('.')
  const len = Math.max(af.length, bf.length)
  const A = BigInt((ai || '0') + af.padEnd(len, '0'))
  const B = BigInt((bi || '0') + bf.padEnd(len, '0'))
  return A >= B
}

function decimalAdd(a: string, b: string): string {
  const [ai, af = ''] = a.split('.')
  const [bi, bf = ''] = b.split('.')
  const len = Math.max(af.length, bf.length)
  const sum = BigInt((ai || '0') + af.padEnd(len, '0')) + BigInt((bi || '0') + bf.padEnd(len, '0'))
  if (len === 0) return sum.toString()
  const s = sum.toString().padStart(len + 1, '0')
  return `${s.slice(0, -len)}.${s.slice(-len)}`.replace(/\.?0+$/, '')
}

/**
 * Read-only checks the Send review screen runs before asking for the PIN.
 * Mirrors the guards in /api/wallet/transfer (address format, self-send,
 * token present, balance) and adds what the user needs to confirm safely:
 * Circle address validation, an optional server blocklist, the real network
 * fee estimate (paid in USDC on Arc) and the recipient's MironPay @username.
 *
 * Tokens are resolved through the address-keyed Arc registry, so symbols are
 * case-insensitive ("cirBTC") and each token gets its own decimals (cirBTC: 8).
 */
export async function runTransferPreflight(input: {
  supabase: SupabaseClient
  userId: string
  destinationAddress: unknown
  amount: unknown
  tokenSymbol: unknown
}) {
  const symbolIn = typeof input.tokenSymbol === 'string' ? input.tokenSymbol.trim() : 'USDC'
  const registryToken: RegistryToken | undefined = ARC_TESTNET_TOKENS.find(
    (t) => t.symbol.toLowerCase() === symbolIn.toLowerCase(),
  )
  if (!registryToken) throw new TransferPreflightError(`${symbolIn} is not a supported token`, 400, 'UNSUPPORTED_TOKEN')

  const amountText = typeof input.amount === 'string' || typeof input.amount === 'number' ? String(input.amount).trim() : ''
  const amountRe = new RegExp(`^\\d+(?:\\.\\d{1,${registryToken.decimals}})?$`)
  if (!amountRe.test(amountText) || !/[1-9]/.test(amountText)) {
    throw new TransferPreflightError(
      `Enter a valid amount (up to ${registryToken.decimals} decimals)`,
      400,
      'INVALID_AMOUNT',
    )
  }

  const destination = normalizeWalletAddress(input.destinationAddress)
  if (!destination) throw new TransferPreflightError('Recipient address is invalid.', 400, 'INVALID_ADDRESS')

  const wallet = await resolveCircleWalletId(input.supabase, input.userId)
  if (!wallet) throw new TransferPreflightError('Wallet not found', 404)
  if (isSelfTransferAddress(destination, [wallet.walletAddress])) {
    throw new TransferPreflightError('You cannot send to your own wallet.', 400, 'SELF_TRANSFER')
  }

  const blocked = new Set(
    (process.env.BLOCKED_WALLET_ADDRESSES ?? '')
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean),
  )
  if (blocked.has(destination)) {
    throw new TransferPreflightError('This destination is blocked by wallet policy', 403, 'BLOCKED')
  }

  const [validation, balanceRes] = await Promise.all([
    circleClient.validateAddress({ address: destination, blockchain: ARC_BLOCKCHAIN }),
    circleClient.getWalletTokenBalance({ id: wallet.circleWalletId }),
  ])
  if (!validation.data?.isValid) {
    throw new TransferPreflightError('This address is not valid on Arc Testnet', 400, 'INVALID_ADDRESS')
  }

  // Circle may list USDC twice (native + 0x3600 ERC-20, same money): pick the
  // registry match with the highest balance, prefer the one with a token
  // address (same rule /api/wallet/transfer uses for memo transfers).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matching = ((balanceRes.data?.tokenBalances as any[]) ?? [])
    .filter((b) => resolveRegistryToken(b.token)?.address === registryToken.address && b.token?.id)
    .sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0))
  const selected = matching[0]
  if (!selected) throw new TransferPreflightError(`No ${registryToken.symbol} in this wallet`, 400, 'NO_BALANCE')
  const balance: string = String(selected.amount ?? '0')
  if (!decimalGte(balance, amountText)) {
    throw new TransferPreflightError(`Insufficient ${registryToken.symbol} balance`, 400, 'INSUFFICIENT_BALANCE')
  }

  let networkFee: string | null = null
  try {
    const fee = await circleClient.estimateTransferFee({
      walletId: wallet.circleWalletId,
      tokenId: selected.token.id,
      destinationAddress: destination,
      amount: [amountText],
    })
    const data = fee.data as unknown as {
      data?: { medium?: { networkFee?: string } }
      medium?: { networkFee?: string }
    }
    const raw = (data.data?.medium ?? data.medium)?.networkFee
    if (raw && /^\d+(\.\d+)?$/.test(raw)) networkFee = raw
  } catch {
    // createTransaction still enforces the MEDIUM fee; never invent a number.
  }

  // Gas on Arc is paid in USDC. Sending USDC: amount + fee must fit; sending
  // another token: the USDC balance must cover the fee.
  if (networkFee) {
    if (registryToken.symbol === 'USDC') {
      if (!decimalGte(balance, decimalAdd(amountText, networkFee))) {
        throw new TransferPreflightError(
          `Not enough USDC for the amount plus the network fee (${networkFee} USDC)`,
          400,
          'INSUFFICIENT_FOR_FEE',
        )
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usdc = ((balanceRes.data?.tokenBalances as any[]) ?? [])
        .filter((b) => resolveRegistryToken(b.token)?.symbol === 'USDC')
        .reduce((max, b) => (Number(b.amount ?? 0) > Number(max) ? String(b.amount) : max), '0')
      if (!decimalGte(usdc, networkFee)) {
        throw new TransferPreflightError(
          `You need ${networkFee} USDC for the network fee`,
          400,
          'INSUFFICIENT_FOR_FEE',
        )
      }
    }
  }

  // Show who the money is going to (MironPay users only) so the sender can
  // catch a wrong paste before confirming.
  const { data: recipient } = await createAdminSupabaseClient()
    .from('profiles')
    .select('username')
    .in('wallet_address', [destination, String(input.destinationAddress).trim()])
    .limit(1)
    .maybeSingle()

  return {
    wallet,
    destinationAddress: destination,
    amount: amountText,
    tokenSymbol: registryToken.symbol,
    tokenId: selected.token.id as string,
    decimals: registryToken.decimals,
    balance,
    networkFee,
    feeCurrency: 'USDC',
    feeLevel: 'MEDIUM' as const,
    recipientUsername: (recipient?.username as string | null) ?? null,
    safetyChecks: ['address-format', 'self-send', 'server-blocklist', 'circle-address-validation', 'balance', 'balance-plus-fee'],
  }
}
