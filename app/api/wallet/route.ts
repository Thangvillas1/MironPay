import { NextRequest, NextResponse } from 'next/server'
import { circleClient } from '@/app/lib/circle'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { TOKEN_USD_PRICE } from '@/app/lib/types'
import { fetchSimplePrice } from '@/app/lib/coingecko'
import { VERIFIED_SYMBOLS, TOKEN_LOGOS } from '@/app/lib/token-meta'


export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const wallet = await resolveCircleWalletId(supabase, user.id)
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

  const { circleWalletId, walletAddress } = wallet

  const [balanceRes, txRes] = await Promise.all([
    circleClient.getWalletTokenBalance({ id: circleWalletId }),
    // 50 (Circle's practical page-size ceiling) instead of 20 — the wallet
    // page reconstructs its 1M balance-history chart from this list, and a
    // deeper window needs more transactions to stay accurate.
    circleClient.listTransactions({ walletIds: [circleWalletId], pageSize: 50 }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenBalances: any[] = balanceRes.data?.tokenBalances ?? []
  const usdc = tokenBalances.find((b) => b.token?.symbol === 'USDC')

  const txTokenMap: Record<string, string> = {}
  for (const b of tokenBalances) {
    if (b.token?.id) txTokenMap[b.token.id] = b.token.symbol ?? 'USDC'
  }

  // Dedup by symbol — Circle returns multiple entries for the same token on ARC
  // (native precompile + ERC20 contract, same underlying balance). Use MAX not SUM.
  const symbolMap = new Map<string, { name: string; amount: number; tokenAddress: string | null }>()
  for (const b of tokenBalances) {
    const symbol: string = b.token?.symbol ?? ''
    if (!symbol) continue
    const amount = parseFloat(b.amount ?? '0')
    const existing = symbolMap.get(symbol)
    if (existing) {
      existing.amount = Math.max(existing.amount, amount)
    } else {
      symbolMap.set(symbol, {
        name: (b.token?.name as string) ?? symbol,
        amount,
        tokenAddress: (b.token?.tokenAddress as string | null) ?? null,
      })
    }
  }

  // Stablecoins use the fixed peg price; everything else gets a real live
  // price + 24h change from CoinGecko (free lookup, not the paid x402 tool).
  const tokenList = (await Promise.all(
    Array.from(symbolMap.entries()).map(async ([symbol, info]) => {
      const fixedPrice = TOKEN_USD_PRICE[symbol] ?? null
      const live = fixedPrice === null ? await fetchSimplePrice(symbol) : null
      const price = fixedPrice ?? live?.priceUsd ?? null
      return {
        symbol,
        name: info.name,
        amount: info.amount.toString(),
        usdValue: price !== null ? info.amount * price : null,
        change24hPct: live?.change24hPct ?? null,
        logoUrl: TOKEN_LOGOS[symbol] ?? null,
        isVerified: VERIFIED_SYMBOLS.has(symbol),
        tokenAddress: info.tokenAddress,
      }
    })
  )).sort((a, b) => {
    if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1
    return (b.usdValue ?? 0) - (a.usdValue ?? 0)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTxs = (txRes.data?.transactions as any[]) ?? []

  // Fetch memos/kinds using the FULL unfiltered list — a bridge withdraw's
  // burn is itself an amount=0 OUTBOUND CONTRACT_EXECUTION record (no
  // separate inbound leg on this chain to fall back on, unlike swap/deposit),
  // so we need to know which zero-amount rows are actually tagged before
  // deciding what to drop.
  const allTxHashes = allTxs.map((tx) => tx.txHash).filter(Boolean)
  const memoMap: Record<string, string> = {}
  const kindMap: Record<string, string> = {}
  const kindAmountMap: Record<string, { amount: string; token: string } | undefined> = {}
  if (allTxHashes.length > 0) {
    const [{ data: memos }, { data: kinds }] = await Promise.all([
      supabase.from('transaction_memos').select('tx_hash, memo').in('tx_hash', allTxHashes),
      supabase.from('transaction_kinds').select('tx_hash, kind, amount, token').in('tx_hash', allTxHashes),
    ])
    for (const m of memos ?? []) {
      memoMap[m.tx_hash] = m.memo
    }
    for (const k of kinds ?? []) {
      kindMap[k.tx_hash] = k.kind
      if (k.amount) kindAmountMap[k.tx_hash] = { amount: k.amount, token: k.token ?? 'USDC' }
    }
  }

  const rawTxs = allTxs.filter((tx) => {
    // Bỏ contract execution txs (swap overhead) — amount=0 OUTBOUND, không phải transfer thực
    // ...unless it's a tagged bridge withdrawal, whose only on-chain record
    // IS a zero-amount contract execution (see kindAmountMap above).
    if (tx.transactionType !== 'INBOUND' && parseFloat(tx.amounts?.[0] ?? '0') === 0) {
      return !!(tx.txHash && kindMap[tx.txHash] === 'bridge_out')
    }
    return true
  })

  const transactions = rawTxs.map((tx) => {
    const storedAmount = tx.txHash ? kindAmountMap[tx.txHash] : undefined
    return {
      id: tx.id,
      type: (tx.transactionType === 'INBOUND' ? 'credit' : 'debit') as 'credit' | 'debit',
      amount: storedAmount ? parseFloat(storedAmount.amount) : parseFloat(tx.amounts?.[0] ?? '0'),
      tokenSymbol: (storedAmount?.token ?? tx.token?.symbol ?? txTokenMap[tx.tokenId ?? ''] ?? 'USDC') as string,
      // Circle only ever reports a generic Sent/Received — swap the label to
      // "Swap"/"Bridge"/"Payroll" when this tx_hash was tagged at execution
      // time (see app/api/wallet/swap/route.ts, app/api/wallet/bridge/**,
      // app/api/payroll/claim/claim/route.ts), so the shared activity-icon
      // logic (which keys off "swap"/"bridge"/"payroll" in the description)
      // picks it up everywhere.
      description: tx.txHash && kindMap[tx.txHash] === 'swap'
        ? 'Swap'
        : tx.txHash && (kindMap[tx.txHash] === 'bridge_out' || kindMap[tx.txHash] === 'bridge_in')
        ? 'Bridge'
        : tx.txHash && kindMap[tx.txHash] === 'payroll_claim'
        ? 'Payroll'
        : tx.transactionType === 'INBOUND' ? 'Received' : 'Sent',
      created_at: tx.createDate ?? new Date().toISOString(),
      state: tx.state,
      txHash: tx.txHash,
      blockchain: tx.blockchain,
      sourceAddress: tx.sourceAddress,
      destinationAddress: tx.destinationAddress,
      networkFee: tx.networkFee,
      memo: tx.txHash ? memoMap[tx.txHash] : undefined,
    }
  })

  return NextResponse.json({
    balance: parseFloat(usdc?.amount ?? '0'),
    currency: 'USD',
    tokenId: usdc?.token?.id ?? null,
    circleWalletId,
    walletAddress,
    tokenList,
    transactions,
  })
}
