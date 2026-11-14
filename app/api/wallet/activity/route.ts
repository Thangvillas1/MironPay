import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { ARC_TESTNET_TOKENS } from '@/app/lib/arc-token-registry'
import { arcPublicClient } from '@/app/lib/arc-chain'
import { PAYMENT_ROUTER_ADDRESS } from '@/app/lib/payment-router'
import { decodeEventLog, getAddress, isAddress, parseAbiItem, type Hash } from 'viem'

const PAID_EVENT = parseAbiItem('event Paid(bytes32 indexed orderKey, bytes32 indexed orderId, address indexed payer, uint256 units)')
import {
  decodeCursor,
  encodeCursor,
  getAddressTransactions,
  getTokenTransfers,
  unitsToDecimal,
  type ExplorerTokenTransfer,
} from '@/app/lib/arc-explorer'

/**
 * Paginated wallet activity built from the chain (Arc explorer), not from
 * Circle's 50-row listTransactions:
 *  - only verified registry tokens; zero-value / scam-flagged transfers are
 *    dropped (address-poisoning spam never reaches the feed)
 *  - real counterparty address + MironPay @username / merchant store name /
 *    explorer contract name when known
 *  - real network fee in USDC (gas_used × gas_price, 18 dp) for sends
 *  - a swap (registry token out + in within one tx) is one row
 *  - Swap / Bridge / Payroll labels and memos from our own tables
 *
 * Items keep the shape of /api/wallet `transactions` (plus extra fields) so
 * existing clients keep working.
 *
 * GET /api/wallet/activity?cursor=<opaque>  →  { items, nextCursor }
 */

const REGISTRY = new Map(ARC_TESTNET_TOKENS.map((t) => [t.address, t]))

