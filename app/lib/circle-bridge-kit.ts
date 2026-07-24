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
// `developer-controlled` capabilities let us pass an explicit `address` per
// call instead of always defaulting to the relayer's own address — needed
// both to prepare a deposit burn on behalf of an arbitrary user address, and
// to submit a withdrawal mint paid for by the relayer.
export const relayerAdapter = createViemAdapterFromPrivateKey({
  privateKey: process.env.BRIDGE_RELAYER_PRIVATE_KEY! as `0x${string}`,
  capabilities: { addressContext: 'developer-controlled' },
})

// Developer-controlled adapters require an explicit `address` on every
// AdapterContext. The relayer's own address is only actually used for
// signing when it submits a withdrawal mint; everywhere else (estimates,
// deposit burn preparation, deposit attestation lookups) it's just a
// required-by-type placeholder that doesn't affect the resulting calldata.
export const relayerAddress = privateKeyToAccount(process.env.BRIDGE_RELAYER_PRIVATE_KEY! as `0x${string}`).address

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
