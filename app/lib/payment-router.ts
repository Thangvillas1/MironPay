import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  encodeAbiParameters,
  encodeFunctionData,
  getContractAddress,
  keccak256,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from 'viem'
import { circleClient } from '@/app/lib/circle'
import { arcPublicClient, USDC_TOKEN } from '@/app/lib/arc-chain'
import routerAbi from '@/app/lib/mironpay-router-abi.json'

// MironPaymentRouter on Arc Testnet — deployed 2026-11-11, block 71910573,
// source verified on explorer.testnet.arc.io. No owner; the only privileged
// role is the 0.1% fee recipient. Every order has its own CREATE2 deposit box
// whose address commits to all order terms, so payment status is read from
// the chain, never trusted from this backend.
export const PAYMENT_ROUTER_ADDRESS = (process.env.PAYMENT_ROUTER_ADDRESS
  || '0x5717F0965Bb12b7B05BD914D8C9530e80f8BeD1a') as Address

// keccak256(DepositBox creation code) for the deployed build (solc 0.8.28,
// optimizer 200, cancun). Confirmed against the live computeDepositAddress.
export const DEPOSIT_BOX_CODE_HASH: Hex = '0x1bc85e97b2c1d9c94a362038fd8c19334a0cda15488cb5d3d11c198501d5afd7'

export const ROUTER_PROVIDER = 'mironpay_router'
export const ROUTER_ORDER_WINDOW_SECONDS = 15 * 60
export const USDC_DECIMALS = 6

export const ROUTER_ABI = routerAbi as readonly unknown[]

export interface RouterOrder {
  orderId: Hex
  merchant: Address
  token: Address
  amount: bigint
  expiry: bigint
}

export type RouterChainStatus = 'none' | 'underpaid' | 'paid' | 'overpaid'

