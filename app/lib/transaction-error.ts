export type TransactionErrorCode =
  | 'INVALID_ADDRESS'
  | 'INSUFFICIENT_TOKEN_BALANCE'
  | 'INSUFFICIENT_GAS'
  | 'GAS_LIMIT_EXCEEDED'
  | 'TRANSACTION_REVERTED'
  | 'TRANSACTION_PENDING'
  | 'POLICY_LIMIT_EXCEEDED'
  | 'SLIPPAGE_TOO_LOW'
  | 'NO_SWAP_ROUTE'
  | 'NETWORK_UNAVAILABLE'
  | 'TRANSACTION_FAILED'

export type TransactionErrorInfo = {
  error: string
  code: TransactionErrorCode
  status: number
  retryable: boolean
  providerCode?: string | number
}

type ErrorContext = {
  operation?: 'send' | 'swap' | 'gateway' | 'launchpad'
  token?: string
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? value as UnknownRecord : null
}

function collectErrorText(error: unknown): string {
  const values: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = error

  for (let depth = 0; depth < 4 && current && !seen.has(current); depth++) {
    seen.add(current)
    if (typeof current === 'string') {
      values.push(current)
      break
    }
    const record = asRecord(current)
    if (!record) break
    for (const key of ['message', 'error', 'detail', 'reason']) {
      if (typeof record[key] === 'string') values.push(record[key] as string)
    }
    const response = asRecord(record.response)
    const responseData = asRecord(response?.data)
    if (typeof responseData?.message === 'string') values.push(responseData.message)
    if (typeof responseData?.error === 'string') values.push(responseData.error)
    current = record.cause
  }

  return values.join(' | ').toLowerCase()
}

function extractProviderCode(error: unknown): string | number | undefined {
  const record = asRecord(error)
  const response = asRecord(record?.response)
  const responseData = asRecord(response?.data)
  for (const value of [record?.code, responseData?.code, responseData?.errorCode]) {
    if (typeof value === 'string' || typeof value === 'number') return value
  }
  return undefined
}

function hasCode(code: string | number | undefined, codes: number[]): boolean {
  return typeof code === 'number'
    ? codes.includes(code)
    : typeof code === 'string' && codes.includes(Number(code))
}

export function classifyTransactionError(
  error: unknown,
  context: ErrorContext = {},
): TransactionErrorInfo {
  const text = collectErrorText(error)
  const providerCode = extractProviderCode(error)
  const token = context.token?.toUpperCase() || 'token'
  const result = (info: Omit<TransactionErrorInfo, 'providerCode'>): TransactionErrorInfo => ({
    ...info,
    ...(providerCode !== undefined ? { providerCode } : {}),
  })

  if (hasCode(providerCode, [175410]) || /invalid (?:wallet )?address|address format|bad address/.test(text)) {
    return result({
      error: 'The recipient wallet address is invalid. Check the full 0x address and try again.',
      code: 'INVALID_ADDRESS', status: 400, retryable: false,
    })
  }

  if (hasCode(providerCode, [155204, 177004])
    || /total cost.*higher than.*balance|insufficient.*(?:gas|network fee)|gas funds|funds for gas/.test(text)) {
    return result({
      error: 'Not enough balance to pay the network fee. Add gas funds to this wallet and try again.',
      code: 'INSUFFICIENT_GAS', status: 400, retryable: false,
    })
  }

  if (hasCode(providerCode, [155201, 155205, 177003, 177025])
    || /insufficient (?:token|asset|fund)|not enough fund|amount owned.*insufficient|exceeds? balance/.test(text)) {
    return result({
      error: `Not enough ${token}. Reduce the amount or deposit more ${token}.`,
      code: 'INSUFFICIENT_TOKEN_BALANCE', status: 400, retryable: false,
    })
  }

  if (hasCode(providerCode, [155207, 155211, 177006, 177010])
    || /gas required exceeds|gas limit|maximum permitted transaction gas fee|maxfee/.test(text)) {
    return result({
      error: 'The required network fee is above the allowed gas limit. Reduce the amount or try again when the network is less busy.',
      code: 'GAS_LIMIT_EXCEEDED', status: 400, retryable: true,
    })
  }

  if (hasCode(providerCode, [177019, 177020, 177021, 177022, 177023])
    || /policy blocklist|exceeded max spend|policy.*limit/.test(text)) {
    return result({
      error: 'This transaction exceeds the wallet security policy or spending limit. Reduce the amount or update the wallet limit.',
      code: 'POLICY_LIMIT_EXCEEDED', status: 403, retryable: false,
    })
  }

  if (hasCode(providerCode, [155202, 177001, 177026])
    || /nonce|pending transactions?|queued transactions?/.test(text)) {
    return result({
      error: 'A previous wallet transaction is still pending. Wait for it to finish, then try again.',
      code: 'TRANSACTION_PENDING', status: 409, retryable: true,
    })
  }

  if (/0xe52970aa|slippage|minimum output|price impact/.test(text)) {
    return result({
      error: 'The swap price moved beyond the allowed slippage. Try a smaller amount or retry with a fresh quote.',
      code: 'SLIPPAGE_TOO_LOW', status: 400, retryable: true,
    })
  }

  if (/no (?:swap )?route|route.*not (?:found|available)|331001/.test(text)) {
    return result({
      error: 'No swap route is available for this pair right now. Try a smaller amount or try again later.',
      code: 'NO_SWAP_ROUTE', status: 400, retryable: true,
    })
  }

  if (hasCode(providerCode, [175407])
    || /network.*unavailable|service unavailable|timeout|timed out|econn|fetch failed|socket|rate limit/.test(text)) {
    return result({
      error: 'The wallet or blockchain network is temporarily unavailable. No transaction was sent; please try again shortly.',
      code: 'NETWORK_UNAVAILABLE', status: 503, retryable: true,
    })
  }

  if (hasCode(providerCode, [155208, 155210, 177007, 177009])
    || /execution reverted|transaction estimation|simulation failed|would fail/.test(text)) {
    return result({
      error: context.operation === 'send'
        ? 'The transfer was rejected during simulation. Check that the recipient supports this token and that the wallet has enough balance for the amount and network fee.'
        : 'The transaction was rejected during simulation. Check the amount, token, and available network fee before trying again.',
      code: 'TRANSACTION_REVERTED', status: 400, retryable: false,
    })
  }

  return result({
    error: 'The transaction could not be completed. No success was recorded; please retry or contact support with the error code.',
    code: 'TRANSACTION_FAILED', status: 500, retryable: true,
  })
}
