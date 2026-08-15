export type CircleTokenBalanceLike = {
  amount?: string | number | null
  token?: {
    symbol?: string | null
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

/**
 * Circle can return both a native-precompile and ERC-20 representation of the
 * same asset on ARC. They describe the same holding, so summing them would
 * double the balance. Keep the largest entry for each normalized symbol.
 */
export function dedupeTokenBalancesBySymbol<T extends CircleTokenBalanceLike>(
  balances: T[],
  options: { maxBalance?: number } = {},
): T[] {
  const maxBalance = options.maxBalance ?? Number.POSITIVE_INFINITY
  const bySymbol = new Map<string, { balance: T; amount: number }>()

  for (const balance of balances) {
    const symbol = balance.token?.symbol?.trim().toUpperCase()
    const amount = Number(balance.amount ?? 0)
    if (!symbol || !Number.isFinite(amount) || amount < 0 || amount > maxBalance) continue

    const existing = bySymbol.get(symbol)
    if (!existing || amount > existing.amount) {
      bySymbol.set(symbol, { balance, amount })
    }
  }

  return Array.from(bySymbol.values(), entry => entry.balance)
}
