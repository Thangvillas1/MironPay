import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseAbi } from 'viem'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
}

const REPUTATION_REGISTRY = '0x8004B663056A597Dffe9eCcC1965A193B7388713' as `0x${string}`

const REPUTATION_ABI = parseAbi([
  'function readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked) view returns (address[] clients, uint64[] feedbackIndexes, int128[] values, uint8[] valueDecimals, string[] tag1s, string[] tag2s, bool[] revokedStatuses)',
])

// GET — đọc reputation on-chain của Miron Agent từ ReputationRegistry (ERC-8004)
export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: identity } = await supabase.from('miron_agent_identity').select('agent_id').single()
  if (!identity?.agent_id) {
    return NextResponse.json({ registered: false })
  }

  try {
    const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })

    const [, , values, , tag1s, , revokedStatuses] = await publicClient.readContract({
      address: REPUTATION_REGISTRY,
      abi: REPUTATION_ABI,
      functionName: 'readAllFeedback',
      args: [BigInt(identity.agent_id), [], '', '', false],
    })

    let totalScore = 0
    const byTag: Record<string, { count: number; score: number }> = {}

    values.forEach((value, i) => {
      if (revokedStatuses[i]) return
      const score = Number(value)
      totalScore += score
      const tag = tag1s[i] || 'other'
      if (!byTag[tag]) byTag[tag] = { count: 0, score: 0 }
      byTag[tag].count += 1
      byTag[tag].score += score
    })

    return NextResponse.json({
      registered: true,
      agentId: identity.agent_id,
      totalFeedback: values.filter((_, i) => !revokedStatuses[i]).length,
      totalScore,
      byTag,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[agent/reputation]', message)
    return NextResponse.json({ registered: true, agentId: identity.agent_id, error: message }, { status: 200 })
  }
}
