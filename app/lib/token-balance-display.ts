import type { TokenBalance } from '@/app/lib/types'

export type SpendableTokenAmount = {
  symbol: 'USDC' | 'EURC'
  amount: number
}

const SPENDABLE_ORDER: SpendableTokenAmount['symbol'][] = ['USDC', 'EURC']

export function getSpendableTokenBreakdown(
  tokens: Array<Pick<TokenBalance, 'symbol' | 'amount'>> | undefined,
  fallbackUsdc = 0,
): SpendableTokenAmount[] {
  const amounts = new Map<SpendableTokenAmount['symbol'], number>()

  for (const token of tokens ?? []) {
    const symbol = token.symbol.toUpperCase()
    if (symbol !== 'USDC' && symbol !== 'EURC') continue
    const amount = Number(token.amount)
    if (!Number.isFinite(amount) || amount < 0) continue
    amounts.set(symbol, Math.max(amounts.get(symbol) ?? 0, amount))
  }

  if (fallbackUsdc > 0) {
    amounts.set('USDC', Math.max(amounts.get('USDC') ?? 0, fallbackUsdc))
  }

  return SPENDABLE_ORDER
    .map(symbol => ({ symbol, amount: amounts.get(symbol) ?? 0 }))
    .filter(token => token.amount > 0)
}

export function combineSpendableTokenBreakdowns(
  ...wallets: SpendableTokenAmount[][]
): SpendableTokenAmount[] {
  return SPENDABLE_ORDER
    .map(symbol => ({
      symbol,
      amount: wallets.reduce(
        (sum, wallet) => sum + (wallet.find(token => token.symbol === symbol)?.amount ?? 0),
        0,
      ),
    }))
    .filter(token => token.amount > 0)
}

export function formatTokenAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: amount < 1 ? 4 : 2,
  }).format(amount)
}

export function formatSpendableTokenBreakdown(tokens: SpendableTokenAmount[]): string {
  if (tokens.length === 0) return 'No USDC or EURC'
  return tokens.map(token => `${formatTokenAmount(token.amount)} ${token.symbol}`).join(' · ')
}
