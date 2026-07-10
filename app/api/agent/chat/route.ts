import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { circleClient } from '@/app/lib/circle'
import { payX402 } from '@/app/lib/x402-buyer'

const X402_DATA_FEE = 0.01 // placeholder for testnet — revisit for mainnet

interface AgentWalletRef {
  agent_wallet_id?: string | null
  agent_wallet_address?: string | null
}

/** Shared x402 data-tool caller for the newer, simpler tools (trending/defi/sentiment). */
async function callX402Tool<T>(
  origin: string,
  path: string,
  profile: AgentWalletRef | null,
  formatResult: (data: T) => string,
): Promise<{ content: string; fee: { amount: number; txHash: string | null } | null; data: T | null }> {
  if (!profile?.agent_wallet_id || !profile?.agent_wallet_address) {
    return { content: 'Data lookup unavailable: Agent Wallet not initialized. Answer using general knowledge instead.', fee: null, data: null }
  }
  try {
    const { data, txHash } = await payX402<T>(`${origin}${path}`, profile.agent_wallet_id, profile.agent_wallet_address as `0x${string}`)
    return { content: formatResult(data), fee: { amount: X402_DATA_FEE, txHash }, data }
  } catch (e) {
    return { content: `Data lookup unavailable (${e instanceof Error ? e.message : 'unknown error'}). Answer using general knowledge instead.`, fee: null, data: null }
  }
}

const MSG_COST = 0.01 // placeholder for testnet — revisit for mainnet
const TREASURY_ADDRESS = process.env.AGENT_OWNER_ADDRESS!
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

/**
 * Charge the real per-message input fee — a genuine on-chain USDC transfer,
 * not just a Supabase counter. Waits for Circle's `SENT` state (broadcast to
 * the network, same pattern already used for send/swap/deposit elsewhere in
 * this app) so we get a real on-chain txHash to link to the explorer — not
 * just Circle's internal transaction id, which isn't explorer-resolvable.
 * `SENT` is materially faster than waiting for full block confirmation.
 */
