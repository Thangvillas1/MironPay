import { NextRequest, NextResponse } from 'next/server'
import { encodeFunctionData } from 'viem'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { circleClient } from '@/app/lib/circle'

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000'
const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const ADAPTER_CONTRACT = '0xBBD70b01a1CAbc96d5b7b129Ae1AAabdf50dd40b'
const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935'
const ARC_RPC = 'https://rpc.testnet.arc.network/'
const ARC_CHAIN = 'Arc_Testnet'
const KIT_BASE_URL = 'https://api.circle.com'

const TOKEN_MAP: Record<string, string> = {
  USDC: USDC_ADDRESS,
  EURC: EURC_ADDRESS,
}

const ADAPTER_ABI = [
  {
    type: 'function',
    name: 'execute',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          {
            name: 'instructions',
            type: 'tuple[]',
            components: [
              { name: 'target', type: 'address' },
              { name: 'data', type: 'bytes' },
              { name: 'value', type: 'uint256' },
              { name: 'tokenIn', type: 'address' },
              { name: 'amountToApprove', type: 'uint256' },
              { name: 'tokenOut', type: 'address' },
              { name: 'minTokenOut', type: 'uint256' },
            ],
          },
          {
            name: 'tokens',
            type: 'tuple[]',
            components: [
              { name: 'token', type: 'address' },
              { name: 'beneficiary', type: 'address' },
            ],
          },
          { name: 'execId', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'metadata', type: 'bytes' },
        ],
      },
      {
        name: 'tokenInputs',
        type: 'tuple[]',
        components: [
          { name: 'permitType', type: 'uint8' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'permitCalldata', type: 'bytes' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
] as const

function toBaseUnits(amount: string, decimals = 6): string {
  return Math.floor(parseFloat(amount) * Math.pow(10, decimals)).toString()
}

function parseBigInt(v: string): bigint {
  return BigInt(v)
}

// Check on-chain token balance via balanceOf(address) — selector 0x70a08231
async function getOnChainBalance(tokenAddress: string, owner: string): Promise<bigint> {
  const data = `0x70a08231${owner.slice(2).padStart(64, '0')}`
  try {
    const res = await fetch(ARC_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: tokenAddress, data }, 'latest'] }),
    })
    const json = await res.json()
    if (!json.result || json.result === '0x') return 0n
    return BigInt(json.result)
  } catch {
    return 0n
  }
}

// Check on-chain allowance via raw eth_call — no viem chain config needed
async function getAllowance(tokenAddress: string, owner: string, spender: string): Promise<bigint> {
  // allowance(address,address) selector = 0xdd62ed3e
  const data = `0xdd62ed3e${owner.slice(2).padStart(64, '0')}${spender.slice(2).padStart(64, '0')}`
  const res = await fetch(ARC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: tokenAddress, data }, 'latest'] }),
  })
  const json = await res.json()
  if (!json.result || json.result === '0x') return 0n
  return BigInt(json.result)
}

