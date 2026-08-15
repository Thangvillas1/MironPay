import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { circleClient } from '@/app/lib/circle'
import { payX402 } from '@/app/lib/x402-buyer'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'
import { VERIFIED_SYMBOLS } from '@/app/lib/token-meta'
import { TOKEN_USD_PRICE } from '@/app/lib/types'
import {
  extractExplicitSendRecipient,
  isEvmAddress,
  isMironUsername,
  issueAgentIntent,
  validateAgentIntent,
  type AgentAction,
} from '@/app/lib/agent-intent'

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
    return { content: formatResult(data), fee: txHash ? { amount: X402_DATA_FEE, txHash } : null, data }
  } catch (e) {
    return { content: `Data lookup unavailable (${e instanceof Error ? e.message : 'unknown error'}). Answer using general knowledge instead.`, fee: null, data: null }
  }
}

const MSG_COST = 0.01 // placeholder for testnet — revisit for mainnet
const TREASURY_ADDRESS = process.env.AGENT_OWNER_ADDRESS!
// TEMP (2026-07-18): the per-message on-chain fee charge (chargeInputFee)
// waits for Circle to confirm a real transaction before every single chat
// reply, adding noticeable latency to every message. Disabled until mainnet
// — flip back to true to re-enable the real charge + balance/limit gating.
const CHARGE_MESSAGE_FEE = false

