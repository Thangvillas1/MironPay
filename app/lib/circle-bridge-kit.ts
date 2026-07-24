import { BridgeKit, getErrorMessage, getErrorCode } from '@circle-fin/bridge-kit'
import { CCTPV2BridgingProvider } from '@circle-fin/provider-cctp-v2'
import { createViemAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2'
import { privateKeyToAccount } from 'viem/accounts'
import { circleSwapAdapter } from '@/app/lib/circle-swap-kit'

// Reuse the Circle Wallets adapter already used for same-chain swap — it's
// developer-controlled (signs via Circle API, no private key on our server)
// and works unmodified with BridgeKit (adapter-circle-wallets lists
// "bridge-kit" as a supported consumer).
export { circleSwapAdapter as circleBridgeAdapter }

// Plain string chain identifiers (not the imported chain-definition objects)
// on purpose: bridge-kit, provider-cctp-v2 and adapter-circle-wallets each
// bundle their own copy of the underlying `@core/chains` types, so a chain
// object built from one package's types doesn't nominally match another
// package's `ChainDefinition` even though the runtime shape is identical.
// String literals resolve structurally against each package's own
// `` `${Blockchain}` `` union instead, sidestepping that mismatch.
export const ARC_TESTNET = 'Arc_Testnet' as const

// One backend-held EOA, funded via testnet faucet, reused across every EVM
// destination chain we support. It never touches user funds — CCTPv2's mint
// step is permissionless, so any funded address can submit it and the minted
// USDC still lands on the `mintRecipient`/`recipientAddress` we specify.
//
// Private-key adapters are hard-restricted by the SDK to `user-controlled`
// mode (it throws "Private key adapters cannot use 'developer-controlled'
// address context" — the QUICKSTART's own "Developer-Controlled Setup"
// example for `createViemAdapterFromPrivateKey` doesn't actually work at
// runtime). That means we can never pass an explicit `address` when using
// this adapter — it always resolves to the relayer's own address, which is
// exactly what we want anyway: for a withdrawal mint, the relayer IS the one
// signing/paying gas. For a deposit burn preparation, the address used to
// build the call is irrelevant to the resulting calldata (depositForBurn's
// ABI-encoded bytes don't embed a sender — msg.sender is implicit at
// broadcast time), so preparing "as" the relayer still yields calldata the
// real user's own wallet can sign and submit.
//
// Lazily constructed (not a module-level const): Next.js's build-time "collect
// page data" step imports every route module, so an eager
// `process.env.BRIDGE_RELAYER_PRIVATE_KEY!` here would throw during `next
// build` on any environment where the var isn't set yet (it did — this broke
// the first deploy) instead of only failing at request time on the routes
// that actually need it.
type RelayerAdapter = ReturnType<typeof createViemAdapterFromPrivateKey>
let _relayerAdapter: RelayerAdapter | null = null
export function getRelayerAdapter() {
  if (!_relayerAdapter) {
    if (!process.env.BRIDGE_RELAYER_PRIVATE_KEY) {
      throw new Error('BRIDGE_RELAYER_PRIVATE_KEY is not configured')
    }
    _relayerAdapter = createViemAdapterFromPrivateKey({
      privateKey: process.env.BRIDGE_RELAYER_PRIVATE_KEY as `0x${string}`,
    })
  }
  return _relayerAdapter
}

// Informational only (e.g. for logging) — not passed into any WalletContext,
// since user-controlled adapters forbid an explicit `address` field.
let _relayerAddress: `0x${string}` | null = null
export function getRelayerAddress() {
  if (!_relayerAddress) {
    if (!process.env.BRIDGE_RELAYER_PRIVATE_KEY) {
      throw new Error('BRIDGE_RELAYER_PRIVATE_KEY is not configured')
    }
    _relayerAddress = privateKeyToAccount(process.env.BRIDGE_RELAYER_PRIVATE_KEY as `0x${string}`).address
  }
  return _relayerAddress
}

export const bridgeKit = new BridgeKit()
export const cctpProvider = new CCTPV2BridgingProvider()

// Slug -> chain identifier, for validating API input. Ethereum Sepolia and
// Base Sepolia only for this first pass (both EVM, one relayer key covers
// both) — Solana Devnet deferred, needs a separate adapter + keypair.
export const SUPPORTED_EXTERNAL_CHAINS = {
  ethereum_sepolia: 'Ethereum_Sepolia',
  base_sepolia: 'Base_Sepolia',
} as const

export type ExternalChainSlug = keyof typeof SUPPORTED_EXTERNAL_CHAINS

export function resolveExternalChain(slug: string): string | null {
  return SUPPORTED_EXTERNAL_CHAINS[slug.toLowerCase() as ExternalChainSlug] ?? null
}

export function isNoRouteError(err: unknown): boolean {
  return getErrorCode(err) === 331001
}

export function bridgeErrorMessage(err: unknown): string {
  return getErrorMessage(err)
}
