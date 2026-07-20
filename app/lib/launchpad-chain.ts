import { createWalletClient, createPublicClient, http, parseAbi, keccak256, toBytes } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { circleClient } from './circle'

const ERC20_ALLOWANCE_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
])
const ERC20_DECIMALS_ABI = parseAbi([
  'function decimals() view returns (uint8)',
])
const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935'

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
} as const

const ABI = parseAbi([
  'function createSale(bytes32 saleId, (address treasury,uint256 cap,uint256 minRaise,uint256 minContribution,uint256 maxContribution,uint64 startTime,uint64 endTime,address tokenAddress,uint8 tokenDecimals,uint256 priceMicro) params) external',
  'function contribute(bytes32 saleId, uint256 amount) external',
  'function refund(bytes32 saleId) external',
  'function depositTokens(bytes32 saleId, uint256 amount) external',
  'function claim(bytes32 saleId) external',
  'function sales(bytes32) view returns (address treasury, uint256 cap, uint256 minRaise, uint256 minContribution, uint256 maxContribution, uint64 startTime, uint64 endTime, uint256 totalRaised, bool withdrawn, bool exists, address tokenAddress, uint8 tokenDecimals, uint256 priceMicro, uint256 tokensDeposited)',
  'function getContribution(bytes32 saleId, address contributor) view returns (uint256)',
  'function remainingCap(bytes32 saleId) view returns (uint256)',
])

export const USDC_DECIMALS = 6
const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000'

export interface OnChainSale {
  treasury: string
  cap: number
  minRaise: number
  minContribution: number
  maxContribution: number
  startTime: number
  endTime: number
  totalRaised: number
  withdrawn: boolean
  exists: boolean
  tokenAddress: string
  tokenDecimals: number
  priceMicro: number
  tokensDeposited: number
}

/** Deterministic bytes32 sale id from a project slug — same input always hashes the same. */
export function saleIdFromProjectId(projectId: string): `0x${string}` {
  return keccak256(toBytes(projectId))
}

function getContractAddress(): `0x${string}` | null {
  const addr = process.env.IDO_LAUNCHPAD_CONTRACT
  return addr ? (addr as `0x${string}`) : null
}

function publicClient() {
  return createPublicClient({ chain: arcTestnet, transport: http() })
}

function adminWalletClient() {
  const ownerKey = process.env.AGENT_OWNER_PRIVATE_KEY
  if (!ownerKey) throw new Error('AGENT_OWNER_PRIVATE_KEY not set')
  const account = privateKeyToAccount(ownerKey as `0x${string}`)
  return createWalletClient({ account, chain: arcTestnet, transport: http() })
}

function toMicro(usdc: number): bigint {
  return BigInt(Math.round(usdc * 10 ** USDC_DECIMALS))
}
function fromMicro(micro: bigint): number {
  return Number(micro) / 10 ** USDC_DECIMALS
}
function fromAtomic(atomic: bigint, decimals: number): number {
  return Number(atomic) / 10 ** decimals
}

/** Reads a token's own `decimals()` — needed since every project brings a
 * different ERC-20 with its own decimal count, unlike USDC's fixed 6. */
export async function getTokenDecimals(tokenAddress: string): Promise<number> {
  const decimals = await publicClient().readContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_DECIMALS_ABI,
    functionName: 'decimals',
  })
  return decimals
}

/** Admin-only: register a new sale on-chain (called after a submission is approved). */
export async function createSaleOnChain(params: {
  projectId: string
  treasury: string
  capUsdc: number
  minRaiseUsdc: number
  minUsdc: number
  maxUsdc: number
  startTime: Date
  endTime: Date
  tokenAddress: string
  priceUsd: number
}): Promise<{ txHash: string; saleId: `0x${string}` }> {
  const contractAddress = getContractAddress()
  if (!contractAddress) throw new Error('IDO_LAUNCHPAD_CONTRACT not configured')

  const saleId = saleIdFromProjectId(params.projectId)
  const client = adminWalletClient()
  const pub = publicClient()
  const tokenDecimals = await getTokenDecimals(params.tokenAddress)
  const priceMicro = BigInt(Math.round(params.priceUsd * 10 ** USDC_DECIMALS))

  const hash = await client.writeContract({
    address: contractAddress,
    abi: ABI,
    functionName: 'createSale',
    args: [
      saleId,
      {
        treasury: params.treasury as `0x${string}`,
        cap: toMicro(params.capUsdc),
        minRaise: toMicro(params.minRaiseUsdc),
        minContribution: toMicro(params.minUsdc),
        maxContribution: toMicro(params.maxUsdc),
        startTime: BigInt(Math.floor(params.startTime.getTime() / 1000)),
        endTime: BigInt(Math.floor(params.endTime.getTime() / 1000)),
        tokenAddress: params.tokenAddress as `0x${string}`,
        tokenDecimals,
        priceMicro,
      },
    ],
  })
  await pub.waitForTransactionReceipt({ hash, timeout: 60_000 })

  return { txHash: hash, saleId }
}

