// USDC is Arc's native gas token, so spending the whole USDC balance leaves
// nothing to pay the network fee and the transaction is rejected. Keep a small
// reserve when "Max" is used on USDC; other tokens don't pay gas themselves.
export const USDC_GAS_RESERVE = 0.01

/**
 * Largest amount the user can actually submit for `balance` of `symbol`,
 * truncated (never rounded up) to `decimals` places and returned as a plain
 * decimal string — `toString()` of a float can yield "421.44531200000003" or
 * exponent notation, and `toFixed()` rounds up past the real balance.
 */
export function maxSpendable(balance: string | number | undefined, symbol: string | undefined, decimals = 6): string {
  const bal = typeof balance === 'number' ? balance : parseFloat(balance ?? '0')
  if (!Number.isFinite(bal) || bal <= 0) return '0'
  const reserve = symbol === 'USDC' ? USDC_GAS_RESERVE : 0
  const spendable = bal - reserve
  if (spendable <= 0) return '0'
  const factor = 10 ** decimals
  const floored = Math.floor(spendable * factor + 1e-9) / factor
  return floored.toFixed(decimals).replace(/\.?0+$/, '')
}