async function chargeInputFee(walletId: string, tokenId: string): Promise<string | null> {
  const res = await circleClient.createTransaction({
    walletId,
    tokenId,
    destinationAddress: TREASURY_ADDRESS,
    amount: [MSG_COST.toString()],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: crypto.randomUUID(),
  })
  const txId = (res.data as { id?: string } | undefined)?.id
  if (!txId) throw new Error('Circle did not return a transaction ID for the input fee charge')

  try {
    const confirmed = await circleClient.getTransaction({ id: txId, waitForState: 'SENT', pollingInterval: 1000 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (confirmed.data as any)?.transaction?.txHash ?? null
  } catch {
    return null // fee was still charged — just no txHash to show yet
  }
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'execute_send',
      description: 'Transfer USDC or EURC from the Agent Wallet to a recipient. Call this ONLY when the user gives a clear send command with all three: (1) an action verb like send/transfer/pay/gửi/chuyển, (2) a specific recipient (@username or 0x address), and (3) a specific numeric amount. Do NOT call for questions, advice, or when any information is missing.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient: @username or 0x wallet address' },
          amount: { type: 'string', description: 'Exact numeric amount (e.g. "5", "0.5"). Never pass "all" or "max" — ask user to confirm exact amount first.' },
          token: { type: 'string', default: 'USDC', description: 'Token symbol: USDC or EURC. Default: USDC' },
        },
        required: ['to', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_swap',
      description: 'Swap one token for another using the Agent Wallet. Call this ONLY when the user gives a clear swap command with all three: (1) an action verb like swap/exchange/convert/đổi, (2) both source and destination tokens specified, and (3) a specific numeric amount. Do NOT call for advisory questions like "should I swap?".',
      parameters: {
        type: 'object',
        properties: {
          tokenIn: { type: 'string', description: 'Token to sell: USDC or EURC' },
          tokenOut: { type: 'string', description: 'Token to buy: USDC or EURC' },
          amount: { type: 'string', description: 'Exact numeric amount of tokenIn to sell' },
        },
        required: ['tokenIn', 'tokenOut', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_gateway_deposit',
      description: 'Deposit USDC from the Agent Wallet\'s own on-chain balance into its X402 Gateway reserve (the escrow that funds pay-per-request nanopayments). Call this ONLY when the user clearly asks to top up / deposit / nạp into X402 or Gateway with a specific numeric amount. Do NOT call this for "fund/nạp cho agent" (that funds the Agent Wallet itself, a different flow).',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'string', description: 'Exact numeric amount of USDC to deposit into the X402 reserve' },
        },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_gateway_withdraw',
      description: 'Withdraw USDC from the Agent Wallet\'s X402 Gateway reserve back to its own on-chain balance (same-chain, instant). Call this ONLY when the user clearly asks to withdraw / rút from X402 or Gateway with a specific numeric amount.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'string', description: 'Exact numeric amount of USDC to withdraw from the X402 reserve' },
        },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_launchpad_contribute',
      description: 'Contribute USDC from the Agent Wallet to a live MironPay Launchpad (IDO) sale. Call this ONLY when the user clearly wants to buy/contribute/invest into a named project with a specific numeric amount, and that project appears in the "Live Launchpad sales" list above. If the project isn\'t in that list, tell the user it\'s not live instead of calling this.',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Exact projectId slug from the Live Launchpad sales list, e.g. "helios"' },
          amount: { type: 'string', description: 'Exact numeric amount of USDC to contribute' },
        },
        required: ['projectId', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_token_price',
      description: 'Fetch the live USD price, 24h change, market cap, FDV, AND a price chart for any single named token/crypto (BTC, ETH, SOL, SUI, USDC, EURC, etc.) from a real external market data provider. Costs $0.01 USDC, charged automatically from the Agent Wallet via x402 — no PIN needed. Call this whenever the user asks about a price, exchange rate, chart, biểu đồ, market cap, FDV, or market conditions for ANY SPECIFIC NAMED coin — not limited to tokens supported on ARC Testnet. This is the ONLY tool that returns a chart; get_trending_tokens does NOT. Never guess these numbers from memory. Do NOT call for simple balance/portfolio questions — those are already provided above. Do NOT call get_trending_tokens when a specific coin is named — always use get_token_price instead.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Token ticker symbol, e.g. "BTC", "ETH", "USDC"' },
        },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trending_tokens',
      description: 'Fetch the top coins trending on CoinGecko right now (most-searched, not necessarily best-performing). Costs $0.01 USDC via x402 — no PIN needed. Call this ONLY when the user asks a general question like "what\'s trending", "what coins are hot right now", with NO specific coin named. If the user names ANY specific coin (e.g. "chart of SUI", "giá SUI", "SUI thế nào") — even just by symbol — call get_token_price instead, never this tool.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_defi_data',
      description: 'Fetch real DeFi data from DeFiLlama: either a specific protocol\'s TVL (Total Value Locked) and 1d/7d change, or — if no protocol is named — the top 5 highest-APY yield pools across DeFi right now. Costs $0.01 USDC via x402 — no PIN needed. Call this when the user asks about TVL, a specific DeFi protocol, or yield/APY opportunities.',
      parameters: {
        type: 'object',
        properties: {
          protocol: { type: 'string', description: 'Protocol name, e.g. "Aave", "Uniswap". Omit to get top yield pools instead.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_sentiment',
      description: 'Fetch the real-time Crypto Fear & Greed Index (0-100, Extreme Fear to Extreme Greed). Costs $0.01 USDC via x402 — no PIN needed. Call this when the user asks about overall market mood, sentiment, or "is the market fearful/greedy right now".',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description: 'Save important user preferences or habits for future conversations, such as frequent recipients, preferred tokens, or risk tolerance.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Short memory key (e.g. preferred_token, frequent_recipient)' },
          value: { type: 'string', description: 'Value to remember' },
        },
        required: ['key', 'value'],
      },
    },
  },
]

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { message } = await request.json()
    if (!message?.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 })

    const today = new Date().toISOString().slice(0, 10)
    let { data: wallet } = await supabase.from('agent_wallets').select('*').eq('user_id', user.id).single()

    if (!wallet) {
      await supabase.from('agent_wallets').insert({ user_id: user.id })
      wallet = { balance: 0, daily_limit: 5, daily_spent: 0, daily_reset_date: today }
    }

    if (wallet.daily_reset_date !== today) {
      await supabase.from('agent_wallets').update({ daily_spent: 0, daily_reset_date: today }).eq('user_id', user.id)
      wallet.daily_spent = 0
    }

    const { data: profile } = await supabase.from('profiles').select('agent_wallet_id, agent_wallet_address, circle_wallet_id, wallet_address').eq('id', user.id).single()
    let onChainBalance = 0
    let usdcTokenId: string | undefined
    if (profile?.agent_wallet_id) {
      const balRes = await circleClient.getWalletTokenBalance({ id: profile.agent_wallet_id })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usdc = (balRes.data?.tokenBalances as any[])?.find(b => b.token?.symbol === 'USDC')
      onChainBalance = parseFloat(usdc?.amount ?? '0')
      usdcTokenId = usdc?.token?.id
    }

    if (onChainBalance < MSG_COST) {
      return NextResponse.json({ error: 'insufficient_balance', message: 'Insufficient Agent Wallet balance. Please deposit USDC.' }, { status: 402 })
    }

    if (wallet.daily_spent + MSG_COST > wallet.daily_limit) {
      return NextResponse.json({ error: 'daily_limit_exceeded', message: `Daily spending limit of ${wallet.daily_limit} USDC reached.` }, { status: 402 })
    }

    if (!profile?.agent_wallet_id || !usdcTokenId) {
      return NextResponse.json({ error: 'wallet_not_ready', message: 'Agent Wallet not initialized.' }, { status: 400 })
    }

    let msgFeeTxHash: string | null
    try {
      msgFeeTxHash = await chargeInputFee(profile.agent_wallet_id, usdcTokenId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[agent/chat] input fee charge failed:', msg)
      return NextResponse.json({ error: 'input_fee_failed', message: 'Could not charge the message fee. Please try again.' }, { status: 500 })
    }

    const { data: memories } = await supabase
      .from('agent_memory').select('key, value').eq('user_id', user.id)

    const memoryContext = memories && memories.length > 0
      ? `\n## Remembered preferences\n${memories.map(m => `- ${m.key}: ${m.value}`).join('\n')}`
      : ''

    // Load real portfolio from Circle
    let portfolioContext = 'Portfolio: unavailable.'
    if (profile?.circle_wallet_id) {
      const [mainBal, agentBal] = await Promise.all([
        circleClient.getWalletTokenBalance({ id: profile.circle_wallet_id }),
        profile.agent_wallet_id
          ? circleClient.getWalletTokenBalance({ id: profile.agent_wallet_id })
          : Promise.resolve(null),
      ])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mainTokens: any[] = mainBal.data?.tokenBalances ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agentTokens: any[] = agentBal?.data?.tokenBalances ?? []

      const mainSummary = mainTokens.map(t => `${t.token?.symbol}: ${parseFloat(t.amount).toFixed(4)}`).join(', ') || 'Empty'
      const agentSummary = agentTokens.map(t => `${t.token?.symbol}: ${parseFloat(t.amount).toFixed(4)}`).join(', ') || '0 USDC'

      portfolioContext = `## Current portfolio
Main Wallet address: ${profile.wallet_address ?? 'unknown'}
Main Wallet: ${mainSummary}
Agent Wallet: ${agentSummary}
Daily limit used: ${wallet.daily_spent.toFixed(3)} / ${wallet.daily_limit} USDC`
    }

    // Live Launchpad sales — lets the model resolve a project name to its
    // exact project_id slug for execute_launchpad_contribute.
    const { data: liveSubmissions } = await supabase
      .from('launchpad_submissions')
      .select('project_id, name, sym, target, min_contribution, cap, start_at, end_at')
      .eq('status', 'approved')
      .lte('start_at', new Date().toISOString())
      .gte('end_at', new Date().toISOString())

    const launchpadContext = liveSubmissions && liveSubmissions.length > 0
      ? `\n## Live Launchpad sales (for execute_launchpad_contribute)\n${liveSubmissions.map(s =>
          `- ${s.name} (projectId: "${s.project_id}"), $${s.sym}, target $${s.target}, per-wallet $${s.min_contribution}-$${s.cap}, ends ${s.end_at}`
        ).join('\n')}`
      : ''

    const { data: history } = await supabase
      .from('agent_messages').select('role, content')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(8)

    const historyMessages = (history ?? []).reverse().map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const { data: agentIdentity } = await supabase
      .from('miron_agent_identity').select('agent_id').single()

    const systemPrompt = `You are Miron Agent, an AI financial assistant for MironPay on ARC Testnet.${agentIdentity?.agent_id ? ` On-chain Agent ID #${agentIdentity.agent_id}.` : ''}
Reply in the same language the user writes in — Vietnamese or English.

## Tone and length
Be concise and professional — get to the point. Default to 1-3 short sentences. Never pad with filler ("As an AI...", "I'd be happy to help..."), never repeat the question back, never restate data that is already shown to the user visually (chart, table, gauge — those are called out explicitly in tool results when they apply).

${portfolioContext}${launchpadContext}${memoryContext}

## Available tokens
Only USDC and EURC can be sent or swapped — that's all that exists as a wallet balance on ARC Testnet. Never call execute_send/execute_swap for any other token.
Price lookups (get_token_price) are NOT limited to USDC/EURC — any real-world coin (BTC, ETH, SOL, etc.) can be looked up.

## How to use tools
- execute_send: use when user clearly wants to send/transfer USDC or EURC with a known recipient AND amount
- execute_swap: use when user clearly wants to swap between USDC and EURC with a known amount
- execute_gateway_deposit: use when user wants to top up / nạp the X402 reserve with a known amount
- execute_gateway_withdraw: use when user wants to withdraw / rút from the X402 reserve with a known amount
- execute_launchpad_contribute: use when user wants to buy/contribute into a named Launchpad project that's in the live sales list, with a known amount
- get_token_price: use when user asks the price/rate/chart of ANY specific named coin, including ones not supported for send/swap on ARC. This is also the ONLY way to show a chart — "chart of X" / "biểu đồ X" always means get_token_price with symbol=X, NEVER get_trending_tokens.
- get_trending_tokens: use ONLY for a general "what's trending" question with no specific coin named — never when a coin symbol/name appears in the message
- save_memory: use when user shares a preference or habit worth remembering
- When any required info is missing, ask ONE concise question — never guess or fill in blanks
- A message that is JUST a 0x address or contract, with no verb and no amount, is NEVER a send/swap/deposit command — never invent an amount (e.g. "1") to make a tool call fit. Ask the user what they want to do with that address (e.g. "look up this token, or send funds to it? If sending, how much?").
- Money-moving tools only fire on an explicit, unambiguous instruction from the user (action + amount + recipient, all stated by them, not inferred). The user is responsible for stating commands clearly — if their message is vague, partial, or could be read multiple ways, you must ask instead of guessing, no matter how "obvious" the likely intent seems.

## Disambiguation rules
- "all" / "hết" / "max" → ask user to confirm the exact amount from their balance
- "$" / "đô" / "dollar" → USDC. "euro" / "eur" → EURC
- "10k" / "10 ngàn" → 10000. "1m" / "1 triệu" → 1000000
- Questions like "should I swap?" or "what's my balance?" → answer in text only, no tool call
- "withdraw to main wallet" / "rút về ví chính" → execute_send to Main Wallet address above
- "fund agent" / "nạp cho agent" → tell user to use the Deposit button in the UI (this funds the Agent Wallet itself, not X402)
- "nạp/deposit vào X402/Gateway" / "top up X402" → execute_gateway_deposit
- "rút/withdraw từ X402/Gateway" → execute_gateway_withdraw

## Wallets
- Agent Wallet: default for all transactions (gasless, no PIN needed)
- Main Wallet: user must say "main wallet" / "ví chính" explicitly — server enforces PIN

## When calling a tool
Reply with a short confirmation that the action is a draft awaiting confirmation, e.g.:
"Ready to send 5 USDC to @alice from Agent Wallet. Confirm below to proceed."
Never claim the transaction is done or already in progress — the system will show the real result after the user confirms.`

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: message },
    ]

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 1024,
        temperature: 0.2,
      }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      console.error('[agent/chat] Groq error', groqRes.status, ':', errText.slice(0, 300))
      const groqErr = (() => { try { return JSON.parse(errText) } catch { return null } })()
      const detail = groqErr?.error?.message ?? groqErr?.message ?? `HTTP ${groqRes.status}`
      return NextResponse.json({ error: `AI error: ${detail}` }, { status: 500 })
    }

    const groqData = await groqRes.json()
    const choice = groqData.choices?.[0]
    const assistantMsg = choice?.message

    let reply = ''
    let action: Record<string, string> | null = null
    let dataFee: { amount: number; txHash: string | null } | null = null
    let tokenChart: { symbol: string; points: Array<[number, number]> } | null = null
    let trendingData: { coins: Array<{ symbol: string; name: string; market_cap_rank: number | null; price_usd: number | null; change_24h_pct: number | null }> } | null = null
    let defiData:
      | { mode: 'protocol'; name: string; category: string | null; chains: string[]; tvl_usd: number | null; change_1d_pct: number | null; change_7d_pct: number | null }
      | { mode: 'top_yield'; pools: Array<{ project: string; symbol: string; chain: string; apy_pct: number; tvl_usd: number }> }
      | null = null
    let sentimentData: { value: number; classification: string } | null = null

    // Does the user's RAW text contain a standalone number the model could
    // legitimately have read as an amount? Strips 0x addresses and @handles
    // first, since a hex address is full of digits but is never an amount.
    // This is a hard server-side check the model cannot talk its way around —
    // it exists because the model can otherwise hallucinate a tool call (and
    // an amount) from something as bare as a pasted contract address.
    function hasExplicitAmount(raw: string): boolean {
      const stripped = raw.replace(/0x[a-fA-F0-9]+/g, ' ').replace(/@\w+/g, ' ')
      return /\b\d+(\.\d+)?\b/.test(stripped)
    }
    const SEND_VERBS = ['send', 'transfer', 'pay', 'gửi', 'gui', 'chuyển', 'chuyen']
    const SWAP_VERBS = ['swap', 'exchange', 'convert', 'đổi', 'doi']
    const DEPOSIT_VERBS = ['deposit', 'top up', 'topup', 'nạp', 'nap']
    const WITHDRAW_VERBS = ['withdraw', 'rút', 'rut']
    const CONTRIBUTE_VERBS = ['contribute', 'buy', 'invest', 'mua', 'góp', 'gop', 'đầu tư', 'dau tu']
    function hasAnyKeyword(raw: string, keywords: string[]): boolean {
      const lower = raw.toLowerCase()
      return keywords.some(k => lower.includes(k))
    }

    if (choice?.finish_reason === 'tool_calls' && assistantMsg?.tool_calls?.length > 0) {
      for (const toolCall of assistantMsg.tool_calls) {
        const fnName = toolCall.function?.name
        let args: Record<string, string> = {}
        try { args = JSON.parse(toolCall.function?.arguments ?? '{}') } catch { /* skip */ }

        // Server-side main wallet detection — model cannot override this
        const lowerMsg = message.toLowerCase()
        const isMain = ['ví chính', 'vi chinh', 'main wallet', 'my wallet', 'ví của tôi',
          'vi cua toi', 'ví user', 'vi user', 'từ ví chính', 'tu vi chinh'].some(k => lowerMsg.includes(k))
        const walletSource = isMain ? 'main' : 'agent'

        // Guard shared by every money-moving tool: refuse to propose a
        // transaction unless the raw message actually contains the signal
        // the model claims justified it. A pasted address alone is never
        // enough — this is what stops the model from turning "here's a
        // contract address" into a fabricated $1 transfer.
        const moneyToolGuards: Partial<Record<string, () => string | null>> = {
          execute_send: () => !hasAnyKeyword(message, SEND_VERBS) ? 'no send verb in the user message'
            : !hasExplicitAmount(message) ? 'no explicit amount in the user message' : null,
          execute_swap: () => !hasAnyKeyword(message, SWAP_VERBS) ? 'no swap verb in the user message'
            : !hasExplicitAmount(message) ? 'no explicit amount in the user message' : null,
          execute_gateway_deposit: () => !hasAnyKeyword(message, DEPOSIT_VERBS) ? 'no deposit verb in the user message'
            : !hasExplicitAmount(message) ? 'no explicit amount in the user message' : null,
          execute_gateway_withdraw: () => !hasAnyKeyword(message, WITHDRAW_VERBS) ? 'no withdraw verb in the user message'
            : !hasExplicitAmount(message) ? 'no explicit amount in the user message' : null,
          execute_launchpad_contribute: () => !hasAnyKeyword(message, CONTRIBUTE_VERBS) ? 'no contribute verb in the user message'
            : !hasExplicitAmount(message) ? 'no explicit amount in the user message' : null,
        }
        const guard = moneyToolGuards[fnName]
        const blockReason = guard?.()
        if (blockReason) {
          console.warn(`[agent/chat] blocked hallucinated tool call ${fnName} (${blockReason}):`, message.slice(0, 200))
          reply = "I won't guess on money-moving actions. Please state the action (send/swap/deposit/etc), the exact amount, and the recipient explicitly — I'll draft it for you to confirm once your instruction is unambiguous."
          continue
        }

        if (fnName === 'execute_send') {
          action = { type: 'send', to: args.to, amount: args.amount, token: args.token ?? 'USDC', walletSource }
          reply = isMain
            ? `🔒 Main Wallet — PIN required\nReady to send ${args.amount} ${args.token ?? 'USDC'} to ${args.to}. Confirm below to proceed.`
            : `Ready to send ${args.amount} ${args.token ?? 'USDC'} to ${args.to} from Agent Wallet (${onChainBalance.toFixed(2)} USDC). Confirm below to proceed.`
        } else if (fnName === 'execute_swap') {
          action = { type: 'swap', tokenIn: args.tokenIn, tokenOut: args.tokenOut, amount: args.amount, walletSource }
          reply = isMain
            ? `🔒 Main Wallet — PIN required\nReady to swap ${args.amount} ${args.tokenIn} → ${args.tokenOut}. Confirm below to proceed.`
            : `Ready to swap ${args.amount} ${args.tokenIn} → ${args.tokenOut} from Agent Wallet. Confirm below to proceed.`
        } else if (fnName === 'execute_gateway_deposit') {
          action = { type: 'gateway_deposit', amount: args.amount }
          reply = `Ready to deposit ${args.amount} USDC into the X402 reserve. Confirm below to proceed.`
        } else if (fnName === 'execute_gateway_withdraw') {
          action = { type: 'gateway_withdraw', amount: args.amount }
          reply = `Ready to withdraw ${args.amount} USDC from the X402 reserve. Confirm below to proceed.`
        } else if (fnName === 'execute_launchpad_contribute') {
          action = { type: 'launchpad_contribute', projectId: args.projectId, amount: args.amount }
          reply = `Ready to contribute ${args.amount} USDC to ${args.projectId} sale from Agent Wallet. Confirm below to proceed.`
        } else if (fnName === 'get_token_price') {
          let toolResultContent: string
          const symbol = (args.symbol ?? '').trim()
          if (!symbol) {
            toolResultContent = 'Ask the user which token symbol they mean.'
          } else if (!profile?.agent_wallet_id || !profile?.agent_wallet_address) {
            toolResultContent = 'Price lookup unavailable: Agent Wallet not initialized. Answer using general knowledge instead.'
          } else {
            try {
              const origin = request.nextUrl.origin
              const { data, txHash } = await payX402<{
                symbol: string; name: string; price_usd: number; change_24h_pct: number | null
                market_cap_usd: number | null; fdv_usd: number | null
                circulating_supply: number | null; max_supply: number | null
                description: string | null; categories: string[]; sentiment_up_pct: number | null
                twitter_followers: number | null; github_stars: number | null; github_commits_4w: number | null
                chart_24h: Array<[number, number]>
              }>(
                `${origin}/api/x402/market-data?symbol=${encodeURIComponent(symbol)}`,
                profile.agent_wallet_id,
                profile.agent_wallet_address as `0x${string}`,
              )
              dataFee = { amount: X402_DATA_FEE, txHash }
              if (data.chart_24h?.length > 1) tokenChart = { symbol: data.symbol, points: data.chart_24h }
              toolResultContent = `Full live data for ${data.name} (${data.symbol}), paid $${X402_DATA_FEE} USDC via x402 — `
                + `price_usd=${data.price_usd}, change_24h_pct=${data.change_24h_pct}, `
                + `market_cap_usd=${data.market_cap_usd}, fdv_usd=${data.fdv_usd}, `
                + `circulating_supply=${data.circulating_supply}, max_supply=${data.max_supply}, `
                + `categories=[${(data.categories ?? []).join(', ')}], sentiment_up_pct=${data.sentiment_up_pct}, `
                + `twitter_followers=${data.twitter_followers}, github_commits_4w=${data.github_commits_4w}, github_stars=${data.github_stars}, `
                + `description="${data.description ?? ''}". `
                + `IMPORTANT — reply rules:\n`
                + `1. Re-read the user's exact question: "${message}". Answer EVERY metric they explicitly named (price, market cap, FDV, supply, sentiment, etc.) — if they named two things, report both. If they only asked for price with no other metric named, reply with ONLY price + 24h change in ONE short sentence and do not volunteer market cap/FDV/other stats.\n`
                + `2. Never mix a currency symbol with a word-based unit in the same number (e.g. never write "$3.08 tỷ USD" or "$3.08 billion USD"). Pick ONE style consistent with the reply language: "$3.08B" in English, or "3,08 tỷ USD" in Vietnamese — never both together.\n`
                + `3. An interactive price chart (with 1H/4H/24H range buttons) is ALREADY displayed to the user right below your reply — you DO have chart capability, it's just rendered as a UI widget, not text. If the user asked for a chart, confirm briefly (e.g. "Đây là biểu đồ giá ${data.symbol}, bạn có thể đổi khung 1H/4H/24H bên dưới") — never say you cannot provide a chart or suggest checking another website.\n`
                + `4. Do not mention team members or funding rounds — not available from this data source; say so plainly if asked.\n`
                + `5. Use ONLY the numbers above — never estimate or guess.`
            } catch (e) {
              const errMsg = e instanceof Error ? e.message : String(e)
              console.error(`[agent/chat] get_token_price("${symbol}") failed:`, errMsg)
              toolResultContent = `Live price lookup for "${symbol}" failed (${errMsg}) — no fee was charged for this failed attempt. Tell the user plainly that the live data lookup failed right now and to try again in a moment. Do NOT guess a price from memory — crypto prices go stale in minutes and a wrong number is worse than admitting the lookup failed.`
            }
          }
          const secondMessages = [
            ...messages,
            assistantMsg,
            { role: 'tool', tool_call_id: toolCall.id, content: toolResultContent },
          ]
          const secondRes = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
            body: JSON.stringify({ model: GROQ_MODEL, messages: secondMessages, max_tokens: 512, temperature: 0.2 }),
          })
          if (secondRes.ok) {
            const d = await secondRes.json()
            reply = d.choices?.[0]?.message?.content ?? ''
          }
        } else if (fnName === 'get_trending_tokens') {
          const origin = request.nextUrl.origin
          const { content, fee, data: rawData } = await callX402Tool<{
            coins: Array<{ symbol: string; name: string; market_cap_rank: number | null; price_usd: number | null; change_24h_pct: number | null }>
          }>(origin, '/api/x402/trending', profile, (data) =>
            `Trending tokens (CoinGecko, paid $${X402_DATA_FEE} via x402): `
            + data.coins.map(c => `${c.name} (${c.symbol})`).join(', ')
            + `. A table with full details (price, 24h change, rank) is ALREADY shown to the user below — reply in ONE short sentence naming 2-3 highlights, do not repeat the full list or exact numbers, do not say you cannot show a table.`)
          if (fee) dataFee = fee
          if (rawData) trendingData = rawData

          const secondMessages = [...messages, assistantMsg, { role: 'tool', tool_call_id: toolCall.id, content }]
          const secondRes = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
            body: JSON.stringify({ model: GROQ_MODEL, messages: secondMessages, max_tokens: 512, temperature: 0.2 }),
          })
          if (secondRes.ok) reply = (await secondRes.json()).choices?.[0]?.message?.content ?? ''
        } else if (fnName === 'get_defi_data') {
          const origin = request.nextUrl.origin
          const protocol = (args.protocol ?? '').trim()
          const path = protocol ? `/api/x402/defi?protocol=${encodeURIComponent(protocol)}` : '/api/x402/defi'
          const { content, fee, data: rawData } = await callX402Tool<
            | { mode: 'protocol'; name: string; category: string | null; chains: string[]; tvl_usd: number | null; change_1d_pct: number | null; change_7d_pct: number | null }
            | { mode: 'top_yield'; pools: Array<{ project: string; symbol: string; chain: string; apy_pct: number; tvl_usd: number }> }
          >(origin, path, profile, (data) => {
            if (data.mode === 'protocol') {
              return `DeFiLlama data for ${data.name} (paid $${X402_DATA_FEE} via x402): TVL=$${data.tvl_usd}, category=${data.category}, `
                + `chains=[${data.chains.join(', ')}], 1d change=${data.change_1d_pct}%, 7d change=${data.change_7d_pct}%. `
                + `A stat card with these numbers is ALREADY shown to the user below — reply in ONE short sentence, do not repeat every number.`
            }
            return `Top yield pools (DeFiLlama, paid $${X402_DATA_FEE} via x402): `
              + data.pools.map(p => `${p.project} ${p.symbol} on ${p.chain} (${p.apy_pct}% APY)`).join(', ')
              + `. A table with full details (APY, TVL) is ALREADY shown to the user below — reply in ONE short sentence, mention smart-contract/impermanent-loss risk briefly, never guarantee returns, do not repeat the full list.`
          })
          if (fee) dataFee = fee
          if (rawData) defiData = rawData

          const secondMessages = [...messages, assistantMsg, { role: 'tool', tool_call_id: toolCall.id, content }]
          const secondRes = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
            body: JSON.stringify({ model: GROQ_MODEL, messages: secondMessages, max_tokens: 512, temperature: 0.2 }),
          })
          if (secondRes.ok) reply = (await secondRes.json()).choices?.[0]?.message?.content ?? ''
        } else if (fnName === 'get_market_sentiment') {
          const origin = request.nextUrl.origin
          const { content, fee, data: rawData } = await callX402Tool<{ value: number; classification: string }>(
            origin, '/api/x402/sentiment', profile, (data) =>
              `Crypto Fear & Greed Index (paid $${X402_DATA_FEE} via x402): ${data.value}/100 — "${data.classification}". `
              + `A gauge with this value is ALREADY shown to the user below — reply in ONE short sentence, do not repeat the number redundantly or describe the gauge.`)
          if (fee) dataFee = fee
          if (rawData) sentimentData = rawData

          const secondMessages = [...messages, assistantMsg, { role: 'tool', tool_call_id: toolCall.id, content }]
          const secondRes = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
            body: JSON.stringify({ model: GROQ_MODEL, messages: secondMessages, max_tokens: 512, temperature: 0.2 }),
          })
          if (secondRes.ok) reply = (await secondRes.json()).choices?.[0]?.message?.content ?? ''
        } else if (fnName === 'save_memory') {
          await supabase.from('agent_memory').upsert(
            { user_id: user.id, key: args.key, value: args.value, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,key' }
          )
          const secondMessages = [
            ...messages,
            assistantMsg,
            { role: 'tool', tool_call_id: toolCall.id, content: `Saved: ${args.key} = ${args.value}` },
          ]
          const secondRes = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
            body: JSON.stringify({ model: GROQ_MODEL, messages: secondMessages, max_tokens: 512, temperature: 0.2 }),
          })
          if (secondRes.ok) {
            const d = await secondRes.json()
            reply = d.choices?.[0]?.message?.content ?? ''
          }
        }
      }
    } else {
      reply = assistantMsg?.content ?? "Sorry, I didn't understand. Please try again."
    }

    // Explicit timestamps, 1ms apart — inserting both rows in the same
    // statement gives them an identical DB-generated created_at, and Postgres
    // doesn't guarantee insertion order for ties when sorting, which was
    // flipping user/assistant order on reload.
    const userTs = new Date()
    const assistantTs = new Date(userTs.getTime() + 1)

    await Promise.all([
      supabase.from('agent_messages').insert([
        { user_id: user.id, role: 'user', content: message, cost: MSG_COST, input_fee_tx_hash: msgFeeTxHash, created_at: userTs.toISOString() },
        {
          user_id: user.id, role: 'assistant', content: reply, cost: 0,
          data_fee_amount: dataFee?.amount ?? null,
          data_fee_tx_hash: dataFee?.txHash ?? null,
          chart_symbol: tokenChart?.symbol ?? null,
          chart_points: tokenChart?.points ?? null,
          trending_data: trendingData,
          defi_data: defiData,
          sentiment_data: sentimentData,
          created_at: assistantTs.toISOString(),
        },
      ]),
      supabase.from('agent_wallets').update({
        daily_spent: wallet.daily_spent + MSG_COST,
      }).eq('user_id', user.id),
    ])

    return NextResponse.json({
      reply, action, cost: MSG_COST, balance_after: onChainBalance - MSG_COST,
      input_fee_tx_hash: msgFeeTxHash,
      data_fee: dataFee,
      token_chart: tokenChart,
      trending_data: trendingData,
      defi_data: defiData,
      sentiment_data: sentimentData,
    })

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[agent/chat]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