// Repeated price lookups for the same symbol within this window are served
// from here instead of re-running the full x402 payment (Gateway funding
// check + Circle signTypedData + settle) and re-hitting CoinGecko's
// rate-limited free tier — that round trip is the main source of flaky
// repeat queries. Per-instance only (no cross-instance store needed for a
// 40s window); Fluid Compute keeps instances warm enough for this to help
// in practice.
const PRICE_CACHE_TTL_MS = 40_000
type CachedPrice = {
  data: {
    symbol: string; name: string; price_usd: number; change_24h_pct: number | null
    market_cap_usd: number | null; fdv_usd: number | null
    circulating_supply: number | null; max_supply: number | null
    description: string | null; categories: string[]; sentiment_up_pct: number | null
    twitter_followers: number | null; github_stars: number | null; github_commits_4w: number | null
    chart_24h: Array<[number, number]>
  }
  expiresAt: number
}
const priceCache = new Map<string, CachedPrice>()
const GROQ_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
const GROQ_MODEL = 'gemini-3.6-flash'

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
          token: { type: 'string', enum: ['USDC', 'EURC'], description: 'Token symbol explicitly written by the user: USDC or EURC. Never infer a default.' },
        },
        required: ['to', 'amount', 'token'],
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
      name: 'get_swap_quote',
      description: 'Get a real swap route quote via KyberSwap Aggregator (best route across DEXs, output value, gas cost) for any two tokens on a supported chain. RESEARCH/COMPARISON ONLY — this never executes a swap and is completely separate from execute_swap (which only runs on ARC via MironPay\'s own Agent Wallet). Call this when the user asks "how much would I get if I swapped X for Y" for a token pair or chain execute_swap doesn\'t support. Costs $0.01 USDC via x402.',
      parameters: {
        type: 'object',
        properties: {
          tokenIn: { type: 'string', description: 'Symbol (well-known ones like USDC/USDT/DAI/WETH/WBTC/ETH) or contract address of the token being sold.' },
          tokenOut: { type: 'string', description: 'Symbol or contract address of the token being bought.' },
          amount: { type: 'string', description: 'Amount of tokenIn to quote, in human units (e.g. "1000" not wei).' },
          chain: { type: 'string', enum: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base', 'bsc', 'avalanche'], description: 'Chain to quote on. Defaults to ethereum if not stated.' },
        },
        required: ['tokenIn', 'tokenOut', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_dex_pair_data',
      description: 'Fetch real on-chain DEX pair data (price, liquidity, 24h volume/change) for a token, sorted by liquidity — via DexScreener/GeckoTerminal, across any chain, not just ARC. Different from get_token_price (aggregate CEX-style spot price): use this when the user asks specifically about a DEX/pool/liquidity/on-chain price for a token. Costs $0.01 USDC via x402 — no PIN needed.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Token symbol, name, or contract address to search DEX pairs for, e.g. "PEPE", "0xC02aaA...".' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_defi_data',
      description: 'Fetch real DeFi data from DeFiLlama. Three modes: (1) protocol + metric="tvl" (or metric omitted) → that protocol\'s TVL and 1d/7d change; (2) protocol + metric="yield" → that protocol\'s own top APY pools; (3) no protocol → top 5 highest-APY yield pools across ALL of DeFi. Costs $0.01 USDC via x402 — no PIN needed.',
      parameters: {
        type: 'object',
        properties: {
          protocol: { type: 'string', description: 'Protocol name, e.g. "Aave", "Uniswap". Omit to get top yield pools across all of DeFi instead.' },
          metric: { type: 'string', enum: ['tvl', 'yield'], description: 'Only meaningful when protocol is set. Use "yield" when the user asks for APY/yield/interest rate FOR that named protocol (e.g. "top APY on Aave"). Use "tvl" (or omit) for TVL/size/change questions about that protocol.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_wallet_lookup',
      description: 'Look up token holdings for a THIRD-PARTY wallet address across major EVM chains (Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche, Fantom) via CoinStats — does NOT cover ARC Testnet. READ-ONLY RESEARCH ONLY — this never sends, swaps, or moves funds, and is unrelated to execute_send/execute_swap. Costs $0.01 USDC via x402. Call this ONLY when the user pastes/names a specific 0x... address that is not their own MironPay wallet. NEVER call this for "what\'s my balance" / "check my balance" — the user\'s own MironPay balance is already given to you above in "Current portfolio"; answer from that in text only, no tool call (and it would return empty here anyway since this tool doesn\'t support ARC).',
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'The wallet address to look up, e.g. "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045".' },
        },
        required: ['address'],
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
      name: 'get_stablecoin_data',
      description: 'Fetch real stablecoin data from DeFiLlama: either the top 8 stablecoins by market cap and their current peg price, or — if a specific stablecoin symbol/name is named — that one\'s peg price and market cap. Costs $0.01 USDC via x402 — no PIN needed. Call this when the user asks about a stablecoin\'s peg, de-peg risk, or market cap (e.g. USDT, USDC, DAI).',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Stablecoin symbol or name, e.g. "USDT", "DAI". Omit to get the top stablecoins by market cap instead.' },
        },
        required: [],
      },
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
    // circle_wallet_id on profiles can be null for legacy users — resolve (and backfill)
    // it the same way the Wallet page does, so agent chat sees the same Main Wallet balance.
    const resolvedMainWallet = await resolveCircleWalletId(supabase, user.id)
    let onChainBalance = 0
    let usdcTokenId: string | undefined
    if (profile?.agent_wallet_id) {
      const balRes = await circleClient.getWalletTokenBalance({ id: profile.agent_wallet_id })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usdc = (balRes.data?.tokenBalances as any[])?.find(b => b.token?.symbol === 'USDC')
      onChainBalance = parseFloat(usdc?.amount ?? '0')
      usdcTokenId = usdc?.token?.id
    }

    if (CHARGE_MESSAGE_FEE && onChainBalance < MSG_COST) {
      return NextResponse.json({ error: 'insufficient_balance', message: 'Insufficient Agent Wallet balance. Please deposit USDC.' }, { status: 402 })
    }

    if (CHARGE_MESSAGE_FEE && wallet.daily_spent + MSG_COST > wallet.daily_limit) {
      return NextResponse.json({ error: 'daily_limit_exceeded', message: `Daily spending limit of ${wallet.daily_limit} USDC reached.` }, { status: 402 })
    }

    if (!profile?.agent_wallet_id || !usdcTokenId) {
      return NextResponse.json({ error: 'wallet_not_ready', message: 'Agent Wallet not initialized.' }, { status: 400 })
    }

    // Validate an explicitly typed send recipient before asking for any other
    // missing field. This keeps a partial command such as "send USDC to @name"
    // from becoming a multi-step flow that only discovers a bad recipient at
    // the very end. Invalid recipient checks are not charged as Agent messages.
    const preflightRecipient = extractExplicitSendRecipient(message)
    if (preflightRecipient) {
      const normalizedMessage = message.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
      const replyInVietnamese = /\b(?:gui|chuyen|cho)\b/.test(normalizedMessage)
      let recipientAddress: string | null = null
      let recipientError: string | null = null

      if (preflightRecipient.startsWith('@')) {
        if (!isMironUsername(preflightRecipient)) {
          recipientError = replyInVietnamese
            ? `${preflightRecipient} không phải username MironPay hợp lệ.`
            : `${preflightRecipient} is not a valid MironPay username.`
        } else {
          const { data: resolvedAddress, error: resolveError } = await supabase.rpc('resolve_username', {
            p_username: preflightRecipient.slice(1).toLowerCase(),
          })
          if (resolveError) {
            console.error('[agent/chat] recipient preflight failed:', resolveError.message)
            recipientError = replyInVietnamese
              ? 'Chưa thể kiểm tra người nhận lúc này. Vui lòng thử lại.'
              : 'The recipient could not be verified right now. Please try again.'
          } else if (!resolvedAddress) {
            recipientError = replyInVietnamese
              ? `${preflightRecipient} không tồn tại trên MironPay.`
              : `${preflightRecipient} was not found on MironPay.`
          } else {
            recipientAddress = resolvedAddress
          }
        }
      } else if (!isEvmAddress(preflightRecipient)) {
        recipientError = replyInVietnamese
          ? `Địa chỉ ví ${preflightRecipient} không hợp lệ.`
          : `Wallet address ${preflightRecipient} is invalid.`
      } else {
        recipientAddress = preflightRecipient
      }

      const usesMainWallet = [
        'vi chinh', 'main wallet', 'my wallet', 'vi cua toi',
        'vi user', 'tu vi chinh',
      ].some(keyword => normalizedMessage.includes(keyword))
      const sourceAddress = usesMainWallet
        ? resolvedMainWallet?.walletAddress
        : profile.agent_wallet_address
      if (!recipientError && recipientAddress && sourceAddress
        && recipientAddress.toLowerCase() === sourceAddress.toLowerCase()) {
        recipientError = replyInVietnamese
          ? 'Không thể gửi tiền về chính ví nguồn.'
          : 'The recipient is the same as the source wallet. Self-transfers are not allowed.'
      }

      if (recipientError) {
        const userTs = new Date()
        const assistantTs = new Date(userTs.getTime() + 1)
        await supabase.from('agent_messages').insert([
          { user_id: user.id, role: 'user', content: message, cost: 0, created_at: userTs.toISOString() },
          { user_id: user.id, role: 'assistant', content: recipientError, cost: 0, created_at: assistantTs.toISOString() },
        ])
        return NextResponse.json({
          reply: recipientError,
          action: null,
          cost: 0,
          balance_after: onChainBalance,
          input_fee_tx_hash: null,
          data_fee: null,
        })
      }
    }

    let msgFeeTxHash: string | null = null
    if (CHARGE_MESSAGE_FEE) {
      try {
        msgFeeTxHash = await chargeInputFee(profile.agent_wallet_id, usdcTokenId)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[agent/chat] input fee charge failed:', msg)
        return NextResponse.json({ error: 'input_fee_failed', message: 'Could not charge the message fee. Please try again.' }, { status: 500 })
      }
    }

    const { data: memories } = await supabase
      .from('agent_memory').select('key, value').eq('user_id', user.id)

    const memoryContext = memories && memories.length > 0
      ? `\n## Remembered preferences\n${memories.map(m => `- ${m.key}: ${m.value}`).join('\n')}`
      : ''

    // Set whenever a data fetch fails — surfaced as a fixed banner on the
    // reply, not left to the model's discretion to mention (it's inconsistent
    // about admitting a fetch failed vs. quietly answering from training data
    // or, worse, from a stale number left over in its own chat history).
    let dataApiError: string | null = null

    // Load real portfolio from Circle
    let portfolioContext = 'Portfolio: unavailable.'
    if (resolvedMainWallet) {
      try {
        const [mainBal, agentBal] = await Promise.all([
          circleClient.getWalletTokenBalance({ id: resolvedMainWallet.circleWalletId }),
          profile?.agent_wallet_id
            ? circleClient.getWalletTokenBalance({ id: profile.agent_wallet_id })
            : Promise.resolve(null),
        ])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mainTokens: any[] = mainBal.data?.tokenBalances ?? []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const agentTokens: any[] = agentBal?.data?.tokenBalances ?? []

        // Spoofed/spam tokens on-chain reuse a real symbol (e.g. "EURC") with an
        // absurd fake balance to trick balance displays. No real MironPay wallet
        // holds anything close to this on ARC Testnet — drop it before it ever
        // reaches the model instead of relying on the model to catch it.
        const SANE_MAX_BALANCE = 1_000_000
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dropSpam = (tokens: any[]) => tokens.filter(t => parseFloat(t.amount ?? '0') <= SANE_MAX_BALANCE)

        // Verified tokens first, then by USD value (fixed peg price where known)
        // descending — same ordering already used on the Wallet page's asset
        // list, so the chat answer's line order matches what's on screen.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sortTokens = (tokens: any[]) => [...tokens].sort((a, b) => {
          const aVerified = VERIFIED_SYMBOLS.has(a.token?.symbol)
          const bVerified = VERIFIED_SYMBOLS.has(b.token?.symbol)
          if (aVerified !== bVerified) return aVerified ? -1 : 1
          const aValue = parseFloat(a.amount ?? '0') * (TOKEN_USD_PRICE[a.token?.symbol] ?? 0)
          const bValue = parseFloat(b.amount ?? '0') * (TOKEN_USD_PRICE[b.token?.symbol] ?? 0)
          return bValue - aValue
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formatLines = (tokens: any[]) => sortTokens(dropSpam(tokens)).map(t => `  - ${t.token?.symbol}: ${parseFloat(t.amount).toFixed(4)}`).join('\n')

        const mainSummary = formatLines(mainTokens) || '  - Empty'
        const agentSummary = formatLines(agentTokens) || '  - 0 USDC'

        portfolioContext = `## Current portfolio
Main Wallet address: ${resolvedMainWallet.walletAddress}
Main Wallet (tokens already ordered verified-first, highest value first — reproduce this exact order, one per line):
${mainSummary}
Agent Wallet address: ${profile?.agent_wallet_address ?? 'not initialized'}
Agent Wallet (same ordering):
${agentSummary}
Daily limit used: ${wallet.daily_spent.toFixed(3)} / ${wallet.daily_limit} USDC`
      } catch (e) {
        console.error('[agent/chat] portfolio fetch from Circle failed:', e instanceof Error ? e.message : e)
        dataApiError = `Could not fetch live wallet balances (${e instanceof Error ? e.message : 'unknown error'}).`
      }
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
Reply language: if the CURRENT message clearly is one identifiable language, reply in that language — this always wins, regardless of what earlier turns were in (e.g. don't switch to Vietnamese just because an earlier message in this chat was Vietnamese, if the current message is clearly in English). Only when the current message itself is ambiguous (too short, mixed languages, or language can't be determined) — as a tiebreaker, look at the last 5 messages in the conversation history: if 2 or more of them are in the same non-English language (Vietnamese or any other), reply in that language. Otherwise, default to English.

## Tone and length
Be concise and professional — get to the point. Default to 1-3 short sentences. Never pad with filler ("As an AI...", "I'd be happy to help..."), never repeat the question back, never restate data that is already shown to the user visually (chart, table, gauge — those are called out explicitly in tool results when they apply).

${portfolioContext}${launchpadContext}${memoryContext}

## Available tokens
Only USDC and EURC can be sent or swapped — that's all that exists as a wallet balance on ARC Testnet. Never call execute_send/execute_swap for any other token.
Price lookups (get_token_price) are NOT limited to USDC/EURC — any real-world coin (BTC, ETH, SOL, etc.) can be looked up.

## How to use tools
Each tool's own description below states exactly when to call it — follow those, don't guess beyond them.
- When any required info is missing, ask ONE concise question — never guess or fill in blanks
- A message that is JUST a 0x address or contract, with no verb and no amount, is NEVER a send/swap/deposit command — never invent an amount (e.g. "1") to make a tool call fit. Ask the user what they want to do with that address (e.g. "look up this token, or send funds to it? If sending, how much?").
- Money-moving tools only fire on an explicit, unambiguous instruction from the user (action + amount + recipient, all stated by them, not inferred). The user is responsible for stating commands clearly — if their message is vague, partial, or could be read multiple ways, you must ask instead of guessing, no matter how "obvious" the likely intent seems.
- For sends, the CURRENT message must explicitly contain the amount, token (USDC or EURC), and recipient. Never reuse any of those fields from conversation history.
- For swaps, the CURRENT message must explicitly contain the amount and both token symbols. Never default a missing token to USDC.

## Disambiguation rules
- "all" / "hết" / "max" → ask user to confirm the exact amount from their balance
- "$" / "đô" / "dollar" → USDC. "euro" / "eur" → EURC
- "10k" / "10 ngàn" → 10000. "1m" / "1 triệu" → 1000000
- Questions like "should I swap?" → answer in text only, no tool call
- "what's my balance?" / "số dư của tôi" / "check số dư" (no wallet specified) → answer in text only, NEVER call get_token_price or any other tool for this, and ALWAYS report BOTH wallets by name from "Current portfolio" above — Main Wallet (with every token held, not just USDC) AND Agent Wallet — never just one. If the user's wording clearly names only one wallet ("agent wallet balance", "số dư ví agent"), report only that one. Wallet balances (how many USDC/EURC you hold) and token prices (what 1 USDC/EURC is worth) are different questions — a balance question never needs a price lookup.
- Format balance/portfolio answers as: bold wallet name on its own line (**Main Wallet**), then each token on its own line below it, in the exact order given in "Current portfolio" (already sorted verified-first, highest value first) — never comma-joined on one line. Example:
**Main Wallet**
USDC: 47.3792
EURC: 20.5635
**Agent Wallet**
USDC: 7.0415
EURC: 19.7328
- Balance/portfolio numbers MUST come only from the "Current portfolio" block above, generated fresh for this exact request. NEVER reuse, average, or "confirm" a balance figure you or the user mentioned earlier in this conversation's history — that number is stale by the time of a new request. If "Current portfolio" says "Portfolio: unavailable.", say plainly that the live balance couldn't be fetched right now and to try again — do not guess, do not fall back to a number from earlier in the chat.
- "what's my agent wallet address?" / "địa chỉ ví agent của tôi là gì?" / similar for Main Wallet → answer directly with the address from "Current portfolio" above (both addresses are the user's own public on-chain address, not a secret — always fine to share with the account's own owner). Never refuse or deflect this question.
- "withdraw to main wallet" / "rút về ví chính" → execute_send to Main Wallet address above
- "fund agent" / "nạp cho agent" → tell user to use the Deposit button in the UI (this funds the Agent Wallet itself, not X402)
- "nạp/deposit vào X402/Gateway" / "top up X402" → execute_gateway_deposit
- "rút/withdraw từ X402/Gateway" → execute_gateway_withdraw
- A short affirmative reply ("đúng rồi", "yes", "ok", "đúng") is NOT a valid money command. Tell the user to resend the FULL command in one message (verb + exact amount + tokens/recipient).
- "mua/buy/contribute/góp vào <project>" (project must be in Live Launchpad sales list) → execute_launchpad_contribute

## Wallets
- Agent Wallet: default for all transactions (gasless, no PIN needed)
- Main Wallet: user must say "main wallet" / "ví chính" explicitly — server enforces PIN

## When calling a money tool
Agent Wallet actions execute automatically after deterministic server validation. Say that the validated action is being executed automatically; never ask for confirmation.
Main Wallet actions still require the user's PIN. Never claim a transaction succeeded until the system returns its real result.`

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: message },
    ]

    // Lean context for the second (tool-result summarization) pass — the full
    // systemPrompt's tool-selection/disambiguation rules aren't needed once a
    // tool has already been picked and run; resending them just to get the
    // model to phrase a summary doubles input tokens for no benefit.
    const secondPassSystemPrompt = `You are Miron Agent, an AI financial assistant for MironPay on ARC Testnet. Reply in the language the user's message is clearly written in; if it's ambiguous or mixed, default to English. Be concise: 1-3 short sentences, no filler, no restating data already shown in the UI (chart/table/gauge). Use the tool result below to answer the user's message directly.`
    const secondPassMessages = [
      { role: 'system', content: secondPassSystemPrompt },
      { role: 'user', content: message },
    ]

    // Money-moving tools each require a specific verb in the user's raw
    // message (enforced again, post-hoc, by moneyToolGuards below — this is
    // the same check applied earlier so an unmatched tool is never offered
    // to the model in the first place, saving its schema's tokens on every
    // message that isn't actually a money command).
    const SEND_VERBS = ['send', 'transfer', 'pay', 'gửi', 'gui', 'chuyển', 'chuyen']
    const SWAP_VERBS = ['swap', 'exchange', 'convert', 'đổi', 'doi']
    const DEPOSIT_VERBS = ['deposit', 'top up', 'topup', 'nạp', 'nap']
    const WITHDRAW_VERBS = ['withdraw', 'rút', 'rut']
    const CONTRIBUTE_VERBS = ['buy', 'contribute', 'invest', 'mua', 'góp', 'gop', 'đầu tư', 'dau tu']
    function hasAnyKeyword(raw: string, keywords: string[]): boolean {
      const lower = raw.toLowerCase()
      return keywords.some(k => lower.includes(k))
    }
    const MONEY_TOOL_VERBS: Record<string, string[]> = {
      execute_send: SEND_VERBS,
      execute_swap: SWAP_VERBS,
      execute_gateway_deposit: DEPOSIT_VERBS,
      execute_gateway_withdraw: WITHDRAW_VERBS,
      execute_launchpad_contribute: CONTRIBUTE_VERBS,
    }
    // get_wallet_lookup is for looking up a THIRD-PARTY address the user
    // pastes/names — never the user's own MironPay balance (CoinStats doesn't
    // even cover ARC Testnet, so a self-lookup silently comes back empty).
    // Gate it on an actual 0x address appearing in the raw message so a plain
    // "check my balance" can never trigger it — same pattern as the money
    // tools' verb gating above.
    const hasHexAddress = /0x[a-fA-F0-9]{40}/.test(message)
    const activeTools = TOOLS.filter(t => {
      if (t.function.name === 'get_wallet_lookup') return hasHexAddress
      const verbs = MONEY_TOOL_VERBS[t.function.name]
      return !verbs || hasAnyKeyword(message, verbs)
    })

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        tools: activeTools,
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
    let action: AgentAction | null = null
    let dataFee: { amount: number; txHash: string | null } | null = null
    let tokenChart: { symbol: string; points: Array<[number, number]> } | null = null
    let trendingData: { coins: Array<{ symbol: string; name: string; market_cap_rank: number | null; price_usd: number | null; change_24h_pct: number | null }> } | null = null
    let defiData:
      | { mode: 'protocol'; name: string; category: string | null; chains: string[]; tvl_usd: number | null; change_1d_pct: number | null; change_7d_pct: number | null }
      | { mode: 'top_yield'; pools: Array<{ project: string; symbol: string; chain: string; apy_pct: number; tvl_usd: number }> }
      | { mode: 'protocol_yield'; protocol: string; pools: Array<{ symbol: string; chain: string; apy_pct: number; tvl_usd: number }> }
      | null = null
    let sentimentData: { value: number; classification: string } | null = null
    let stablecoinData:
      | { mode: 'top'; coins: Array<{ symbol: string; name: string; price_usd: number; peg_type: string; market_cap_usd: number }> }
      | { mode: 'single'; coin: { symbol: string; name: string; price_usd: number; peg_type: string; market_cap_usd: number } }
      | null = null
    let walletLookupData:
      | {
          address: string
          chains: Array<{ blockchain: string; total_usd: number; tokens: Array<{ symbol: string; name: string; amount: number; usd_value: number; rank: number | null }> }>
          total_usd: number
        }
      | null = null
    let dexPairData:
      | { query: string; pairs: Array<{ chain: string; dex: string; pairLabel: string; priceUsd: number; liquidityUsd: number; volume24hUsd: number; change24hPct: number | null; url: string }> }
      | null = null
    let swapQuoteData:
      | { chain: string; tokenInSymbol: string; tokenOutSymbol: string; amountIn: number; amountInUsd: number | null; amountOutUsd: number | null; gasUsd: number | null; route: string[] }
      | null = null

    // Does the user's RAW text contain a standalone number the model could
    // legitimately have read as an amount? Strips 0x addresses and @handles
    // first, since a hex address is full of digits but is never an amount.
    // This is a hard server-side check the model cannot talk its way around —
    // it exists because the model can otherwise hallucinate a tool call (and
    // an amount) from something as bare as a pasted contract address.
    function hasExplicitAmount(raw: string): boolean {
      // No \b anchors — a number glued directly to a token symbol (e.g.
      // "2usdc", "0.5eth") has no word boundary between the digits and the
      // following letters, since both are \w, so \b\d+\b would miss it.
      const stripped = raw.replace(/0x[a-fA-F0-9]+/g, ' ').replace(/@\w+/g, ' ')
      return /\d+(\.\d+)?/.test(stripped)
    }

    if (choice?.finish_reason === 'tool_calls' && assistantMsg?.tool_calls?.length > 0) {
      for (const toolCall of assistantMsg.tool_calls) {
        const fnName = toolCall.function?.name
        let args: Record<string, string> = {}
        // Some models return the literal string "null" for tool calls with no
        // required params (e.g. get_defi_data/get_trending_tokens with no
        // arguments) — that's valid JSON, so JSON.parse succeeds but returns
        // null instead of {}, and every args.xyz access below would throw.
        try {
          const parsed = JSON.parse(toolCall.function?.arguments ?? '{}')
          if (parsed && typeof parsed === 'object') args = parsed
        } catch { /* skip */ }

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
          // Don't hand the user a hard-coded refusal — the block reason just means
          // this specific tool call was unjustified, not that the user's actual
          // message was itself a money command. Feed the reason back as a tool
          // result and let the model answer the real question in text (e.g. a
          // balance check, a price lookup, general chat) with no tool calls.
          const toolResultContent = `This tool call was rejected: ${blockReason}. Do not call any money-moving tool. `
            + `Re-read the user's actual message and answer it directly in plain text. `
            + `If it truly was an incomplete money command, ask them to restate it with the action, exact amount, and recipient.`
          const secondMessages = [
            ...secondPassMessages,
            assistantMsg,
            { role: 'tool', tool_call_id: toolCall.id, content: toolResultContent },
          ]
          const secondRes = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
            body: JSON.stringify({ model: GROQ_MODEL, messages: secondMessages, max_tokens: 512, temperature: 0.2 }),
          })
          reply = secondRes.ok
            ? ((await secondRes.json()).choices?.[0]?.message?.content ?? '')
            : "I won't guess on money-moving actions. Please state the action (send/swap/deposit/etc), the exact amount, and the recipient explicitly — I'll draft it for you to confirm once your instruction is unambiguous."
          continue
        }

        if (fnName === 'execute_send') {
          action = { type: 'send', to: args.to, amount: args.amount, token: args.token, walletSource }
          reply = isMain
            ? `🔒 Main Wallet — PIN required\nReady to send ${args.amount} ${args.token ?? 'USDC'} to ${args.to}. Confirm below to proceed.`
            : `Executing ${args.amount} ${args.token ?? ''} to ${args.to} automatically from Agent Wallet.`
        } else if (fnName === 'execute_swap') {
          action = { type: 'swap', tokenIn: args.tokenIn, tokenOut: args.tokenOut, amount: args.amount, walletSource }
          reply = isMain
            ? `🔒 Main Wallet — PIN required\nReady to swap ${args.amount} ${args.tokenIn} → ${args.tokenOut}. Confirm below to proceed.`
            : `Executing ${args.amount} ${args.tokenIn} → ${args.tokenOut} automatically from Agent Wallet.`
        } else if (fnName === 'execute_gateway_deposit') {
          action = { type: 'gateway_deposit', amount: args.amount }
          reply = `Depositing ${args.amount} USDC into the X402 reserve automatically.`
        } else if (fnName === 'execute_gateway_withdraw') {
          action = { type: 'gateway_withdraw', amount: args.amount }
          reply = `Withdrawing ${args.amount} USDC from the X402 reserve automatically.`
        } else if (fnName === 'execute_launchpad_contribute') {
          action = { type: 'launchpad_contribute', projectId: args.projectId, amount: args.amount }
          reply = `Contributing ${args.amount} USDC to ${args.projectId} automatically from Agent Wallet.`
        } else if (fnName === 'get_token_price') {
          let toolResultContent: string
          const symbol = (args.symbol ?? '').trim()
          if (!symbol) {
            toolResultContent = 'Ask the user which token symbol they mean.'
          } else if (!profile?.agent_wallet_id || !profile?.agent_wallet_address) {
            toolResultContent = 'Price lookup unavailable: Agent Wallet not initialized. Answer using general knowledge instead.'
            dataApiError = toolResultContent
          } else {
            try {
              const cacheKey = symbol.toUpperCase()
              const cached = priceCache.get(cacheKey)
              let data: CachedPrice['data']
              let txHash: string | null
              if (cached && cached.expiresAt > Date.now()) {
                data = cached.data
                txHash = null // no new on-chain payment made — served from cache
              } else {
                const origin = request.nextUrl.origin
                const paid = await payX402<CachedPrice['data']>(
                  `${origin}/api/x402/market-data?symbol=${encodeURIComponent(symbol)}`,
                  profile.agent_wallet_id,
                  profile.agent_wallet_address as `0x${string}`,
                )
                data = paid.data
                txHash = paid.txHash
                priceCache.set(cacheKey, { data, expiresAt: Date.now() + PRICE_CACHE_TTL_MS })
              }
              dataFee = txHash ? { amount: X402_DATA_FEE, txHash } : null
              if (data.chart_24h?.length > 1) tokenChart = { symbol: data.symbol, points: data.chart_24h }
              toolResultContent = (txHash ? `Full live data for ${data.name} (${data.symbol}), paid $${X402_DATA_FEE} USDC via x402 — ` : `Full live data for ${data.name} (${data.symbol}), served from a recent cached lookup (no new fee charged) — `)
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
                + `5. Use ONLY the numbers above — never estimate or guess.\n`
                + `6. Any field showing "null" means that specific metric wasn't available from the data source this time (a fallback provider was used) — never say the literal word "null" to the user; if they specifically ask about that metric, say it's not available right now.`
            } catch (e) {
              const errMsg = e instanceof Error ? e.message : String(e)
              console.error(`[agent/chat] get_token_price("${symbol}") failed:`, errMsg)
              toolResultContent = `Live price lookup for "${symbol}" failed (${errMsg}) — no fee was charged for this failed attempt. Tell the user plainly that the live data lookup failed right now and to try again in a moment. Do NOT guess a price from memory — crypto prices go stale in minutes and a wrong number is worse than admitting the lookup failed.`
              dataApiError = toolResultContent
            }
          }
          const secondMessages = [
            ...secondPassMessages,
            assistantMsg,
            { role: 'tool', tool_call_id: toolCall.id, content: toolResultContent },
          ]
          const secondRes = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
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
          else dataApiError = content

          const secondMessages = [...secondPassMessages, assistantMsg, { role: 'tool', tool_call_id: toolCall.id, content }]
          const secondRes = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
            body: JSON.stringify({ model: GROQ_MODEL, messages: secondMessages, max_tokens: 512, temperature: 0.2 }),
          })
          if (secondRes.ok) reply = (await secondRes.json()).choices?.[0]?.message?.content ?? ''
        } else if (fnName === 'get_swap_quote') {
          const origin = request.nextUrl.origin
          const tokenIn = (args.tokenIn ?? '').trim()
          const tokenOut = (args.tokenOut ?? '').trim()
          const amount = (args.amount ?? '').trim()
          const chain = (args.chain ?? 'ethereum').trim()
          if (!tokenIn || !tokenOut || !amount) {
            reply = 'Please provide the two tokens and the amount you want a swap quote for.'
          } else {
            const path = `/api/x402/swap-quote?tokenIn=${encodeURIComponent(tokenIn)}&tokenOut=${encodeURIComponent(tokenOut)}&amount=${encodeURIComponent(amount)}&chain=${encodeURIComponent(chain)}`
            const { content, fee, data: rawData } = await callX402Tool<{
              chain: string; tokenInSymbol: string; tokenOutSymbol: string; amountIn: number; amountInUsd: number | null; amountOutUsd: number | null; gasUsd: number | null; route: string[]
            }>(origin, path, profile, (data) =>
              `Swap quote via KyberSwap on ${data.chain} (paid $${X402_DATA_FEE} via x402): ${data.amountIn} ${data.tokenInSymbol}`
              + (data.amountInUsd != null ? ` (~$${data.amountInUsd})` : '') + ` → ~$${data.amountOutUsd} worth of ${data.tokenOutSymbol}`
              + (data.gasUsd != null ? `, estimated gas cost ~$${data.gasUsd}` : '') + `. Route: ${data.route.join(' → ') || 'direct'}. `
              + `A stat card with these numbers is ALREADY shown to the user below — reply in ONE short sentence with the output value. `
              + `IMPORTANT: this is a price-comparison quote only, NOT an executed swap — never say the swap happened or offer to confirm/execute it via this data.`)
            if (fee) dataFee = fee
            if (rawData) swapQuoteData = rawData
            else dataApiError = content

            const secondMessages = [...secondPassMessages, assistantMsg, { role: 'tool', tool_call_id: toolCall.id, content }]
            const secondRes = await fetch(GROQ_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
              body: JSON.stringify({ model: GROQ_MODEL, messages: secondMessages, max_tokens: 512, temperature: 0.2 }),
            })
            if (secondRes.ok) reply = (await secondRes.json()).choices?.[0]?.message?.content ?? ''
          }
        } else if (fnName === 'get_dex_pair_data') {
          const origin = request.nextUrl.origin
          const query = (args.query ?? '').trim()
          if (!query) {
            reply = 'Please provide the token symbol, name, or contract address you want DEX pair data for.'
          } else {
            const { content, fee, data: rawData } = await callX402Tool<{
              query: string
              pairs: Array<{ chain: string; dex: string; pairLabel: string; priceUsd: number; liquidityUsd: number; volume24hUsd: number; change24hPct: number | null; url: string }>
            }>(origin, `/api/x402/dex-pair?query=${encodeURIComponent(query)}`, profile, (data) => {
              if (data.pairs.length === 0) return `No DEX pairs found for "${data.query}" (paid $${X402_DATA_FEE} via x402).`
              return `Top DEX pairs for "${data.query}" by liquidity (paid $${X402_DATA_FEE} via x402): `
                + data.pairs.map(p => `${p.pairLabel} on ${p.dex} (${p.chain}): $${p.priceUsd}, liquidity $${p.liquidityUsd}, 24h vol $${p.volume24hUsd}`).join(' | ')
                + `. A table with full details is ALREADY shown to the user below — reply in ONE short sentence naming the top pair's price and liquidity, do not repeat the full list.`
            })
            if (fee) dataFee = fee
            if (rawData) dexPairData = rawData
            else dataApiError = content

            const secondMessages = [...secondPassMessages, assistantMsg, { role: 'tool', tool_call_id: toolCall.id, content }]
            const secondRes = await fetch(GROQ_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
              body: JSON.stringify({ model: GROQ_MODEL, messages: secondMessages, max_tokens: 512, temperature: 0.2 }),
            })
            if (secondRes.ok) reply = (await secondRes.json()).choices?.[0]?.message?.content ?? ''
          }
        } else if (fnName === 'get_defi_data') {
          const origin = request.nextUrl.origin
          const protocol = (args.protocol ?? '').trim()
          const metric = (args.metric ?? '').trim()
          const path = protocol
            ? `/api/x402/defi?protocol=${encodeURIComponent(protocol)}${metric === 'yield' ? '&metric=yield' : ''}`
            : '/api/x402/defi'
          const { content, fee, data: rawData } = await callX402Tool<
            | { mode: 'protocol'; name: string; category: string | null; chains: string[]; tvl_usd: number | null; change_1d_pct: number | null; change_7d_pct: number | null }
            | { mode: 'top_yield'; pools: Array<{ project: string; symbol: string; chain: string; apy_pct: number; tvl_usd: number }> }
            | { mode: 'protocol_yield'; protocol: string; pools: Array<{ symbol: string; chain: string; apy_pct: number; tvl_usd: number }> }
          >(origin, path, profile, (data) => {
            if (data.mode === 'protocol') {
              return `DeFiLlama data for ${data.name} (paid $${X402_DATA_FEE} via x402): TVL=$${data.tvl_usd}, category=${data.category}, `
                + `chains=[${data.chains.join(', ')}], 1d change=${data.change_1d_pct}%, 7d change=${data.change_7d_pct}%. `
                + `A stat card with these numbers is ALREADY shown to the user below — reply in ONE short sentence, do not repeat every number.`
            }
            if (data.mode === 'protocol_yield') {
              return `Top yield pools for ${data.protocol} (DeFiLlama, paid $${X402_DATA_FEE} via x402): `
                + data.pools.map(p => `${p.symbol} on ${p.chain} (${p.apy_pct}% APY, $${p.tvl_usd} TVL)`).join(', ')
                + `. A table with full details is ALREADY shown to the user below — reply in ONE short sentence, mention smart-contract/impermanent-loss risk briefly, never guarantee returns, do not repeat the full list.`
            }
            return `Top yield pools (DeFiLlama, paid $${X402_DATA_FEE} via x402): `
              + data.pools.map(p => `${p.project} ${p.symbol} on ${p.chain} (${p.apy_pct}% APY)`).join(', ')
              + `. A table with full details (APY, TVL) is ALREADY shown to the user below — reply in ONE short sentence, mention smart-contract/impermanent-loss risk briefly, never guarantee returns, do not repeat the full list.`
          })
          if (fee) dataFee = fee
          if (rawData) defiData = rawData
          else dataApiError = content

          const secondMessages = [...secondPassMessages, assistantMsg, { role: 'tool', tool_call_id: toolCall.id, content }]
          const secondRes = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
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
          else dataApiError = content

          const secondMessages = [...secondPassMessages, assistantMsg, { role: 'tool', tool_call_id: toolCall.id, content }]
          const secondRes = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
            body: JSON.stringify({ model: GROQ_MODEL, messages: secondMessages, max_tokens: 512, temperature: 0.2 }),
          })
          if (secondRes.ok) reply = (await secondRes.json()).choices?.[0]?.message?.content ?? ''
        } else if (fnName === 'get_wallet_lookup') {
          const origin = request.nextUrl.origin
          const address = (args.address ?? '').trim()
          if (!address) {
            reply = 'Please provide the wallet address you want to look up.'
          } else {
            const { content, fee, data: rawData } = await callX402Tool<{
              address: string
              chains: Array<{ blockchain: string; total_usd: number; tokens: Array<{ symbol: string; name: string; amount: number; usd_value: number; rank: number | null }> }>
              total_usd: number
            }>(origin, `/api/x402/wallet-lookup?address=${encodeURIComponent(address)}`, profile, (data) => {
              const nonEmptyChains = data.chains.filter(c => c.tokens.length > 0)
              if (nonEmptyChains.length === 0) return `No holdings found for ${data.address} across the chains checked (paid $${X402_DATA_FEE} via x402).`
              return `Wallet ${data.address} holdings (CoinStats, paid $${X402_DATA_FEE} via x402), total ~$${data.total_usd} across ${nonEmptyChains.length} chain(s): `
                + nonEmptyChains.map(c => `${c.blockchain}: ${c.tokens.slice(0, 5).map(t => `${t.symbol} ($${t.usd_value})`).join(', ')}`).join(' | ')
                + `. A table with full details is ALREADY shown to the user below — reply in ONE short sentence with the total and 1-2 notable holdings. `
                + `IMPORTANT: this is a read-only lookup of an on-chain address, NOT a MironPay wallet — never offer to send/swap/manage these funds. `
                + `Token balances on any chain can include spam tokens that spoof a real asset's symbol/price to show an inflated fake value — if a single holding looks implausibly large relative to the rest, say the figure may be unreliable rather than stating it as fact.`
            })
            if (fee) dataFee = fee
            if (rawData) walletLookupData = rawData
            else dataApiError = content

            const secondMessages = [...secondPassMessages, assistantMsg, { role: 'tool', tool_call_id: toolCall.id, content }]
            const secondRes = await fetch(GROQ_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
              body: JSON.stringify({ model: GROQ_MODEL, messages: secondMessages, max_tokens: 512, temperature: 0.2 }),
            })
            if (secondRes.ok) reply = (await secondRes.json()).choices?.[0]?.message?.content ?? ''
          }
        } else if (fnName === 'get_stablecoin_data') {
          const origin = request.nextUrl.origin
          const symbol = (args.symbol ?? '').trim()
          const path = symbol ? `/api/x402/stablecoins?symbol=${encodeURIComponent(symbol)}` : '/api/x402/stablecoins'
          const { content, fee, data: rawData } = await callX402Tool<
            | { mode: 'top'; coins: Array<{ symbol: string; name: string; price_usd: number; peg_type: string; market_cap_usd: number }> }
            | { mode: 'single'; coin: { symbol: string; name: string; price_usd: number; peg_type: string; market_cap_usd: number } }
          >(origin, path, profile, (data) => {
            if (data.mode === 'single') {
              const c = data.coin
              const deviationPct = ((c.price_usd - 1) * 100).toFixed(2)
              return `${c.name} (${c.symbol}) (DeFiLlama, paid $${X402_DATA_FEE} via x402): price=$${c.price_usd} (${deviationPct}% from peg), market cap=$${c.market_cap_usd}. `
                + `A stat card with these numbers is ALREADY shown to the user below — reply in ONE short sentence, mention de-peg risk only if the deviation is notable (>0.5%).`
            }
            return `Top stablecoins by market cap (DeFiLlama, paid $${X402_DATA_FEE} via x402): `
              + data.coins.map(c => `${c.symbol} ($${c.market_cap_usd}, price $${c.price_usd})`).join(', ')
              + `. A table with full details is ALREADY shown to the user below — reply in ONE short sentence, do not repeat the full list.`
          })
          if (fee) dataFee = fee
          if (rawData) stablecoinData = rawData
          else dataApiError = content

          const secondMessages = [...secondPassMessages, assistantMsg, { role: 'tool', tool_call_id: toolCall.id, content }]
          const secondRes = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
            body: JSON.stringify({ model: GROQ_MODEL, messages: secondMessages, max_tokens: 512, temperature: 0.2 }),
          })
          if (secondRes.ok) reply = (await secondRes.json()).choices?.[0]?.message?.content ?? ''
        } else if (fnName === 'save_memory') {
          await supabase.from('agent_memory').upsert(
            { user_id: user.id, key: args.key, value: args.value, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,key' }
          )
          const secondMessages = [
            ...secondPassMessages,
            assistantMsg,
            { role: 'tool', tool_call_id: toolCall.id, content: `Saved: ${args.key} = ${args.value}` },
          ]
          const secondRes = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
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

    // Fixed, model-independent notice — a data tool call failing shouldn't
    // depend on whether the model chose to mention it. dataApiError is built
    // from tool-result strings meant for the LLM (they carry trailing
    // instructions like "Tell the user plainly..." or "Answer using general
    // knowledge instead") — strip that off before showing it to the user.
    if (dataApiError) {
      const cleanReason = dataApiError
        .split(/\s+(?:Tell the user|Do NOT guess|Answer using general knowledge)/)[0]
        .trim()
      reply = `⚠️ Live data lookup failed — ${cleanReason}\n\n${reply}`
    }

    // Explicit timestamps, 1ms apart — inserting both rows in the same
    // statement gives them an identical DB-generated created_at, and Postgres
    // doesn't guarantee insertion order for ties when sorting, which was
    // flipping user/assistant order on reload.
    // The model may propose an action, but only deterministic server checks can
    // authorize it. The signed, short-lived proof binds the exact action to the
    // user's exact message so /api/agent/execute cannot accept a modified draft.
    if (action) {
      const validation = validateAgentIntent(message, action)
      if (!validation.ok) {
        action = null
        reply = validation.error
      } else {
        action = validation.action

        if (action.type === 'send' && action.to) {
          const requestedRecipient = action.to
          let destinationAddress = requestedRecipient
          if (requestedRecipient.startsWith('@')) {
            const { data: resolvedAddress } = await supabase.rpc('resolve_username', {
              p_username: requestedRecipient.slice(1).toLowerCase(),
            })
            if (!resolvedAddress) {
              action = null
              reply = `${requestedRecipient} was not found on MironPay.`
            } else {
              destinationAddress = resolvedAddress
            }
          }

          if (action) {
            const sourceAddress = action.walletSource === 'main'
              ? resolvedMainWallet?.walletAddress
              : profile.agent_wallet_address
            if (sourceAddress && destinationAddress.toLowerCase() === sourceAddress.toLowerCase()) {
              action = null
              reply = 'The recipient is the same as the source wallet. Self-transfers are not allowed.'
            }
          }
        }

        if (action) action.intentProof = issueAgentIntent(user.id, action, message)
      }
    }

    const userTs = new Date()
    const assistantTs = new Date(userTs.getTime() + 1)

    await Promise.all([
      supabase.from('agent_messages').insert([
        { user_id: user.id, role: 'user', content: message, cost: CHARGE_MESSAGE_FEE ? MSG_COST : 0, input_fee_tx_hash: msgFeeTxHash, created_at: userTs.toISOString() },
        {
          user_id: user.id, role: 'assistant', content: reply, cost: 0,
          data_fee_amount: dataFee?.amount ?? null,
          data_fee_tx_hash: dataFee?.txHash ?? null,
          chart_symbol: tokenChart?.symbol ?? null,
          chart_points: tokenChart?.points ?? null,
          trending_data: trendingData,
          defi_data: defiData,
          sentiment_data: sentimentData,
          stablecoin_data: stablecoinData,
          wallet_lookup_data: walletLookupData,
          dex_pair_data: dexPairData,
          swap_quote_data: swapQuoteData,
          created_at: assistantTs.toISOString(),
        },
      ]),
      supabase.from('agent_wallets').update({
        daily_spent: wallet.daily_spent + (CHARGE_MESSAGE_FEE ? MSG_COST : 0),
      }).eq('user_id', user.id),
    ])

    return NextResponse.json({
      reply, action, cost: CHARGE_MESSAGE_FEE ? MSG_COST : 0, balance_after: onChainBalance - (CHARGE_MESSAGE_FEE ? MSG_COST : 0),
      input_fee_tx_hash: msgFeeTxHash,
      data_fee: dataFee,
      token_chart: tokenChart,
      trending_data: trendingData,
      defi_data: defiData,
      sentiment_data: sentimentData,
      stablecoin_data: stablecoinData,
      wallet_lookup_data: walletLookupData,
      dex_pair_data: dexPairData,
      swap_quote_data: swapQuoteData,
    })

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[agent/chat]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
