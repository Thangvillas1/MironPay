import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets'
import { SwapKit, Blockchain, getErrorMessage, getErrorCode } from '@circle-fin/swap-kit'

// Single adapter/kit instance reused across requests — createCircleWalletsAdapter
// caches auth internally, no need to recreate it per call.
export const circleSwapAdapter = createCircleWalletsAdapter({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
})

export const swapKit = new SwapKit()

export const ARC_TESTNET = Blockchain.Arc_Testnet

// No-route-available is Circle's error code 331001 (same code the old raw
// REST implementation checked for) — not transient, retrying the exact same
// quote won't help, only a fresh quote after a short wait might.
export function isNoRouteError(err: unknown): boolean {
  return getErrorCode(err) === 331001
}

export function swapKitErrorMessage(err: unknown): string {
  return getErrorMessage(err)
}
