import { NextRequest, NextResponse } from 'next/server'
import type { Address } from 'viem'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { circleClient } from '@/app/lib/circle'
import { getOnChainLimit } from '@/app/lib/spending-limit'
import { depositToGateway, withdrawFromGateway } from '@/app/lib/x402-buyer'
import { contributeToSale } from '@/app/lib/launchpad-chain'
import { pinFailureHttp, verifyPin } from '@/app/lib/pin'
import { awardVerifiedScore } from '@/app/lib/score-server'
import { isEvmAddress, sameAgentAction, verifyAgentIntent, type AgentAction } from '@/app/lib/agent-intent'
import { classifyTransactionError } from '@/app/lib/transaction-error'
import { isSelfTransferAddress } from '@/app/lib/self-transfer'

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const requestedAction = body.action as AgentAction | undefined
    const rawPin = body.pin as string | undefined

    if (!requestedAction?.type || !requestedAction.intentProof) {
      return NextResponse.json({ error: 'A validated Agent intent is required.', code: 'INTENT_REQUIRED' }, { status: 403 })
    }
    const intent = verifyAgentIntent(requestedAction.intentProof, user.id)
    if (!intent || !sameAgentAction(requestedAction, intent.action)) {
      return NextResponse.json({ error: 'The Agent intent is invalid, expired, or was modified.', code: 'INVALID_INTENT' }, { status: 403 })
    }
    const action = intent.action

    const amount = parseFloat(action.amount ?? '0')
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const walletSource: 'agent' | 'main' = action.walletSource === 'main' ? 'main' : 'agent'

    const { data: profile } = await supabase
      .from('profiles')
      .select('agent_wallet_id, agent_wallet_address, circle_wallet_id, wallet_address, pin_hash')
      .eq('id', user.id)
      .single()

    // Resolve and validate send recipients before PIN/session checks. Bad or
    // self-directed commands must fail without consuming an authorization
    // attempt, intent nonce, daily limit, or network gas.
    let resolvedSendAddress: string | null = null
    if (action.type === 'send') {
      let destination = action.to ?? ''
      if (destination.startsWith('@')) {
        const username = destination.slice(1).toLowerCase()
        const { data: walletAddress, error: resolveError } = await supabase
          .rpc('resolve_username', { p_username: username })
        if (resolveError) {
          console.error('[agent/execute] username resolution failed:', resolveError.message)
          return NextResponse.json({
            error: 'The recipient could not be verified right now. No transaction was sent; please try again.',
            code: 'RECIPIENT_LOOKUP_FAILED',
            retryable: true,
          }, { status: 503 })
        }
        if (!walletAddress) {
          return NextResponse.json({
            error: `@${username} was not found on MironPay. Check the username and try again.`,
            code: 'RECIPIENT_NOT_FOUND',
            retryable: false,
          }, { status: 404 })
        }
        destination = walletAddress
      }
      if (!isEvmAddress(destination)) {
        return NextResponse.json({ error: 'Recipient address is invalid.', code: 'INVALID_ADDRESS' }, { status: 400 })
      }
      if (isSelfTransferAddress(destination, [profile?.wallet_address, profile?.agent_wallet_address])) {
        return NextResponse.json({
          error: 'You cannot send to your own Main Wallet or Agent Wallet. Use Fund or Withdraw instead.',
          code: 'SELF_TRANSFER',
        }, { status: 400 })
      }
      resolvedSendAddress = destination
    }

    // Every Agent Wallet action (never Main Wallet, which is gated by PIN
    // instead) requires a live, user-approved session — same model as
    // Alchemy Agent Wallets: the AI never has standing permission to move
    // funds, only a time-boxed window the user explicitly opened.
    if (walletSource === 'agent') {
      const { data: sessionRow } = await supabase
        .from('agent_wallets').select('session_expires_at').eq('user_id', user.id).maybeSingle()
      const expiresAt = sessionRow?.session_expires_at ? new Date(sessionRow.session_expires_at) : null
      if (!expiresAt || expiresAt < new Date()) {
        return NextResponse.json({
          error: 'Agent session expired or not approved. Approve a session to let the agent act.',
          code: 'SESSION_EXPIRED',
        }, { status: 403 })
      }
    }

    // Gateway deposit/withdraw always operate on the Agent Wallet's own X402
    // reserve — never Main Wallet, so this bypasses the send/swap-specific PIN
    // check and daily spending limit below (moving funds between a wallet and
    // its own reserve isn't "spending", it never leaves the user's custody).
    if (action.type === 'gateway_deposit' || action.type === 'gateway_withdraw') {
      if (!profile?.agent_wallet_id || !profile?.agent_wallet_address) {
        return NextResponse.json({ error: 'Agent wallet not initialized.' }, { status: 400 })
      }
      try {
        if (action.type === 'gateway_deposit') {
          const { txHash } = await depositToGateway(profile.agent_wallet_id, profile.agent_wallet_address as Address, amount)
          return NextResponse.json({ success: true, txHash })
        }
        const { txHash } = await withdrawFromGateway(profile.agent_wallet_id, profile.agent_wallet_address as Address, amount)
        return NextResponse.json({ success: true, txHash })
      } catch (e) {
        const failure = classifyTransactionError(e, { operation: 'gateway', token: 'USDC' })
        console.error('[agent/execute] gateway operation failed:', e)
        return NextResponse.json(failure, { status: failure.status })
      }
    }

    // Ví chính: verify PIN server-side
    if (walletSource === 'main') {
      if (!rawPin) {
        return NextResponse.json({ error: 'PIN required to use Main Wallet.', code: 'PIN_REQUIRED' }, { status: 403 })
      }
      const pinResult = await verifyPin(supabase, user.id, rawPin)
      if (!pinResult.ok) {
        const response = pinFailureHttp(pinResult)
        return NextResponse.json({ error: pinResult.error, code: pinResult.code }, response)
      }
      if (!profile?.circle_wallet_id) {
        return NextResponse.json({ error: 'Main wallet not initialized.' }, { status: 400 })
      }
    } else {
      if (!profile?.agent_wallet_id || !profile?.agent_wallet_address) {
        return NextResponse.json({ error: 'Agent wallet not initialized.' }, { status: 400 })
      }
    }

    // A validated command is single-use. The unique nonce prevents a retry,
    // double click, or replayed HTTP request from broadcasting the same intent
    // twice. Fail closed if the replay ledger is unavailable.
    // Agent swaps consume the nonce inside /api/wallet/swap so that route can
    // independently authorize access to the Agent Wallet. Other actions consume
    // it here before their first external side effect.
    if (!(action.type === 'swap' && walletSource === 'agent')) {
      const { error: intentUseError } = await supabase.from('agent_intent_uses').insert({
        nonce: intent.nonce,
        user_id: user.id,
        expires_at: new Date(intent.expiresAt).toISOString(),
      })
      if (intentUseError) {
        const replay = intentUseError.code === '23505'
        return NextResponse.json({
          error: replay ? 'This Agent command has already been executed.' : 'Agent intent verification is temporarily unavailable.',
          code: replay ? 'INTENT_REPLAYED' : 'INTENT_LEDGER_UNAVAILABLE',
        }, { status: replay ? 409 : 503 })
      }
    }

    const agentWalletId = walletSource === 'main' ? profile!.circle_wallet_id! : profile!.agent_wallet_id!
    const agentWalletAddress = walletSource === 'main' ? (profile!.wallet_address ?? '') : profile!.agent_wallet_address!

    // Spending limit enforcement
    const today = new Date().toISOString().slice(0, 10)
    let { data: agentWallet } = await supabase
      .from('agent_wallets').select('*').eq('user_id', user.id).single()

    if (!agentWallet) {
      await supabase.from('agent_wallets').insert({ user_id: user.id })
      agentWallet = { daily_limit: 5, daily_spent: 0, daily_reset_date: today }
    }

    if (agentWallet.daily_reset_date !== today) {
      await supabase.from('agent_wallets').update({ daily_spent: 0, daily_reset_date: today }).eq('user_id', user.id)
      agentWallet.daily_spent = 0
    }

    // Daily limit only tracks funds actually leaving the wallet's custody
    // (send). Swap converts the agent wallet's own balance from one token
    // to another — the money never leaves — same reasoning already applied
    // to gateway_deposit/gateway_withdraw above.
    const countsTowardLimit = walletSource === 'agent' && action.type !== 'swap'

    // On-chain limit is authoritative for agent wallet transactions
    if (countsTowardLimit) {
      const onChainLimit = await getOnChainLimit(agentWalletAddress)
      const effectiveLimit = onChainLimit ?? agentWallet.daily_limit

      const projectedSpend = agentWallet.daily_spent + amount
      if (projectedSpend > effectiveLimit) {
        const remaining = Math.max(0, effectiveLimit - agentWallet.daily_spent)
        return NextResponse.json({
          error: `Daily limit exceeded (${effectiveLimit} USDC). Remaining: ${remaining.toFixed(4)} USDC.`,
          code: 'DAILY_LIMIT_EXCEEDED',
          retryable: false,
          limitExceeded: true,
        }, { status: 402 })
      }
    }

    // Kiểm tra số dư
    const balRes = await circleClient.getWalletTokenBalance({ id: agentWalletId })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokenBalances: any[] = balRes.data?.tokenBalances ?? []

    const checkSymbol = action.type === 'send'
      ? (action.token?.toUpperCase() ?? 'USDC')
      : action.type === 'swap'
      ? (action.tokenIn?.toUpperCase() ?? 'USDC')
      : 'USDC'
    const checkTokenBal = tokenBalances.find(b => b.token?.symbol === checkSymbol)
    const agentBalance = parseFloat(checkTokenBal?.amount ?? '0')

    if (agentBalance < amount) {
      return NextResponse.json({
        error: `Insufficient Agent Wallet balance: ${agentBalance.toFixed(4)} ${checkSymbol}. Please deposit more.`,
        code: 'INSUFFICIENT_TOKEN_BALANCE',
        retryable: false,
      }, { status: 400 })
    }

    const actionDetail =
      action.type === 'send' ? `Send to ${action.to}` :
      action.type === 'swap' ? `Swap ${action.tokenIn} -> ${action.tokenOut}` :
      action.type === 'launchpad_contribute' ? `Launchpad contribute to ${action.projectId}` :
      action.type

    // On-chain validation (fire-and-forget)
    fetch(`${request.nextUrl.origin}/api/agent/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ actionType: action.type, amount, detail: actionDetail }),
    }).catch(() => {})

    let txId: string | null = null
    let txHash: string | null = null
    let amountOut: string | null = null

    if (action.type === 'send') {
      const destAddress = resolvedSendAddress!

      // Dry-run: simulate the transfer first so a bad destination, unsupported
      // token, or insufficient gas surfaces as a clean error instead of a
      // broadcast (and gas-paying) transaction that then fails on-chain.
      try {
        await circleClient.estimateTransferFee({
          walletId: agentWalletId,
          tokenId: checkTokenBal?.token?.id,
          destinationAddress: destAddress,
          amount: [amount.toString()],
        })
      } catch (e) {
        const failure = classifyTransactionError(e, { operation: 'send', token: checkSymbol })
        console.error('[agent/execute] transfer simulation failed:', e)
        return NextResponse.json(failure, { status: failure.status })
      }

      const tx = await circleClient.createTransaction({
        walletId: agentWalletId,
        tokenId: checkTokenBal?.token?.id,
        destinationAddress: destAddress,
        amount: [amount.toString()],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        idempotencyKey: crypto.randomUUID(),
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      txId = (tx.data as any)?.id ?? null

      if (txId) {
        try {
          const confirmed = await circleClient.getTransaction({ id: txId, waitForState: 'SENT', pollingInterval: 1500 })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          txHash = (confirmed.data as any)?.transaction?.txHash ?? null
        } catch { /* timeout ok */ }
      }

    } else if (action.type === 'swap') {
      const swapRes = await fetch(`${request.nextUrl.origin}/api/wallet/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tokenIn: action.tokenIn,
          tokenOut: action.tokenOut,
          amountIn: amount.toString(),
          slippageBps: 1500,
          ...(walletSource === 'agent' ? { agentIntentProof: requestedAction.intentProof } : {}),
        }),
      })
      let swapData: Record<string, unknown> = {}
      try { swapData = await swapRes.json() } catch { /* empty */ }
      if (!swapRes.ok) {
        return NextResponse.json({
          error: (swapData.error as string) ?? 'The swap could not be completed.',
          code: (swapData.code as string) ?? 'TRANSACTION_FAILED',
          retryable: Boolean(swapData.retryable),
          ...(swapData.providerCode !== undefined ? { providerCode: swapData.providerCode } : {}),
        }, { status: swapRes.status })
      }
      txId = swapData.transactionId as string
      txHash = swapData.txHash as string
      amountOut = swapData.amountOut as string

    } else if (action.type === 'launchpad_contribute') {
      const projectId: string = action.projectId ?? ''
      const { data: sale } = await supabase.from('launchpad_sales').select('project_id').eq('project_id', projectId).maybeSingle()
      if (!sale) {
        return NextResponse.json({ error: `"${projectId}" is not a live Launchpad sale.` }, { status: 404 })
      }

      const { txHash: contributeTxHash } = await contributeToSale(agentWalletId, agentWalletAddress, projectId, amount)
      txHash = contributeTxHash

      await supabase.from('launchpad_contributions').insert({
        project_id: projectId, user_id: user.id, amount, tx_hash: txHash,
      })
    }

    if (countsTowardLimit) {
      await supabase.from('agent_wallets')
        .update({ daily_spent: agentWallet.daily_spent + amount })
        .eq('user_id', user.id)
    }

    if (txHash) {
      await awardVerifiedScore(user.id, 'agent_tx', txHash)
        .catch(error => console.error('[score/agent_tx]', error))
    }

    // Cộng Miron Score sau tx thành công
    fetch(`${request.nextUrl.origin}/api/agent/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        actionType: action.type, success: true, txHash, amount,
        detail: action.type === 'send' ? `Send ${amount} ${checkSymbol} to ${action.to}` :
          action.type === 'launchpad_contribute' ? `Launchpad contribute ${amount} USDC to ${action.projectId}` :
          `Swap ${amount} ${action.tokenIn} -> ${action.tokenOut}`,
      }),
    }).catch(() => {})

    return NextResponse.json({ success: true, txId, txHash, amountOut })

  } catch (err) {
    const failure = classifyTransactionError(err)
    console.error('[agent/execute] transaction failed:', err)
    return NextResponse.json(failure, { status: failure.status })
  }
}