// Only approve if not already approved — avoids the 15-30s confirm wait on subsequent swaps
async function ensureApprovalIfNeeded(walletId: string, walletAddress: string, tokenAddress: string, amountNeeded: bigint) {
  const allowance = await getAllowance(tokenAddress, walletAddress, ADAPTER_CONTRACT)
  if (allowance >= amountNeeded) {
    console.log('[swap] allowance sufficient, skipping approve')
    return
  }
  console.log('[swap] allowance insufficient, submitting approve...')
  const res = await circleClient.createContractExecutionTransaction({
    walletId,
    contractAddress: tokenAddress,
    abiFunctionSignature: 'approve(address,uint256)',
    abiParameters: [ADAPTER_CONTRACT, MAX_UINT256],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' as const } },
    idempotencyKey: crypto.randomUUID(),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txId = (res.data as any)?.id
  if (txId) {
    await circleClient.getTransaction({ id: txId, waitForState: 'CONFIRMED', pollingInterval: 1500 })
    console.log('[swap] approve confirmed')
  }
}

async function getSwapData(params: {
  tokenIn: string
  tokenOut: string
  amountBaseUnits: string
  walletAddress: string
  slippageBps?: number
}) {
  const body = {
    tokenInAddress: TOKEN_MAP[params.tokenIn] ?? params.tokenIn,
    tokenInChain: ARC_CHAIN,
    tokenOutAddress: TOKEN_MAP[params.tokenOut] ?? params.tokenOut,
    tokenOutChain: ARC_CHAIN,
    fromAddress: params.walletAddress,
    toAddress: params.walletAddress,
    amount: params.amountBaseUnits,
    slippageBps: params.slippageBps ?? 1500,
  }

  // Retry up to 3 times for transient "No route available" (code 331001)
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1500))
    const res = await fetch(`${KIT_BASE_URL}/v1/stablecoinKits/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CIRCLE_KIT_KEY}` },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    if (res.ok) return JSON.parse(text)
    let parsed: { code?: number } = {}
    try { parsed = JSON.parse(text) } catch { /* ok */ }
    if (parsed.code === 331001 && attempt < 2) continue
    if (parsed.code === 331001) {
      throw new Error('No swap route available on testnet right now. Please try again in a few minutes.')
    }
    throw new Error(`Stablecoin service error ${res.status}: ${text}`)
  }
  throw new Error('No swap route available on testnet right now. Please try again in a few minutes.')
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { tokenIn, tokenOut, amountIn, slippageBps: rawSlippage, overrideWalletId, overrideWalletAddress } = body
    const slippageBps: number = typeof rawSlippage === 'number'
      ? Math.min(10000, Math.max(10, rawSlippage))
      : 1500 // 15% default — testnet liquidity is thin

    if (!tokenIn || !tokenOut || !amountIn || isNaN(parseFloat(amountIn)) || parseFloat(amountIn) <= 0) {
      return NextResponse.json({ error: 'Missing or invalid params' }, { status: 400 })
    }
    if (!TOKEN_MAP[tokenIn] || !TOKEN_MAP[tokenOut]) {
      return NextResponse.json({ error: `Unsupported token: ${tokenIn} or ${tokenOut}` }, { status: 400 })
    }

    // Cho phép agent dùng wallet khác (agent wallet)
    const isAgentWallet = !!(overrideWalletId && overrideWalletAddress)
    let wallet: { circleWalletId: string; walletAddress: string } | null
    if (isAgentWallet) {
      wallet = { circleWalletId: overrideWalletId, walletAddress: overrideWalletAddress }
    } else {
      wallet = await resolveCircleWalletId(supabase, user.id)
    }
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    const amountBaseUnits = toBaseUnits(amountIn)

    // Step 1: Approve tokenIn for the Adapter Contract if needed
    const tokenInAddress = TOKEN_MAP[tokenIn]
    await ensureApprovalIfNeeded(wallet.circleWalletId, wallet.walletAddress, tokenInAddress, BigInt(amountBaseUnits))

    // Steps 2-5: Fetch fresh quote → build calldata → submit → wait
    // Retry up to 3 times on ESTIMATION_ERROR (stale quote / thin testnet liquidity)
    const MAX_ATTEMPTS = 3
    let lastErr = ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let swapData: any = null
    let txId: string | null = null
    let txHash: string | null = null

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        console.log(`[swap] retry attempt ${attempt + 1} after ESTIMATION_ERROR`)
        await new Promise(r => setTimeout(r, 2000))
      }

      // Fresh quote on every attempt
      swapData = await getSwapData({ tokenIn, tokenOut, amountBaseUnits, walletAddress: wallet.walletAddress, slippageBps })

      const { transaction } = swapData
      if (!transaction?.executionParams || !transaction?.signature) {
        return NextResponse.json({ error: 'Invalid swap response from Circle service' }, { status: 502 })
      }

      // Balance guard — re-check with the amount this quote actually requires
      const requiredAmount = parseBigInt(swapData.amount ?? amountBaseUnits)
      const onChainBalance = await getOnChainBalance(tokenInAddress, wallet.walletAddress)
      if (onChainBalance > 0n && requiredAmount > onChainBalance) {
        const required = (Number(requiredAmount) / 1e6).toFixed(6).replace(/\.?0+$/, '')
        const available = (Number(onChainBalance) / 1e6).toFixed(6).replace(/\.?0+$/, '')
        return NextResponse.json({
          error: `Insufficient balance: need ${required} ${tokenIn} but only have ${available} ${tokenIn}`,
        }, { status: 400 })
      }

      const ep = transaction.executionParams
      console.log(`[swap] attempt ${attempt + 1} execId:`, ep.execId, 'amount:', swapData.amount)

      const callData = encodeFunctionData({
        abi: ADAPTER_ABI,
        functionName: 'execute',
        args: [
          {
            instructions: ep.instructions.map((i: {
              target: `0x${string}`; data: `0x${string}`; value: string
              tokenIn: `0x${string}`; amountToApprove: string; tokenOut: `0x${string}`; minTokenOut: string
            }) => ({
              target: i.target,
              data: i.data,
              value: parseBigInt(i.value),
              tokenIn: i.tokenIn,
              amountToApprove: parseBigInt(i.amountToApprove),
              tokenOut: i.tokenOut,
              minTokenOut: parseBigInt(i.minTokenOut),
            })),
            tokens: ep.tokens.map((t: { token: `0x${string}`; beneficiary: `0x${string}` }) => ({
              token: t.token,
              beneficiary: t.beneficiary,
            })),
            execId: parseBigInt(ep.execId),
            deadline: parseBigInt(ep.deadline),
            metadata: ep.metadata as `0x${string}`,
          },
          [{
            permitType: 0,
            token: TOKEN_MAP[tokenIn] as `0x${string}`,
            amount: parseBigInt(swapData.amount),
            permitCalldata: '0x',
          }],
          transaction.signature as `0x${string}`,
        ],
      })

      // gasLimit override is only supported for EOA wallets — Circle rejects
      // feeLevel+gasLimit together on SCA (agent) wallets with error 155234.
      const gasLimit = !isAgentWallet && transaction.gasLimit
        ? (parseBigInt(transaction.gasLimit) * 120n / 100n).toString()
        : undefined

      try {
        const execRes = await circleClient.createContractExecutionTransaction({
          walletId: wallet.circleWalletId,
          contractAddress: ADAPTER_CONTRACT,
          callData,
          fee: {
            type: 'level',
            config: { feeLevel: 'MEDIUM' as const, ...(gasLimit && { gasLimit }) },
          },
          idempotencyKey: crypto.randomUUID(),
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        txId = (execRes.data as any)?.id ?? null
        if (!txId) throw new Error('No transaction ID returned')

        const confirmed = await circleClient.getTransaction({
          id: txId,
          waitForState: 'SENT',
          pollingInterval: 1000,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        txHash = (confirmed.data as any)?.transaction?.txHash ?? null
        break // success
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
        // 0xe52970aa = slippage/min-output revert — retrying won't help, tell user immediately
        if (lastErr.includes('0xe52970aa')) {
          return NextResponse.json({
            error: 'Slippage too low — order could not be matched. Try again with higher slippage.',
            slippageTooLow: true,
          }, { status: 400 })
        }
        const isRetryable = lastErr.includes('ESTIMATION_ERROR') || lastErr.includes('execution reverted')
        if (isRetryable && attempt < MAX_ATTEMPTS - 1) continue
        throw e
      }
    }

    if (!txId) return NextResponse.json({ error: lastErr || 'Swap failed after multiple attempts' }, { status: 500 })

    const amountOutRaw: string | null = swapData?.estimatedAmount ?? null
    const amountOut = amountOutRaw
      ? (parseInt(amountOutRaw) / 1e6).toFixed(6).replace(/\.?0+$/, '')
      : null

    return NextResponse.json({
      transactionId: txId,
      txHash,
      explorerUrl: txHash ? `https://testnet.arcscan.app/tx/${txHash}` : null,
      amountOut,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[swap/execute]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
