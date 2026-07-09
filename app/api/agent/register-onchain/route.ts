import { NextRequest, NextResponse } from 'next/server'
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

// ── ARC Testnet config ────────────────────────────────────────────────────────
const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
}

// ── Contract addresses ────────────────────────────────────────────────────────
const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e'
const REPUTATION_REGISTRY = '0x8004B663056A597Dffe9eCcC1965A193B7388713'

const IDENTITY_ABI = parseAbi([
  'function register(string metadataURI) returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
])

const REPUTATION_ABI = parseAbi([
  'function giveFeedback(uint256 agentId, uint8 score) returns (bool)',
])

// Metadata mô tả Miron Agent — dùng URI test của ARC
const AGENT_METADATA_URI = 'ipfs://bafkreibdi6623n3xpf7ymk62ckb4bo75o3qemwkpfvp5i25j66itxvsoei'

export async function POST(request: NextRequest) {
  try {
    // Chỉ admin mới gọi được (kiểm tra qua Supabase)
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Kiểm tra env
    const ownerKey = process.env.AGENT_OWNER_PRIVATE_KEY
    const validatorKey = process.env.AGENT_VALIDATOR_PRIVATE_KEY
    if (!ownerKey || !validatorKey) {
      return NextResponse.json({ error: 'Project wallet not configured' }, { status: 500 })
    }

    // Kiểm tra đã đăng ký chưa (tránh đăng ký 2 lần)
    const { data: existing } = await supabase
      .from('miron_agent_identity')
      .select('agent_id, tx_hash')
      .single()

    if (existing?.agent_id) {
      return NextResponse.json({
        message: 'Miron Agent already registered',
        agentId: existing.agent_id,
        txHash: existing.tx_hash,
      })
    }

    // ── Setup clients ─────────────────────────────────────────────────────────
    const ownerAccount = privateKeyToAccount(ownerKey as `0x${string}`)
    const validatorAccount = privateKeyToAccount(validatorKey as `0x${string}`)

    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(),
    })

    const ownerClient = createWalletClient({
      account: ownerAccount,
      chain: arcTestnet,
      transport: http(),
    })

    const validatorClient = createWalletClient({
      account: validatorAccount,
      chain: arcTestnet,
      transport: http(),
    })

    // ── Bước 1: Đăng ký Agent Identity ───────────────────────────────────────
    console.log('[register-onchain] Đăng ký Miron Agent...')
    const registerHash = await ownerClient.writeContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_ABI,
      functionName: 'register',
      args: [AGENT_METADATA_URI],
    })

    console.log('[register-onchain] TX hash:', registerHash)

    // Chờ transaction confirm
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: registerHash,
      timeout: 60_000,
    })

    // Lấy Agent ID từ Transfer event
    const transferLog = receipt.logs.find(log =>
      log.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase()
    )

    if (!transferLog?.topics?.[3]) {
      return NextResponse.json({ error: 'Failed to extract Agent ID from transaction' }, { status: 500 })
    }

    const agentId = parseInt(transferLog.topics[3], 16)
    console.log('[register-onchain] Agent ID:', agentId)

    // ── Lưu vào Supabase ──────────────────────────────────────────────────────
    await supabase.from('miron_agent_identity').insert({
      agent_id: agentId,
      owner_address: ownerAccount.address,
      metadata_uri: AGENT_METADATA_URI,
      tx_hash: registerHash,
      registered_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      agentId,
      ownerAddress: ownerAccount.address,
      txHash: registerHash,
      explorerUrl: `https://testnet.arcscan.app/tx/${registerHash}`,
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[register-onchain]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET — xem trạng thái đăng ký hiện tại
export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase.from('miron_agent_identity').select('*').single()

  return NextResponse.json({
    registered: !!data?.agent_id,
    agentId: data?.agent_id ?? null,
    ownerAddress: data?.owner_address ?? null,
    txHash: data?.tx_hash ?? null,
    score: data?.initial_score ?? null,
    registeredAt: data?.registered_at ?? null,
  })
}
