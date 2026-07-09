import { NextRequest, NextResponse } from 'next/server'
import { createWalletClient, createPublicClient, http, parseAbi, keccak256, toBytes } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
}

const VALIDATION_REGISTRY = '0x8004Cb1BF31DAf7788923b405b754f57acEB4272' as `0x${string}`

const VALIDATION_ABI = parseAbi([
  'function validationRequest(address validator, uint256 agentId, string requestURI, bytes32 requestHash)',
  'function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)',
  'function getValidationStatus(bytes32 requestHash) view returns (address, uint256, uint8, bytes32, string, uint256)',
])

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { actionType, amount, detail } = await request.json()

    const ownerKey = process.env.AGENT_OWNER_PRIVATE_KEY
    const validatorKey = process.env.AGENT_VALIDATOR_PRIVATE_KEY
    const validatorAddress = process.env.AGENT_VALIDATOR_ADDRESS
    if (!ownerKey || !validatorKey || !validatorAddress) {
      return NextResponse.json({ error: 'Wallet keys not configured' }, { status: 500 })
    }

    const { data: identity } = await supabase.from('miron_agent_identity').select('agent_id').single()
    if (!identity?.agent_id) {
      // Agent chưa đăng ký — cho phép chạy nhưng không validate on-chain
      return NextResponse.json({ approved: true, onChain: false, reason: 'Agent chưa đăng ký ERC-8004' })
    }

    const ownerAccount = privateKeyToAccount(ownerKey as `0x${string}`)
    const validatorAccount = privateKeyToAccount(validatorKey as `0x${string}`)
    const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })
    const ownerClient = createWalletClient({ account: ownerAccount, chain: arcTestnet, transport: http() })
    const validatorClient = createWalletClient({ account: validatorAccount, chain: arcTestnet, transport: http() })

    // Tạo requestHash duy nhất
    const requestHash = keccak256(toBytes(`validate-${identity.agent_id}-${actionType}-${amount}-${Date.now()}`))
    const requestURI = `action:${actionType}:${amount}USDC:${detail ?? ''}`

    // Step 1: Owner gửi validationRequest
    const reqTx = await ownerClient.writeContract({
      address: VALIDATION_REGISTRY,
      abi: VALIDATION_ABI,
      functionName: 'validationRequest',
      args: [validatorAddress as `0x${string}`, BigInt(identity.agent_id), requestURI, requestHash],
    })
    await publicClient.waitForTransactionReceipt({ hash: reqTx, timeout: 30_000 })

    // Step 2: Validator phản hồi (auto approve cho actions hợp lệ)
    // Trong production: validator sẽ review và quyết định
    const responseHash = keccak256(toBytes(`response-${requestHash}`))
    const responseCode = 100 // 100 = PASSED, 0 = FAILED
    const tag = `${actionType}_validated`

    const resTx = await validatorClient.writeContract({
      address: VALIDATION_REGISTRY,
      abi: VALIDATION_ABI,
      functionName: 'validationResponse',
      args: [requestHash, responseCode, '', responseHash, tag],
    })
    await publicClient.waitForTransactionReceipt({ hash: resTx, timeout: 30_000 })

    console.log(`[agent/validate] ${actionType} ${amount} USDC — APPROVED on-chain`)

    return NextResponse.json({
      approved: true,
      onChain: true,
      agentId: identity.agent_id,
      requestHash,
      requestTx: reqTx,
      responseTx: resTx,
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[agent/validate]', message)
    // Nếu on-chain validate lỗi → vẫn cho phép chạy (fallback)
    return NextResponse.json({ approved: true, onChain: false, error: message })
  }
}
