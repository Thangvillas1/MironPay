import { NextRequest, NextResponse } from 'next/server'
import { x402ResourceServer } from '@x402/core/server'
import { x402HTTPResourceServer } from '@x402/core/http'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { BatchFacilitatorClient } from '@circle-fin/x402-batching/server'
import { ARC_TESTNET_NETWORK } from './x402-buyer'

const GATEWAY_WALLET = '0x0077777d7eba4688bdef3e311b846f25870a19b9'
const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000'
const TREASURY_ADDRESS = process.env.AGENT_OWNER_ADDRESS!

/**
 * Factory for a Next.js GET route handler protected by x402 (Circle Gateway
 * batching, ARC Testnet). Settlement only happens after fetchData() succeeds,
 * so a failed lookup never charges the buyer.
 */
export function createX402GetHandler<T>(opts: {
  path: string
  description: string
  feeAtomicUsdc: string // e.g. '10000' for $0.01 (6 decimals)
  fetchData: (request: NextRequest) => Promise<T>
}) {
  const facilitator = new BatchFacilitatorClient({ url: 'https://gateway-api-testnet.circle.com' })
  // Dual esm/cjs @x402/core type hazard — see app/lib/x402-buyer.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resourceServer = new x402ResourceServer([facilitator as any])
  resourceServer.register(ARC_TESTNET_NETWORK, new ExactEvmScheme() as unknown as Parameters<typeof resourceServer.register>[1])

  const httpServer = new x402HTTPResourceServer(resourceServer, {
    [opts.path]: {
      accepts: {
        scheme: 'exact',
        network: ARC_TESTNET_NETWORK,
        payTo: TREASURY_ADDRESS,
        price: { asset: ARC_TESTNET_USDC, amount: opts.feeAtomicUsdc },
        extra: { name: 'GatewayWalletBatched', version: '1', verifyingContract: GATEWAY_WALLET },
      },
      description: opts.description,
    },
  })

  let initialized = false
  async function ensureInitialized() {
    if (!initialized) {
      await httpServer.initialize()
      initialized = true
    }
  }

  function toAdapter(request: NextRequest) {
    return {
      getHeader: (name: string) => request.headers.get(name) ?? undefined,
      getMethod: () => request.method,
      getPath: () => new URL(request.url).pathname,
      getUrl: () => request.url,
      getAcceptHeader: () => request.headers.get('accept') ?? '',
      getUserAgent: () => request.headers.get('user-agent') ?? '',
      getBody: () => undefined,
    }
  }

  return async function GET(request: NextRequest) {
    await ensureInitialized()

    const adapter = toAdapter(request)
    const context = { adapter, path: opts.path, method: 'GET' }
    const result = await httpServer.processHTTPRequest(context)

    if (result.type === 'payment-error') {
      return NextResponse.json(result.response.body ?? {}, {
        status: result.response.status,
        headers: result.response.headers,
      })
    }
    if (result.type === 'no-payment-required') {
      return NextResponse.json({ error: 'Payment configuration missing' }, { status: 500 })
    }

    let data: T
    try {
      data = await opts.fetchData(request)
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Data fetch failed' }, { status: 502 })
    }

    const settlement = await httpServer.processSettlement(
      result.paymentPayload,
      result.paymentRequirements,
      result.declaredExtensions,
    )
    if (!settlement.success) {
      return NextResponse.json(settlement.response.body ?? { error: settlement.errorReason }, {
        status: settlement.response.status,
        headers: settlement.response.headers,
      })
    }

    return NextResponse.json(data, { headers: settlement.headers })
  }
}
