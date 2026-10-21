// Tokens confirmed listed on CoinGecko — used as "verified" signal on the asset list
export const VERIFIED_SYMBOLS = new Set([
  // Circle stablecoins
  'USDC', 'EURC',
  // Major stablecoins
  'USDT', 'DAI', 'USDP', 'FRAX', 'LUSD', 'GUSD', 'PYUSD', 'USDE',
  'FDUSD', 'TUSD', 'USDD', 'SUSD', 'CUSD', 'CRVUSD',
  // Wrapped major assets
  'WBTC', 'WETH', 'WBNB', 'WMATIC', 'WAVAX',
  // L1 / L2 natives
  'ETH', 'BTC', 'BNB', 'MATIC', 'AVAX', 'SOL', 'ARB', 'OP', 'SEI', 'SUI',
  // DeFi blue chips
  'UNI', 'AAVE', 'COMP', 'MKR', 'CRV', 'BAL', 'SNX', 'LINK', 'SUSHI',
  '1INCH', 'YFI', 'CVX', 'LDO', 'RPL', 'GMX', 'PENDLE', 'FXS',
  // Other top 200
  'SHIB', 'PEPE', 'FLOKI', 'DOGE', 'LTC', 'BCH', 'XRP', 'ADA',
  'DOT', 'ATOM', 'NEAR', 'APT', 'INJ', 'TIA', 'PYTH',
])

// Arc-native wrapped assets that track a listed asset 1:1 — priced as that asset.
const PRICE_ALIASES: Record<string, string> = {
  cirBTC: 'BTC',
}

/**
 * Symbol to look up a market price for, or null when the token must not get
 * one. Price lookups match by ticker only, so an arbitrary testnet token
 * (e.g. the Launchpad's "VP") would otherwise inherit the price of whatever
 * unrelated listed coin shares its ticker — that once valued 50,000 test VP
 * at $53,250 and inflated the wallet total.
 */
export function priceLookupSymbol(symbol: string): string | null {
  if (PRICE_ALIASES[symbol]) return PRICE_ALIASES[symbol]
  return VERIFIED_SYMBOLS.has(symbol) ? symbol : null
}

export const TOKEN_LOGOS: Record<string, string> = {
  USDC: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  EURC: 'https://assets.coingecko.com/coins/images/26045/small/euro-coin.png',
  USDT: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
  USDP: 'https://assets.coingecko.com/coins/images/13234/small/paxos_standard.png',
}