/** Read a sale's live on-chain state (raised amount, caps, window). Null if not registered yet. */
export async function getSaleOnChain(projectId: string): Promise<OnChainSale | null> {
  const contractAddress = getContractAddress()
  if (!contractAddress) return null

  const saleId = saleIdFromProjectId(projectId)
  const result = await publicClient().readContract({
    address: contractAddress,
    abi: ABI,
    functionName: 'sales',
    args: [saleId],
  })
  const [treasury, cap, minRaise, minContribution, maxContribution, startTime, endTime, totalRaised, withdrawn, exists, tokenAddress, tokenDecimals, priceMicro, tokensDeposited] = result
  if (!exists) return null

  return {
    treasury,
    cap: fromMicro(cap),
    minRaise: fromMicro(minRaise),
    minContribution: fromMicro(minContribution),
    maxContribution: fromMicro(maxContribution),
    startTime: Number(startTime),
    endTime: Number(endTime),
    totalRaised: fromMicro(totalRaised),
    withdrawn,
    exists,
    tokenAddress,
    tokenDecimals,
    priceMicro: Number(priceMicro),
    tokensDeposited: fromAtomic(tokensDeposited, tokenDecimals),
  }
}

export async function getUserContributionOnChain(projectId: string, walletAddress: string): Promise<number> {
  const contractAddress = getContractAddress()
  if (!contractAddress) return 0
  const saleId = saleIdFromProjectId(projectId)
  const micro = await publicClient().readContract({
    address: contractAddress,
    abi: ABI,
    functionName: 'getContribution',
    args: [saleId, walletAddress as `0x${string}`],
  })
  return fromMicro(micro)
}

async function getUsdcAllowance(owner: string, spender: string): Promise<bigint> {
  return publicClient().readContract({
    address: ARC_TESTNET_USDC as `0x${string}`,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: 'allowance',
    args: [owner as `0x${string}`, spender as `0x${string}`],
  })
}

async function waitTerminal(txId: string, timeoutMs = 30_000): Promise<{ txHash: string | null; failed: boolean; errorReason?: string }> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await circleClient.getTransaction({ id: txId })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = (res.data as any)?.transaction
    const state = tx?.state
    if (state === 'CONFIRMED' || state === 'COMPLETE') return { txHash: tx?.txHash ?? null, failed: false }
    if (state === 'FAILED' || state === 'CANCELLED' || state === 'DENIED') {
      return { txHash: tx?.txHash ?? null, failed: true, errorReason: tx?.errorReason }
    }
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error('Timed out waiting for transaction confirmation')
}

/**
 * Agent-initiated contribution to a live sale, paid from the Agent Wallet's
 * own on-chain USDC via Circle's remote signTypedData/contract-execution API
 * (no raw private key). FCFS is enforced by the contract itself — if the sale
 * is already full by the time this tx is mined, `contribute()` reverts and
 * that revert surfaces here as a clear "sale full" error, not a generic one.
 */
