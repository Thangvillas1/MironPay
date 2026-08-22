import { NextRequest, NextResponse } from 'next/server'
import { createWalletClient, createPublicClient, http, parseAbi, keccak256, toBytes } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { hasInternalAgentAuthorization } from '@/app/lib/agent-security'
import { circleClient } from '@/app/lib/circle'
import { parseAgentAmount } from '@/app/lib/agent-security'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.io'] } },
}

const REPUTATION_REGISTRY = '0x8004B663056A597Dffe9eCcC1965A193B7388713' as `0x${string}`

const REPUTATION_ABI = parseAbi([
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) returns (bool)',
])

// value/valueDecimals theo đúng ABI thật của ReputationRegistry (EIP-8004) — value là
// số nguyên, valueDecimals=0 nghĩa là value chính là điểm thật, không bị chia thêm.
// BUG CŨ (đã fix 2026-07-03): route này từng truyền `feedbackType` (1/2) vào đúng slot
// valueDecimals, khiến mọi điểm +10/+15 bị on-chain lưu thành +1.0/+1.5 (chia 10 lần) —
// phát hiện khi build leaderboard, so sánh raw feedback events với giá trị mong đợi.
// score: -100 to +100

export async function POST(request: NextRequest) {
  try {
    if (!hasInternalAgentAuthorization(request)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { actionType, success, txId, txHash, amount: rawAmount, detail } = await request.json()
    const amount = parseAgentAmount(rawAmount)
    if (!new Set(['send', 'swap', 'gateway_deposit', 'gateway_withdraw', 'launchpad_contribute']).has(actionType) || amount === null) {
      return NextResponse.json({ error: 'Invalid feedback payload.' }, { status: 400 })
    }
    if (!success || typeof txId !== 'string' || !txId) {
      return NextResponse.json({ error: 'A completed Circle transaction proof is required.' }, { status: 400 })
    }

    const [{ data: profile }, transactionResponse] = await Promise.all([
      supabase.from('profiles').select('circle_wallet_id, agent_wallet_id').eq('id', user.id).single(),
      circleClient.getTransaction({ id: txId }),
    ])
    const circleTransaction = (transactionResponse.data as unknown as { transaction?: { id?: string; state?: string; txHash?: string; walletId?: string } }).transaction
    const ownedWalletIds = new Set([profile?.circle_wallet_id, profile?.agent_wallet_id].filter(Boolean))
    if (circleTransaction?.state !== 'COMPLETE'
      || !circleTransaction.txHash
      || circleTransaction.txHash.toLowerCase() !== String(txHash).toLowerCase()
      || !circleTransaction.walletId
      || !ownedWalletIds.has(circleTransaction.walletId)) {
      return NextResponse.json({ error: 'Transaction proof is incomplete or is not owned by this user.' }, { status: 403 })
    }
    // actionType: 'send' | 'swap' | 'chat'
    // success: boolean
    // txHash: string (bằng chứng)
    // amount: number
    // detail: string (mô tả)

    const validatorKey = process.env.AGENT_VALIDATOR_PRIVATE_KEY
    if (!validatorKey) return NextResponse.json({ error: 'Validator key not configured' }, { status: 500 })

    const { data: identity } = await supabase.from('miron_agent_identity').select('agent_id').single()
    if (!identity?.agent_id) return NextResponse.json({ error: 'Agent not registered on-chain' }, { status: 400 })
    const { error: useError } = await createAdminSupabaseClient().from('agent_feedback_uses').insert({ tx_hash: circleTransaction.txHash.toLowerCase(), user_id: user.id })
    if (useError) return NextResponse.json({ error: 'Feedback already recorded for this transaction.' }, { status: 409 })

    const validatorAccount = privateKeyToAccount(validatorKey as `0x${string}`)
    const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })
    const validatorClient = createWalletClient({ account: validatorAccount, chain: arcTestnet, transport: http() })

    // Tính điểm dựa trên action
    const score = success
      ? (actionType === 'swap' ? 15 : actionType === 'send' ? 10 : 5)
      : -10

    const tag = `${actionType}${success ? '_success' : '_fail'}`
    const evidenceURI = txHash ? `https://testnet.arcscan.app/tx/${txHash}` : ''
    const comment = detail ?? `Agent ${actionType} ${success ? 'success' : 'failed'}: ${amount} USDC`
    const feedbackHash = keccak256(toBytes(`${identity.agent_id}-${tag}-${Date.now()}`))

    const hash = await validatorClient.writeContract({
      address: REPUTATION_REGISTRY,
      abi: REPUTATION_ABI,
      functionName: 'giveFeedback',
      args: [
        BigInt(identity.agent_id),
        BigInt(score),
        0,            // valueDecimals — score đã là số nguyên thật, không chia thêm
        tag,
        '',           // tag2 — để trống
        evidenceURI,
        comment,
        feedbackHash,
      ],
    })

    await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 })

    console.log(`[agent/feedback] +${score} cho action ${tag}, tx: ${hash}`)

    return NextResponse.json({
      success: true,
      agentId: identity.agent_id,
      score,
      tag,
      txHash: hash,
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[agent/feedback]', message)
    // Không throw — feedback lỗi không nên block action chính
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
