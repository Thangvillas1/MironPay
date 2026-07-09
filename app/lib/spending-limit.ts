import { createWalletClient, createPublicClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
} as const

const ABI = parseAbi([
  'function getLimit(address wallet) view returns (uint256)',
  'function setLimit(address wallet, uint256 limitMicro) external',
])

const USDC_DECIMALS = 6

function getContractAddress(): `0x${string}` | null {
  const addr = process.env.SPENDING_LIMIT_CONTRACT
  if (!addr) return null
  return addr as `0x${string}`
}

function publicClient() {
  return createPublicClient({ chain: arcTestnet, transport: http() })
}

/** Read daily limit for an agent wallet. Returns USDC float (e.g. 50.0). */
export async function getOnChainLimit(agentWalletAddress: string): Promise<number | null> {
  const contractAddress = getContractAddress()
  if (!contractAddress) return null

  try {
    const micro = await publicClient().readContract({
      address: contractAddress,
      abi: ABI,
      functionName: 'getLimit',
      args: [agentWalletAddress as `0x${string}`],
    })
    return Number(micro) / 10 ** USDC_DECIMALS
  } catch (err) {
    console.error('[spending-limit] getOnChainLimit error:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Write daily limit for an agent wallet. Returns tx hash. */
export async function setOnChainLimit(agentWalletAddress: string, limitUsdc: number): Promise<string | null> {
  const contractAddress = getContractAddress()
  if (!contractAddress) return null

  const ownerKey = process.env.AGENT_OWNER_PRIVATE_KEY
  if (!ownerKey) {
    console.error('[spending-limit] AGENT_OWNER_PRIVATE_KEY not set')
    return null
  }

  try {
    const account = privateKeyToAccount(ownerKey as `0x${string}`)
    const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http() })

    const limitMicro = BigInt(Math.round(limitUsdc * 10 ** USDC_DECIMALS))

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: ABI,
      functionName: 'setLimit',
      args: [agentWalletAddress as `0x${string}`, limitMicro],
    })

    return hash
  } catch (err) {
    console.error('[spending-limit] setOnChainLimit error:', err instanceof Error ? err.message : err)
    return null
  }
}