export async function contributeToSale(
  walletId: string,
  walletAddress: string,
  projectId: string,
  amountUsdc: number,
): Promise<{ txHash: string | null }> {
  const contractAddress = getContractAddress()
  if (!contractAddress) throw new Error('IDO_LAUNCHPAD_CONTRACT not configured')

  const saleId = saleIdFromProjectId(projectId)
  const amountAtomic = toMicro(amountUsdc)

  const allowance = await getUsdcAllowance(walletAddress, contractAddress)
  if (allowance < amountAtomic) {
    const approveRes = await circleClient.createContractExecutionTransaction({
      walletId,
      contractAddress: ARC_TESTNET_USDC,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [contractAddress, MAX_UINT256],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey: crypto.randomUUID(),
    })
    const approveTxId = approveRes.data?.id
    if (approveTxId) {
      const approveResult = await waitTerminal(approveTxId)
      if (approveResult.failed) throw new Error(approveResult.errorReason ?? 'USDC approval failed')
    }
  }

  const contributeRes = await circleClient.createContractExecutionTransaction({
    walletId,
    contractAddress,
    abiFunctionSignature: 'contribute(bytes32,uint256)',
    abiParameters: [saleId, amountAtomic.toString()],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: crypto.randomUUID(),
  })
  const contributeTxId = contributeRes.data?.id
  if (!contributeTxId) throw new Error('Contribute did not return a transaction ID')

  const { txHash, failed, errorReason } = await waitTerminal(contributeTxId)
  if (failed) {
    const reason = errorReason ?? ''
    if (reason.toLowerCase().includes('sale full')) throw new Error('Sale is full — try again later or pick another project')
    if (reason.toLowerCase().includes('sale ended')) throw new Error('This sale has ended')
    if (reason.toLowerCase().includes('exceeds per-wallet max')) throw new Error('This would exceed the per-wallet contribution limit')
    throw new Error(reason || 'Contribution failed on-chain')
  }

  return { txHash }
}

/**
 * Claim a refund for a sale that ended without reaching its softcap
 * (minRaise). Contract zeroes the caller's contribution before transferring,
 * so this can't be replayed for more than what was actually contributed.
 */
export async function refundContribution(
  walletId: string,
  walletAddress: string,
  projectId: string,
): Promise<{ txHash: string | null }> {
  const contractAddress = getContractAddress()
  if (!contractAddress) throw new Error('IDO_LAUNCHPAD_CONTRACT not configured')

  const saleId = saleIdFromProjectId(projectId)

  const refundRes = await circleClient.createContractExecutionTransaction({
    walletId,
    contractAddress,
    abiFunctionSignature: 'refund(bytes32)',
    abiParameters: [saleId],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: crypto.randomUUID(),
  })
  const refundTxId = refundRes.data?.id
  if (!refundTxId) throw new Error('Refund did not return a transaction ID')

  const { txHash, failed, errorReason } = await waitTerminal(refundTxId)
  if (failed) {
    const reason = errorReason ?? ''
    if (reason.toLowerCase().includes('softcap met')) throw new Error('This sale reached its softcap — no refund available')
    if (reason.toLowerCase().includes('nothing to refund')) throw new Error('You have no contribution to refund')
    if (reason.toLowerCase().includes('sale still live')) throw new Error('This sale has not ended yet')
    throw new Error(reason || 'Refund failed on-chain')
  }

  return { txHash }
}

/**
 * Claim a buyer's token allocation once a sale ended having met its softcap.
 * Contract computes the exact token amount owed and zeroes the contribution
 * before transferring, so this can't be replayed.
 */
export async function claimTokens(
  walletId: string,
  walletAddress: string,
  projectId: string,
): Promise<{ txHash: string | null }> {
  const contractAddress = getContractAddress()
  if (!contractAddress) throw new Error('IDO_LAUNCHPAD_CONTRACT not configured')

  const saleId = saleIdFromProjectId(projectId)

  const claimRes = await circleClient.createContractExecutionTransaction({
    walletId,
    contractAddress,
    abiFunctionSignature: 'claim(bytes32)',
    abiParameters: [saleId],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: crypto.randomUUID(),
  })
  const claimTxId = claimRes.data?.id
  if (!claimTxId) throw new Error('Claim did not return a transaction ID')

  const { txHash, failed, errorReason } = await waitTerminal(claimTxId)
  if (failed) {
    const reason = errorReason ?? ''
    if (reason.toLowerCase().includes('softcap not met')) throw new Error('This sale did not reach its softcap — use refund instead')
    if (reason.toLowerCase().includes('nothing to claim')) throw new Error('You have no contribution to claim')
    if (reason.toLowerCase().includes('sale still live')) throw new Error('This sale has not ended yet')
    if (reason.toLowerCase().includes('token transfer failed')) throw new Error('Project has not deposited enough tokens yet — try again later')
    throw new Error(reason || 'Claim failed on-chain')
  }

  return { txHash }
}

export { ARC_TESTNET_USDC }