// Explorer contract names like "ERC1967Proxy" / "TransparentUpgradeableProxy"
// describe the proxy pattern, not the counterparty — don't show them.
function displayContractName(name: string | null): string | null {
  if (!name) return null
  return /proxy/i.test(name) ? null : name
}

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const wallet = await resolveCircleWalletId(supabase, user.id)
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
  const me = wallet.walletAddress.toLowerCase()

  const cursor = decodeCursor(request.nextUrl.searchParams.get('cursor'))

  let transfersPage: Awaited<ReturnType<typeof getTokenTransfers>>
  let txPage: Awaited<ReturnType<typeof getAddressTransactions>> | null = null
  try {
    ;[transfersPage, txPage] = await Promise.all([
      getTokenTransfers(wallet.walletAddress, cursor),
      // Fees/status for transactions this wallet sent. One page is enough
      // for the first activity page; later pages fall back to fee: null.
      cursor ? Promise.resolve(null) : getAddressTransactions(wallet.walletAddress).catch(() => null),
    ])
  } catch (error) {
    console.error('[wallet/activity] explorer failed:', error)
    return NextResponse.json({ error: 'Activity is temporarily unavailable' }, { status: 502 })
  }

  // 1. Keep only verified registry tokens, non-zero, not scam-flagged, and
  //    actually involving this wallet.
  const transfers = transfersPage.items.filter((t) => {
    const reg = REGISTRY.get(t.token.address_hash.toLowerCase())
    if (!reg) return false
    if (!/^\d+$/.test(t.total.value) || t.total.value === '0') return false
    if (t.from.is_scam || t.to.is_scam) return false
    const from = t.from.hash.toLowerCase()
    const to = t.to.hash.toLowerCase()
    return from === me || to === me
  })

  // 2. Group by tx hash (a swap is one out-leg + one in-leg in the same tx).
  const byTx = new Map<string, ExplorerTokenTransfer[]>()
  for (const t of transfers) {
    const list = byTx.get(t.transaction_hash) ?? []
    list.push(t)
    byTx.set(t.transaction_hash, list)
  }
  const hashes = Array.from(byTx.keys())

  // 3. Our own metadata: kinds (swap/bridge/payroll), memos, merchant orders,
  //    and counterparty @usernames.
  const counterparties = new Set<string>()
  for (const t of transfers) {
    counterparties.add(t.from.hash.toLowerCase() === me ? t.to.hash : t.from.hash)
  }
  const admin = createAdminSupabaseClient()
  const [kindsRes, memosRes, ordersRes, profilesRes] = hashes.length
    ? await Promise.all([
        supabase.from('transaction_kinds').select('tx_hash, kind').in('tx_hash', hashes),
        supabase.from('transaction_memos').select('tx_hash, memo').in('tx_hash', hashes),
        admin.from('merchant_orders').select('id, tx_hash, merchant_user_id').in('tx_hash', hashes),
        admin.from('profiles').select('username, wallet_address').in(
          'wallet_address',
          Array.from(counterparties).flatMap((a) => [a, a.toLowerCase()]),
        ),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const kindMap = new Map<string, string>((kindsRes.data ?? []).map((k: { tx_hash: string; kind: string }) => [k.tx_hash, k.kind]))
  const memoMap = new Map<string, string>((memosRes.data ?? []).map((m: { tx_hash: string; memo: string }) => [m.tx_hash, m.memo]))
  const usernameByAddr = new Map<string, string>()
  for (const p of (profilesRes.data ?? []) as { username: string | null; wallet_address: string | null }[]) {
    if (p.username && p.wallet_address) usernameByAddr.set(p.wallet_address.toLowerCase(), p.username)
  }
  const orders = (ordersRes.data ?? []) as { id: string; tx_hash: string; merchant_user_id: string }[]

  // On-chain Store orders (MironPaymentRouter). Their transfers never carry
  // an order tx_hash, so recognise them from the chain itself:
  //  - money coming from an order's deposit box: the merchant's sale, or an
  //    overpayment refund (anyone else receiving from that box);
  //  - a pay() from this wallet: the router forwards it, and the tx's Paid
  //    event names the order.
  type RouterOrderRef = { id: string; merchant_user_id: string; deposit_address: string; router_order_id: string }
  const router = PAYMENT_ROUTER_ADDRESS.toLowerCase()
  const boxCandidates = Array.from(counterparties).filter((a) => a.toLowerCase() !== router && isAddress(a))
  const routerOrders: RouterOrderRef[] = []
  if (boxCandidates.length) {
    const forms = Array.from(new Set(boxCandidates.flatMap((a) => [a, a.toLowerCase(), getAddress(a)])))
    const { data } = await admin
      .from('merchant_orders')
      .select('id, merchant_user_id, deposit_address, router_order_id')
      .in('deposit_address', forms)
    routerOrders.push(...((data ?? []) as RouterOrderRef[]))
  }
  const routerOrderByBox = new Map(routerOrders.map((o) => [o.deposit_address.toLowerCase(), o]))
  const payTxs = hashes.filter((h) => byTx.get(h)!.some((t) => t.from.hash.toLowerCase() === me && t.to.hash.toLowerCase() === router))
  const paidOrderIdByTx = new Map<string, string>()
  await Promise.all(payTxs.map(async (h) => {
    try {
      const receipt = await arcPublicClient().getTransactionReceipt({ hash: h as Hash })
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== router) continue
        try {
          const ev = decodeEventLog({ abi: [PAID_EVENT], data: log.data, topics: log.topics })
          paidOrderIdByTx.set(h, String(ev.args.orderId).toLowerCase())
        } catch { /* not a Paid log */ }
      }
    } catch (error) {
      console.error('[activity] receipt read failed:', error)
    }
  }))
  if (paidOrderIdByTx.size) {
    const { data } = await admin
      .from('merchant_orders')
      .select('id, merchant_user_id, deposit_address, router_order_id')
      .in('router_order_id', Array.from(new Set(paidOrderIdByTx.values())))
    routerOrders.push(...((data ?? []) as RouterOrderRef[]))
  }
  const routerOrderById = new Map(routerOrders.map((o) => [o.router_order_id, o]))

  const storeByUser = new Map<string, string>()
  const storeUsers = new Set([...orders.map((o) => o.merchant_user_id), ...routerOrders.map((o) => o.merchant_user_id)])
  if (storeUsers.size) {
    const { data: stores } = await admin
      .from('merchant_profiles')
      .select('user_id, store_name')
      .in('user_id', Array.from(storeUsers))
    for (const s of (stores ?? []) as { user_id: string; store_name: string }[]) storeByUser.set(s.user_id, s.store_name)
  }
  const orderByTx = new Map(orders.map((o) => [o.tx_hash, { id: o.id, store: storeByUser.get(o.merchant_user_id) ?? null, merchantUserId: o.merchant_user_id }]))

  const feeByTx = new Map<string, { feeUsdc: string; status: string | null }>()
  for (const tx of txPage?.items ?? []) {
    if (tx.fee?.value && /^\d+$/.test(tx.fee.value)) {
      feeByTx.set(tx.hash, { feeUsdc: unitsToDecimal(tx.fee.value, 18), status: tx.status })
    }
  }

  // 4. Build feed items (newest first, as the explorer returns them).
  const items = hashes.map((hash) => {
    const legs = byTx.get(hash)!
    const outs = legs.filter((t) => t.from.hash.toLowerCase() === me)
    const ins = legs.filter((t) => t.to.hash.toLowerCase() === me)
    const head = legs[0]
    const kindTag = kindMap.get(hash) ?? null
    const order = orderByTx.get(hash) ?? null
    const fee = feeByTx.get(hash) ?? null

    const leg = (t: ExplorerTokenTransfer) => {
      const reg = REGISTRY.get(t.token.address_hash.toLowerCase())!
      return { symbol: reg.symbol, tokenAddress: reg.address, decimals: reg.decimals, amount: unitsToDecimal(t.total.value, reg.decimals) }
    }

    const isSwap = kindTag === 'swap' || (outs.length > 0 && ins.length > 0)
    const primary = isSwap ? outs[0] ?? head : outs[0] ?? ins[0] ?? head
    const direction: 'credit' | 'debit' = isSwap ? 'debit' : outs.length > 0 ? 'debit' : 'credit'
    const counterpartyRef = direction === 'debit' ? primary.to : primary.from
    const counterpartyAddress = counterpartyRef.hash
    const username = usernameByAddr.get(counterpartyAddress.toLowerCase()) ?? null
    const isMerchantSide = order ? order.merchantUserId === user.id : false
    // Router order this transfer belongs to (box → me, or my pay() → router).
    const routerOrder = direction === 'credit'
      ? routerOrderByBox.get(counterpartyRef.hash.toLowerCase()) ?? null
      : paidOrderIdByTx.has(hash) ? routerOrderById.get(paidOrderIdByTx.get(hash)!) ?? null : null
    const routerStore = routerOrder ? storeByUser.get(routerOrder.merchant_user_id) ?? null : null
    const routerShort = routerOrder ? `#${routerOrder.id.slice(0, 8).toUpperCase()}` : null
    const counterpartyName =
      (order && !isMerchantSide && order.store) ||
      (routerOrder && routerStore) ||
      (username ? `@${username}` : null) ||
      displayContractName(counterpartyRef.name) ||
      null

    let kind: 'send' | 'receive' | 'swap' | 'bridge' | 'payroll' | 'payment' | 'sale' | 'refund' = direction === 'debit' ? 'send' : 'receive'
    if (isSwap) kind = 'swap'
    else if (kindTag === 'bridge_out' || kindTag === 'bridge_in') kind = 'bridge'
    else if (kindTag === 'payroll_claim') kind = 'payroll'
    else if (order) kind = isMerchantSide ? 'sale' : 'payment'
    else if (routerOrder) {
      if (direction === 'debit') kind = 'payment'
      else kind = routerOrder.merchant_user_id === user.id ? 'sale' : 'refund'
    }

    const main = leg(primary)
    const swapIn = isSwap ? ins[0] : undefined
    const who = counterpartyName ?? short(counterpartyAddress)
    const description =
      kind === 'swap' ? (swapIn ? `Swap ${main.symbol} → ${leg(swapIn).symbol}` : 'Swap')
      : kind === 'bridge' ? 'Bridge'
      : kind === 'payroll' ? 'Payroll'
      : kind === 'payment' ? `Paid ${who}${routerShort ? ` · ${routerShort}` : ''}`
      : kind === 'sale' ? `Sale · Order ${routerShort ?? `#${order!.id.slice(0, 8).toUpperCase()}`}`
      : kind === 'refund' ? `Refund from ${who}${routerShort ? ` · ${routerShort}` : ''}`
      : direction === 'credit' ? `Received from ${who}` : `Sent to ${who}`

    return {
      // --- /api/wallet `transactions` compatible fields ---
      id: hash,
      type: direction,
      amount: Number(main.amount),
      tokenSymbol: main.symbol,
      description,
      created_at: head.timestamp,
      state: fee?.status === 'error' ? 'FAILED' : 'COMPLETE',
      txHash: hash,
      blockchain: 'ARC-TESTNET',
      sourceAddress: primary.from.hash,
      destinationAddress: primary.to.hash,
      networkFee: direction === 'debit' ? fee?.feeUsdc ?? null : null,
      memo: memoMap.get(hash),
      // --- new fields ---
      kind,
      amountStr: main.amount,
      decimals: main.decimals,
      tokenAddress: main.tokenAddress,
      counterpartyAddress,
      counterpartyName,
      counterpartyUsername: username,
      feeToken: 'USDC',
      swap: swapIn ? { from: main, to: leg(swapIn) } : null,
      blockNumber: head.block_number,
    }
  })

  return NextResponse.json(
    { items, nextCursor: encodeCursor(transfersPage.next_page_params) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
