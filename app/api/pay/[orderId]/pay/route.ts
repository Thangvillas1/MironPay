import { NextRequest, NextResponse } from 'next/server'
import { parseUnits } from 'viem'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { circleClient } from '@/app/lib/circle'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { pinFailureHttp, verifyPin } from '@/app/lib/pin'
import { arcPublicClient } from '@/app/lib/arc-chain'
import {
  PAYMENT_ROUTER_ADDRESS,
  computeDepositAddress,
  isRouterOrder,
  outstandingUnits,
  payCallData,
  readRouterStatuses,
  routerOrderFromRow,
  unitsToDecimal,
} from '@/app/lib/payment-router'

// Leave time for Circle to submit and the chain to mine before pay() would
// revert OrderExpired.
const MIN_SECONDS_LEFT = 20

// POST { depositAddress, pin } — pay a Store order from the payer's MironPay
// wallet through MironPaymentRouter.pay(). The amount is never taken from the
// client: it is the order's remaining balance read from the chain, and pay()
// itself reverts on any overpayment, so a double scan can't double charge.
// `depositAddress` is the address the payer's app recomputed from the order
// terms and showed in the review; it must match, so the backend can't swap
// the order behind the payer's back.
export async function POST(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const admin = createAdminSupabaseClient()
  const { data: order } = await admin.from('merchant_orders').select('*').eq('id', orderId).maybeSingle()
  if (!order || !isRouterOrder(order)) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status === 'cancelled') return NextResponse.json({ error: 'The store cancelled this order', code: 'CANCELLED' }, { status: 400 })

  const o = routerOrderFromRow(order)
  const depositAddress = computeDepositAddress(o)
  if (typeof body.depositAddress !== 'string' || body.depositAddress.toLowerCase() !== depositAddress.toLowerCase()) {
    return NextResponse.json({ error: 'Order details do not match the QR code', code: 'ORDER_MISMATCH' }, { status: 409 })
  }
  if (Number(o.expiry) - Math.floor(Date.now() / 1000) < MIN_SECONDS_LEFT) {
    return NextResponse.json({ error: 'This QR code has expired. Ask the store for a new one.', code: 'EXPIRED' }, { status: 400 })
  }

  const wallet = await resolveCircleWalletId(supabase, user.id)
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

  const pinResult = await verifyPin(supabase, user.id, body.pin)
  if (!pinResult.ok) {
    return NextResponse.json({ error: pinResult.error, code: pinResult.code }, pinFailureHttp(pinResult))
  }

  const [view] = await readRouterStatuses([o])
  const due = outstandingUnits(o, view)
  if (due === BigInt(0)) {
    return NextResponse.json({ error: 'This order has already been paid', code: 'ALREADY_PAID' }, { status: 409 })
  }

  // Native balance (18 dp) must cover the payment plus gas headroom.
  const balance = await arcPublicClient().getBalance({ address: wallet.walletAddress as `0x${string}` })
  const valueWei = due * BigInt(10) ** BigInt(12)
  if (balance < valueWei + parseUnits('0.01', 18)) {
    return NextResponse.json({ error: 'Insufficient USDC balance (including network fee)', code: 'INSUFFICIENT_BALANCE' }, { status: 400 })
  }

  const amount = unitsToDecimal(due)
  const tx = await circleClient.createContractExecutionTransaction({
    walletId: wallet.circleWalletId,
    contractAddress: PAYMENT_ROUTER_ADDRESS,
    callData: payCallData(o),
    amount,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: crypto.randomUUID(),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txId = (tx.data as any)?.id ?? null
  let txHash: string | null = null
  if (txId) {
    try {
      const sent = await circleClient.getTransaction({ id: txId, waitForState: 'SENT', pollingInterval: 1500 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      txHash = (sent.data as any)?.transaction?.txHash ?? null
    } catch {
      // Timed out waiting for the hash; the app keeps polling the order.
    }
  }

  if (txHash) {
    const { error: kindErr } = await supabase.from('transaction_kinds').insert({
      tx_hash: txHash,
      kind: 'store_payment',
      wallet_address: wallet.walletAddress,
      amount,
      token: 'USDC',
    })
    if (kindErr) console.error('[pay] transaction kind insert failed:', kindErr)
  }

  return NextResponse.json({ transactionId: txId, txHash, amount, depositAddress })
}
