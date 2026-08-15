import 'server-only'

export const CIRCLE_MANAGED_PROVIDER = 'circle_managed_payments' as const

type Money = { amount: string; currency: string }
type PaymentMethod = { type: string; chain?: string; address?: string }
type TimelineEntry = { status: string; context?: string; time?: string }

export type CirclePaymentIntent = {
  id: string
  amount?: Money
  amountPaid?: Money
  paymentMethods?: PaymentMethod[]
  paymentIds?: string[]
  timeline?: TimelineEntry[]
  expiresOn?: string
}

export function circleManagedPaymentsEnabled() {
  return process.env.CIRCLE_MANAGED_PAYMENTS_ENABLED === 'true'
}

function config() {
  const apiKey = process.env.CIRCLE_MANAGED_PAYMENTS_API_KEY
  const merchantWalletId = process.env.CIRCLE_MANAGED_PAYMENTS_MERCHANT_WALLET_ID
  if (!apiKey || !merchantWalletId) {
    throw new Error('Circle Managed Payments credentials are not configured')
  }
  return {
    apiKey,
    merchantWalletId,
    baseUrl: (process.env.CIRCLE_MANAGED_PAYMENTS_BASE_URL ?? 'https://api-sandbox.circle.com').replace(/\/$/, ''),
    paymentIntentsPath: process.env.CIRCLE_MANAGED_PAYMENTS_INTENTS_PATH ?? '/v1/paymentIntents',
    chain: process.env.CIRCLE_MANAGED_PAYMENTS_CHAIN ?? 'ARC',
  }
}

async function circleRequest<T>(path: string, init: RequestInit): Promise<T> {
  const { apiKey, baseUrl } = config()
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body?.message ?? body?.error?.message ?? `Circle API returned ${response.status}`
    throw new Error(message)
  }
  return body.data as T
}

export async function createTransientPaymentIntent(input: {
  idempotencyKey: string
  amount: string
  expiresOn: string
  customerExternalRef: string
  merchantWalletId?: string | null
}) {
  const cfg = config()
  return circleRequest<CirclePaymentIntent>(cfg.paymentIntentsPath, {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: input.idempotencyKey,
      type: 'transient',
      amount: { amount: input.amount, currency: 'USD' },
      settlementCurrency: 'USD',
      paymentMethods: [{ type: 'blockchain', chain: cfg.chain }],
      merchantWalletId: input.merchantWalletId ?? cfg.merchantWalletId,
      expiresOn: input.expiresOn,
      purposeOfTransfer: process.env.CIRCLE_MANAGED_PAYMENTS_PURPOSE ?? 'PMT001',
      metadata: { customerExternalRef: input.customerExternalRef },
    }),
  })
}

export async function getPaymentIntent(id: string) {
  const cfg = config()
  return circleRequest<CirclePaymentIntent>(`${cfg.paymentIntentsPath}/${encodeURIComponent(id)}`, { method: 'GET' })
}

export async function expirePaymentIntent(id: string, idempotencyKey: string) {
  const cfg = config()
  return circleRequest<CirclePaymentIntent>(`${cfg.paymentIntentsPath}/${encodeURIComponent(id)}/expire`, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey }),
  })
}

export function paymentIntentSnapshot(intent: CirclePaymentIntent) {
  const method = intent.paymentMethods?.find((item) => item.type === 'blockchain')
  return {
    providerStatus: intent.timeline?.[0]?.status ?? 'created',
    providerContext: intent.timeline?.[0]?.context ?? null,
    depositAddress: method?.address ?? null,
    chain: method?.chain ?? null,
    amountPaid: intent.amountPaid?.amount ?? null,
  }
}

export function publicOrder<T extends Record<string, unknown>>(order: T) {
  const safe: Record<string, unknown> = { ...order }
  delete safe.provider_idempotency_key
  delete safe.provider_error
  return {
    ...safe,
    paymentAddress: order.provider_deposit_address ?? null,
    paymentChain: order.provider_chain ?? null,
    paymentProvider: order.payment_provider ?? 'legacy',
  }
}
