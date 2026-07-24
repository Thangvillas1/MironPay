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
  const rawTxs = ((txRes.data?.transactions as any[]) ?? [])
    .filter((tx) => {
      // Bỏ contract execution txs (swap overhead) — amount=0 OUTBOUND, không phải transfer thực
      if (tx.transactionType !== 'INBOUND' && parseFloat(tx.amounts?.[0] ?? '0') === 0) return false
      return true
    })

  // Fetch memos for these txHashes (RLS ensures only sender/recipient can read)
  const txHashes = rawTxs.map((tx) => tx.txHash).filter(Boolean)
  const memoMap: Record<string, string> = {}
  const kindMap: Record<string, string> = {}
  if (txHashes.length > 0) {
    const [{ data: memos }, { data: kinds }] = await Promise.all([
      supabase.from('transaction_memos').select('tx_hash, memo').in('tx_hash', txHashes),
      supabase.from('transaction_kinds').select('tx_hash, kind').in('tx_hash', txHashes),
    ])
    for (const m of memos ?? []) {
      memoMap[m.tx_hash] = m.memo
    }
    for (const k of kinds ?? []) {
      kindMap[k.tx_hash] = k.kind
    }
  }

  const transactions = rawTxs.map((tx) => ({
    id: tx.id,
    type: (tx.transactionType === 'INBOUND' ? 'credit' : 'debit') as 'credit' | 'debit',
    amount: parseFloat(tx.amounts?.[0] ?? '0'),
    tokenSymbol: (tx.token?.symbol ?? txTokenMap[tx.tokenId ?? ''] ?? 'USDC') as string,
    // Circle only ever reports a generic Sent/Received — swap the label to
    // "Swap"/"Bridge" when this tx_hash was tagged at execution time (see
    // app/api/wallet/swap/route.ts and app/api/wallet/bridge/**/route.ts),
    // so the shared activity-icon logic (which keys off "swap"/"bridge" in
    // the description) picks it up everywhere.
    description: tx.txHash && kindMap[tx.txHash] === 'swap'
      ? 'Swap'
      : tx.txHash && (kindMap[tx.txHash] === 'bridge_out' || kindMap[tx.txHash] === 'bridge_in')
      ? 'Bridge'
      : tx.transactionType === 'INBOUND' ? 'Received' : 'Sent',
    created_at: tx.createDate ?? new Date().toISOString(),
    state: tx.state,
    txHash: tx.txHash,
    blockchain: tx.blockchain,
    sourceAddress: tx.sourceAddress,
    destinationAddress: tx.destinationAddress,
    networkFee: tx.networkFee,
    memo: tx.txHash ? memoMap[tx.txHash] : undefined,
  }))

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
