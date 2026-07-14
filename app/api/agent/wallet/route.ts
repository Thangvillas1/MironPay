import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { circleClient } from '@/app/lib/circle'
import { getOnChainLimit } from '@/app/lib/spending-limit'
import { getGatewayAvailableBalance } from '@/app/lib/x402-buyer'
import { TOKEN_USD_PRICE } from '@/app/lib/types'
import { VERIFIED_SYMBOLS, TOKEN_LOGOS } from '@/app/lib/token-meta'
import { fetchSimplePrice } from '@/app/lib/coingecko'
import type { Address } from 'viem'

const MSG_COST = 0.01 // must match app/api/agent/chat/route.ts — this is what's actually charged per message

// Level caps — maximum a user CAN set, not a forced value
const LEVEL_CAPS: Record<string, number> = {
  Newcomer: 5,
  Builder: 10,
  Trader: 20,
  Elite: 50,
}

async function ensureAgentWallet(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('agent_wallet_id, agent_wallet_address')
    .eq('id', userId)
    .single()

  if (profile?.agent_wallet_id && profile?.agent_wallet_address) {
    return { agentWalletId: profile.agent_wallet_id, agentWalletAddress: profile.agent_wallet_address }
  }

  // Lazy creation — EOA, required for x402 nanopayments (ecrecover verify, no ERC-1271 support)
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID
  if (!walletSetId) throw new Error('CIRCLE_WALLET_SET_ID not configured')

  const res = await circleClient.createWallets({
    walletSetId,
    blockchains: ['ARC-TESTNET'],
    count: 1,
    accountType: 'EOA',
    idempotencyKey: crypto.randomUUID(),
  })

  const wallet = res.data?.wallets?.[0]
  if (!wallet?.address) throw new Error('Failed to create agent wallet')

  await supabase.from('profiles').update({
    agent_wallet_id: wallet.id,
    agent_wallet_address: wallet.address,
  }).eq('id', userId)

  return { agentWalletId: wallet.id, agentWalletAddress: wallet.address }
}

export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { agentWalletId, agentWalletAddress } = await ensureAgentWallet(supabase, user.id)

    // Fetch balance and spending data in parallel
    const [balanceRes, agentWalletRow, profileRow, onChainLimitRaw, gatewayResult, txRes] = await Promise.all([
      circleClient.getWalletTokenBalance({ id: agentWalletId }),
      supabase.from('agent_wallets').select('daily_limit, daily_spent, daily_reset_date').eq('user_id', user.id).single(),
      supabase.from('profiles').select('miron_level').eq('id', user.id).single(),
      getOnChainLimit(agentWalletAddress),
      // Gateway API is occasionally flaky on testnet — the reserve figure is
      // informational, so don't fail the whole wallet fetch if it errors. We do
      // keep whether it actually succeeded, so the UI can show a real
      // online/offline signal instead of just always showing $0 as if reserved
      // funds were genuinely zero.
      getGatewayAvailableBalance(agentWalletAddress as Address)
        .then(value => ({ value, online: true }))
        .catch(() => ({ value: 0, online: false })),
      // 50 (Circle's practical page-size ceiling) instead of 20 — the wallet
      // page reconstructs its 1M balance-history chart from this list.
      circleClient.listTransactions({ walletIds: [agentWalletId], pageSize: 50 }),
    ])
    const gatewayReserved = gatewayResult.value

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawBalances: any[] = balanceRes.data?.tokenBalances ?? []

    // Deduplicate by symbol (same pattern as /api/wallet) — Circle can return
    // multiple entries per token (native precompile + ERC20) which would double-count
    const symbolMap = new Map<string, { name: string; amount: number; tokenAddress: string | null }>()
    for (const b of rawBalances) {
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

    const usdcAmount = symbolMap.get('USDC')?.amount ?? 0
    const onChainBalance = usdcAmount

    const totalUsdValue = Array.from(symbolMap.entries()).reduce((sum, [symbol, info]) => {
      const price = TOKEN_USD_PRICE[symbol] ?? null
      return price !== null ? sum + info.amount * price : sum
    }, 0)

    // Same live-price + verified-badge treatment as Main Wallet's tokenList,
    // so the Wallet page can show identical per-wallet asset stats for both.
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
        if (tx.transactionType !== 'INBOUND' && parseFloat(tx.amounts?.[0] ?? '0') === 0) return false
        return true
      })
    const transactions = rawTxs.map((tx) => ({
      id: tx.id,
      type: (tx.transactionType === 'INBOUND' ? 'credit' : 'debit') as 'credit' | 'debit',
      amount: parseFloat(tx.amounts?.[0] ?? '0'),
      tokenSymbol: (tx.token?.symbol ?? 'USDC') as string,
      description: tx.transactionType === 'INBOUND' ? 'Received' : 'Sent',
      created_at: tx.createDate ?? new Date().toISOString(),
      state: tx.state,
      txHash: tx.txHash,
      blockchain: tx.blockchain,
      sourceAddress: tx.sourceAddress,
      destinationAddress: tx.destinationAddress,
      networkFee: tx.networkFee,
    }))

    const today = new Date().toISOString().slice(0, 10)
    const levelCap = LEVEL_CAPS[profileRow.data?.miron_level ?? 'Newcomer'] ?? 5

    // On-chain limit is source of truth; fall back to Supabase, then level cap
    const authoritative = onChainLimitRaw ?? agentWalletRow.data?.daily_limit ?? levelCap

    let agentWallet = agentWalletRow.data

    if (!agentWallet) {
      // First time — initialize with on-chain limit or level cap
      await supabase.from('agent_wallets').insert({ user_id: user.id, daily_limit: authoritative })
      agentWallet = { daily_limit: authoritative, daily_spent: 0, daily_reset_date: today }
    } else if (agentWallet.daily_reset_date !== today) {
      // New day — reset spent counter, sync limit from chain
      await supabase.from('agent_wallets').update({
        daily_spent: 0,
        daily_reset_date: today,
        daily_limit: authoritative,
      }).eq('user_id', user.id)
      agentWallet.daily_spent = 0
      agentWallet.daily_limit = authoritative
    } else if (onChainLimitRaw !== null && agentWallet.daily_limit !== onChainLimitRaw) {
      // Sync Supabase cache from chain if they diverged
      await supabase.from('agent_wallets').update({ daily_limit: onChainLimitRaw }).eq('user_id', user.id)
      agentWallet.daily_limit = onChainLimitRaw
    }

    return NextResponse.json({
      balance: onChainBalance,
      total_usd: totalUsdValue,
      wallet_address: agentWalletAddress,
      daily_limit: agentWallet.daily_limit,
      daily_spent: agentWallet.daily_spent,
      level_cap: levelCap,
      msg_cost: MSG_COST,
      gateway_reserved: gatewayReserved,
      gateway_online: gatewayResult.online,
      tokenList,
      transactions,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
