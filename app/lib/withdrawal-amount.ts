const USDC_DECIMALS = 6
const SCALE = 10 ** USDC_DECIMALS

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
  tokenSymbol: 'USDC' | 'EURC'
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
