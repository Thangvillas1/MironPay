const USDC_DECIMALS = 6
const SCALE = 10 ** USDC_DECIMALS

export type WithdrawalToken = 'USDC' | 'EURC'

export type WithdrawalTokenBalance = {
  amount?: string | number | null
  token?: {
    id?: string | null
    symbol?: string | null
  } | null
}

export function parseWithdrawalToken(value: unknown): WithdrawalToken | null {
  if (typeof value !== 'string') return null
  const symbol = value.trim().toUpperCase()
  return symbol === 'USDC' || symbol === 'EURC' ? symbol : null
}

export function selectWithdrawalTokenBalance<T extends WithdrawalTokenBalance>(
  balances: T[],
  tokenSymbol: WithdrawalToken,
): T | undefined {
  return balances.find(balance => balance.token?.symbol?.trim().toUpperCase() === tokenSymbol)
}

function roundDown(value: number): number {
  return Math.floor(Math.max(0, value) * SCALE) / SCALE
}

function roundUp(value: number): number {
  return Math.ceil(Math.max(0, value) * SCALE) / SCALE
}

export function calculateWithdrawalAvailability({
  tokenSymbol,
  tokenBalance,
  usdcGasBalance,
  estimatedNetworkFee,
}: {
  tokenSymbol: WithdrawalToken
  tokenBalance: number
  usdcGasBalance: number
  estimatedNetworkFee: number
}) {
  // Circle's estimate is already buffered, but retain another 20% so a small
  // base-fee movement between preview and submission cannot consume the max.
  const feeReserve = roundUp(Math.max(
    estimatedNetworkFee * 1.2,
    estimatedNetworkFee + (1 / SCALE),
  ))
  const canPayFee = usdcGasBalance >= feeReserve
  const maxAmount = tokenSymbol === 'USDC'
    ? roundDown(tokenBalance - feeReserve)
    : canPayFee ? roundDown(tokenBalance) : 0

  return { feeReserve, maxAmount, canPayFee }
}
