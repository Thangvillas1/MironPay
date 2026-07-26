import { createPublicClient, createWalletClient, http, keccak256, toBytes, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export const USDC = '0x3600000000000000000000000000000000000000' as const

export const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
} as const

export const PAYROLL_CLAIM_ABI = [
  { name: 'computeBoxAddress', type: 'function', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'address' }] },
  { name: 'payBatch', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'bytes32[]' }, { type: 'uint256[]' }, { type: 'uint64' }], outputs: [] },
  { name: 'claim', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'bytes32' }, { type: 'address' }, { type: 'bytes' }], outputs: [] },
  { name: 'reclaim', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'bytes32' }], outputs: [] },
  { name: 'feeBps', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'admin', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    name: 'boxes', type: 'function', stateMutability: 'view', inputs: [{ type: 'bytes32' }],
    outputs: [{ name: 'company', type: 'address' }, { name: 'expiry', type: 'uint64' }, { name: 'exists', type: 'bool' }],
  },
] as const

export function payrollClaimContract(): Address {
  const addr = process.env.PAYROLL_CLAIM_CONTRACT
  if (!addr) throw new Error('PAYROLL_CLAIM_CONTRACT is not configured')
  return addr as Address
}

/** boxId convention (must stay consistent everywhere it's derived — backend
 *  and any future client-side code): keccak256(lowercased+trimmed email, runId).
 *
 *  Deliberately includes runId, not just the email. A CREATE2 address that
 *  has already been claimed permanently has code deployed at it — the EVM
 *  will never let a second payBatch() pay into that exact address again.
 *  If boxId were derived from email alone, the same recipient could only
 *  ever be paid ONCE across the platform's entire lifetime, which breaks
 *  recurring monthly payroll. Mixing in runId gives every payroll cycle a
 *  fresh, distinct Claim Box per recipient, so they claim once per cycle
 *  (matching the already-decided "everyone claims every run" design) while
 *  still being payable again next month. */
export function boxIdForClaim(email: string, runId: string): Hex {
  const normalized = email.trim().toLowerCase()
  return keccak256(toBytes(`${normalized}:${runId}`))
}

/** The exact message a recipient's wallet must sign to prove ownership when
 *  claiming — must match `MironPayrollClaim.claim()`'s on-chain check
 *  (keccak256(boxId, recipient, contractAddress, chainId)), then wrapped
 *  with the standard personal_sign / EIP-191 prefix by the signer. */
export function claimMessageHash(boxId: Hex, recipient: Address, contractAddress: Address): Hex {
  return keccak256(
    // matches Solidity's abi.encodePacked(bytes32, address, address, uint256)
    ('0x' +
      boxId.slice(2) +
      recipient.slice(2).padStart(40, '0').toLowerCase() +
      contractAddress.slice(2).padStart(40, '0').toLowerCase() +
      BigInt(arcTestnet.id).toString(16).padStart(64, '0')) as Hex
  )
}

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(undefined, { timeout: 30_000 }),
})

/** Relayer that submits claim() on a recipient's behalf so they never need
 *  their own gas. Reuses the same operational key as the Bridge relayer
 *  unless a dedicated PAYROLL_RELAYER_PRIVATE_KEY is set — the relayer only
 *  ever submits a signature the recipient already produced, it has no power
 *  to redirect funds (see project design notes). */
export function relayerWalletClient() {
  const key = process.env.PAYROLL_RELAYER_PRIVATE_KEY || process.env.BRIDGE_RELAYER_PRIVATE_KEY
  if (!key) throw new Error('No relayer key configured (PAYROLL_RELAYER_PRIVATE_KEY or BRIDGE_RELAYER_PRIVATE_KEY)')
  const account = privateKeyToAccount(key as Hex)
  return createWalletClient({ account, chain: arcTestnet, transport: http(undefined, { timeout: 30_000 }) })
}

/** Retry helper — Arc Testnet's public RPC is flaky under repeated eth_call
 *  (verified during contract testing), unrelated to contract logic. */
export async function withRpcRetry<T>(fn: () => Promise<T>, retries = 5, delayMs = 1500): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i < retries) await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}