export interface RouterOrderView {
  status: RouterChainStatus
  credited: bigint
  pendingInBox: bigint
  excess: bigint
  late: boolean
  expired: boolean
  depositAddress: Address
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MerchantOrderRow = Record<string, any>

const ORDER_COMPONENTS = [
  { type: 'bytes32' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint64' },
] as const

export function isRouterOrder(row: MerchantOrderRow | null | undefined): boolean {
  return row?.payment_provider === ROUTER_PROVIDER && !!row.router_order_id
}

export function newRouterOrderId(): Hex {
  return toHex(crypto.getRandomValues(new Uint8Array(32)))
}

export function routerOrderFromRow(row: MerchantOrderRow): RouterOrder {
  return {
    orderId: row.router_order_id as Hex,
    merchant: row.merchant_address as Address,
    token: USDC_TOKEN,
    amount: BigInt(row.amount_units),
    expiry: BigInt(row.expiry_unix ?? 0),
  }
}

export function routerOrderTuple(o: RouterOrder) {
  return { orderId: o.orderId, merchant: o.merchant, token: o.token, amount: o.amount, expiry: o.expiry }
}

/** Same CREATE2 rule as MironPaymentRouter.computeDepositAddress, computed locally. */
/** keccak256(abi.encode(order)) — the router's orderKey and the CREATE2 salt. */
export function routerOrderKey(o: RouterOrder): Hex {
  return keccak256(encodeAbiParameters(ORDER_COMPONENTS, [o.orderId, o.merchant, o.token, o.amount, o.expiry]))
}

export function computeDepositAddress(o: RouterOrder): Address {
  const salt = routerOrderKey(o)
  return getContractAddress({ opcode: 'CREATE2', from: PAYMENT_ROUTER_ADDRESS, salt, bytecodeHash: DEPOSIT_BOX_CODE_HASH })
}

const STATUS_NAMES: RouterChainStatus[] = ['none', 'underpaid', 'paid', 'overpaid']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toView(raw: any): RouterOrderView {
  return {
    status: STATUS_NAMES[Number(raw.status)] ?? 'none',
    credited: BigInt(raw.credited),
    pendingInBox: BigInt(raw.pendingInBox),
    excess: BigInt(raw.excess),
    late: Boolean(raw.late),
    expired: Boolean(raw.expired),
    depositAddress: raw.depositAddress as Address,
  }
}

// Multicall3 is deployed on Arc Testnet at the standard address (checked
// with eth_getCode 2026-11-11).
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address

/**
 * Cumulative excess refunded per order, straight from the router's
 * `orders(orderKey)` storage (field 4, excessRefunded) — one multicall.
 */
export async function readRefundedTotals(orders: RouterOrder[]): Promise<bigint[]> {
  if (orders.length === 0) return []
  const results = await arcPublicClient().multicall({
    multicallAddress: MULTICALL3,
    allowFailure: false,
    contracts: orders.map((o) => ({
      address: PAYMENT_ROUTER_ADDRESS,
      abi: ROUTER_ABI as Abi,
      functionName: 'orders',
      args: [routerOrderKey(o)],
    })),
  })
  return (results as unknown as (readonly [bigint, bigint, bigint, bigint, bigint, boolean])[]).map((r) => r[3])
}

/** One eth_call for all orders (getOrderStatuses). */
export async function readRouterStatuses(orders: RouterOrder[]): Promise<RouterOrderView[]> {
  if (orders.length === 0) return []
  const raw = await arcPublicClient().readContract({
    address: PAYMENT_ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: 'getOrderStatuses',
    args: [orders.map(routerOrderTuple)],
  })
  return (raw as unknown[]).map(toView)
}

export function unitsToDecimal(units: bigint, decimals = USDC_DECIMALS): string {
  const base = BigInt(10) ** BigInt(decimals)
  const whole = units / base
  const frac = (units % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

/** Remaining credit a MironPay payer may still send through pay(). */
export function outstandingUnits(o: RouterOrder, v: RouterOrderView): bigint {
  const covered = v.credited + v.pendingInBox
  return covered >= o.amount ? BigInt(0) : o.amount - covered
}

/**
 * Cached DB status derived from the chain. Funds on chain always win over
 * the merchant's local "cancelled"/"expired" — the money really arrived.
 */
export function dbStatusFor(row: MerchantOrderRow, v: RouterOrderView): string {
  if (v.status === 'overpaid') return 'overpaid'
  if (v.status === 'paid') return 'paid'
  if (v.status === 'underpaid') return 'underpaid'
  if (row.status === 'cancelled') return 'cancelled'
  return v.expired ? 'expired' : 'pending'
}

/** Public, client-facing order terms + chain view (amounts as decimal strings). */
export function routerPayload(row: MerchantOrderRow, v?: RouterOrderView | null) {
  const o = routerOrderFromRow(row)
  return {
    router: PAYMENT_ROUTER_ADDRESS,
    orderId: o.orderId,
    merchant: o.merchant,
    token: o.token,
    amountUnits: o.amount.toString(),
    expiry: Number(o.expiry),
    depositAddress: row.deposit_address,
    chain: v
      ? {
          status: v.status,
          credited: unitsToDecimal(v.credited),
          pendingInBox: unitsToDecimal(v.pendingInBox),
          excess: unitsToDecimal(v.excess),
          outstanding: unitsToDecimal(outstandingUnits(o, v)),
          late: v.late,
          expired: v.expired,
        }
      : null,
    refunded: unitsToDecimal(BigInt(row.refunded_units ?? '0')),
  }
}

async function merchantCircleWalletId(admin: SupabaseClient, row: MerchantOrderRow): Promise<string | null> {
  const { data } = await admin
    .from('profiles')
    .select('circle_wallet_id, wallet_address')
    .eq('id', row.merchant_user_id)
    .maybeSingle()
  if (!data?.circle_wallet_id || !data.wallet_address) return null
  // The order binds a merchant address; only sign from that exact wallet.
  if (data.wallet_address.toLowerCase() !== String(row.merchant_address).toLowerCase()) return null
  return data.circle_wallet_id
}

const SETTLE_THROTTLE_MS = 30_000

/**
 * Sends settle(order) from the merchant's own Circle wallet (the merchant pays
 * the gas). Throttled per order so polling clients can't queue duplicate
 * settles; a duplicate would just revert ZeroBalance on chain anyway.
 * Returns the Circle transaction id, or null if throttled/not possible.
 */
export async function requestSettle(admin: SupabaseClient, row: MerchantOrderRow): Promise<string | null> {
  const cutoff = new Date(Date.now() - SETTLE_THROTTLE_MS).toISOString()
  const { data: claimed } = await admin
    .from('merchant_orders')
    .update({ settle_requested_at: new Date().toISOString() })
    .eq('id', row.id)
    .or(`settle_requested_at.is.null,settle_requested_at.lt.${cutoff}`)
    .select('id')
    .maybeSingle()
  if (!claimed) return null

  const walletId = await merchantCircleWalletId(admin, row)
  if (!walletId) return null

  const tx = await circleClient.createContractExecutionTransaction({
    walletId,
    contractAddress: PAYMENT_ROUTER_ADDRESS,
    callData: encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: 'settle',
      args: [routerOrderTuple(routerOrderFromRow(row))],
    }),
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: crypto.randomUUID(),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txId = (tx.data as any)?.id ?? null
  if (txId) await admin.from('merchant_orders').update({ settle_tx_id: txId }).eq('id', row.id)
  return txId
}

/**
 * Auto-settle (merchant-paid gas) only when it moves real credit: the box now
 * covers the order, or the order expired with unsettled credit. Underpaid
 * drips wait for the top-up, and excess-only funds wait for the merchant's
 * refund decision, so nobody can make a merchant burn gas with dust.
 */
export function shouldAutoSettle(amount: bigint, v: RouterOrderView): boolean {
  if (v.pendingInBox === BigInt(0) || v.credited >= amount) return false
  return v.credited + v.pendingInBox >= amount || v.expired
}

/**
 * Refreshes router orders from one getOrderStatuses call, persists changes to
 * the cache columns, and kicks off settle for any order whose box holds new
 * funds. A chain/RPC failure returns the rows unchanged — the cache is only a
 * fallback and must never turn a list into an error.
 */
export async function syncRouterOrders(
  admin: SupabaseClient,
  rows: MerchantOrderRow[],
  opts: { autoSettle?: boolean } = {},
): Promise<{ rows: MerchantOrderRow[]; views: Map<string, RouterOrderView> }> {
  const views = new Map<string, RouterOrderView>()
  const routerRows = rows.filter(isRouterOrder)
  if (routerRows.length === 0) return { rows, views }

  let read: RouterOrderView[]
  try {
    read = await readRouterStatuses(routerRows.map(routerOrderFromRow))
  } catch (error) {
    console.error('[payment-router] getOrderStatuses failed:', error)
    return { rows, views }
  }

  // Refunded totals only matter for orders that ever held excess (plus a
  // one-time backfill of rows never checked: refunded_units is null); a failed
  // read keeps the cached value rather than blanking it.
  const refundCandidates = routerRows
    .map((row, i) => ({ row, i }))
    .filter(({ row, i }) => row.refunded_units == null || read[i].excess > BigInt(0) || (row.excess_units && row.excess_units !== '0') || row.status === 'overpaid')
  const refundedBy = new Map<string, bigint>()
  try {
    const totals = await readRefundedTotals(refundCandidates.map(({ row }) => routerOrderFromRow(row)))
    refundCandidates.forEach(({ row }, k) => refundedBy.set(row.id, totals[k]))
  } catch (error) {
    console.error('[payment-router] refunded totals read failed:', error)
  }

  const updated = new Map<string, MerchantOrderRow>()
  await Promise.all(routerRows.map(async (row, i) => {
    const v = read[i]
    views.set(row.id, v)
    const status = dbStatusFor(row, v)
    const amount = BigInt(row.amount_units)
    const projected = v.pendingInBox < amount - v.credited ? v.pendingInBox : amount - v.credited
    const credited = v.credited + projected
    const patch: Record<string, unknown> = {
      status,
      credited_units: v.credited.toString(),
      pending_units: v.pendingInBox.toString(),
      excess_units: v.excess.toString(),
      is_late: v.late,
      paid_amount: unitsToDecimal(credited),
      chain_synced_at: new Date().toISOString(),
    }
    const refunded = refundedBy.get(row.id)
    if (refunded != null) patch.refunded_units = refunded.toString()
    if ((status === 'paid' || status === 'overpaid') && !row.paid_at) patch.paid_at = new Date().toISOString()
    const changed = status !== row.status
      || patch.credited_units !== row.credited_units
      || patch.pending_units !== row.pending_units
      || patch.excess_units !== row.excess_units
      || v.late !== row.is_late
      || (patch.refunded_units != null && patch.refunded_units !== row.refunded_units)
    if (changed) {
      const { data } = await admin.from('merchant_orders').update(patch).eq('id', row.id).select().single()
      if (data) updated.set(row.id, data)
    }
    if (opts.autoSettle !== false && shouldAutoSettle(amount, v)) {
      await requestSettle(admin, row).catch((error) => console.error('[payment-router] settle failed:', error))
    }
  }))

  return { rows: rows.map((r) => updated.get(r.id) ?? r), views }
}

/** pay() value: Circle takes the native amount as a decimal string (USDC). */
export function payCallData(o: RouterOrder): Hex {
  return encodeFunctionData({ abi: ROUTER_ABI, functionName: 'pay', args: [routerOrderTuple(o)] })
}

export function refundCallData(o: RouterOrder, to: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: ROUTER_ABI, functionName: 'refundExcess', args: [routerOrderTuple(o), to, amount] })
}
