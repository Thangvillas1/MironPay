import type { Address } from 'viem'
import { randomBytes } from 'crypto'
import { x402Client, x402HTTPClient } from '@x402/core/client'
import { BatchEvmScheme } from '@circle-fin/x402-batching/client'
import { createCircleX402Signer } from './x402-signer'
import { circleClient } from './circle'

export const ARC_TESTNET_NETWORK = 'eip155:5042002'

const ARC_RPC = 'https://rpc.testnet.arc.network/'
const GATEWAY_WALLET = '0x0077777d7eba4688bdef3e311b846f25870a19b9'
// Same contract addresses & domain the official @circle-fin/x402-batching
// GatewayClient uses internally for arcTestnet (TESTNET_GATEWAY_MINTER /
// CHAIN_CONFIGS.arcTestnet) — read straight from that package's source rather
// than hand-copied, so they can't drift from what the SDK itself trusts.
const GATEWAY_MINTER = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B'
const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000'
const ARC_TESTNET_GATEWAY_DOMAIN = 26
const GATEWAY_API_TESTNET = 'https://gateway-api-testnet.circle.com/v1'
const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935'
const MAX_UINT256_BIGINT = 115792089237316195423570985008687907853269984665640564039457584007913129639935n
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Placeholder thresholds for testnet — revisit both when moving to mainnet.
const MIN_GATEWAY_BALANCE_USDC = 0.05
const TOP_UP_AMOUNT_USDC = 1
// Same-chain (Arc -> Arc) withdrawals are "instant" per Circle's docs, so the
// real fee should be near-zero — this is just the cap the signature allows to
// be deducted, not the amount actually charged. Testnet placeholder, revisit
// for mainnet cross-chain withdrawals (those need the real $0.20 + gas quote).
const WITHDRAW_MAX_FEE_USDC = 0.05

/** Available (spendable) USDC balance an address has deposited into Circle's Gateway Wallet. */
export async function getGatewayAvailableBalance(address: Address): Promise<number> {
  const res = await fetch(`${GATEWAY_API_TESTNET}/balances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: 'USDC',
      sources: [{ depositor: address, domain: ARC_TESTNET_GATEWAY_DOMAIN }],
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Gateway balance fetch failed: ${data?.message ?? res.statusText}`)
  const balance = data.balances?.[0]?.balance
  return balance ? parseFloat(balance) : 0
}

async function getAllowance(owner: Address): Promise<bigint> {
  const data = `0xdd62ed3e${owner.slice(2).padStart(64, '0')}${GATEWAY_WALLET.slice(2).padStart(64, '0')}`
  const res = await fetch(ARC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: ARC_TESTNET_USDC, data }, 'latest'] }),
  })
  const json = await res.json()
  if (!json.result || json.result === '0x') return 0n
  return BigInt(json.result)
}

async function waitConfirmed(txId: string): Promise<string | null> {
  const res = await circleClient.getTransaction({ id: txId, waitForState: 'CONFIRMED', pollingInterval: 1500 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.data as any)?.transaction?.txHash ?? null
}

/**
 * Deposit an explicit USDC amount from a wallet's own on-chain balance into
 * its Circle Gateway reserve. Used both for the automatic pre-payment top-up
 * (`ensureGatewayFunded`) and for an explicit user/agent-initiated deposit.
 */
export async function depositToGateway(walletId: string, walletAddress: Address, amountUsdc: number): Promise<{ txHash: string | null }> {
  const balRes = await circleClient.getWalletTokenBalance({ id: walletId })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usdc = ((balRes.data?.tokenBalances ?? []) as any[]).find((b) => b.token?.symbol === 'USDC')
  const onChainBalance = parseFloat(usdc?.amount ?? '0')
  if (onChainBalance < amountUsdc) {
    throw new Error(`Cannot fund Gateway: wallet only has ${onChainBalance} USDC on-chain, need ${amountUsdc}`)
  }

  const depositAtomic = Math.round(amountUsdc * 1e6).toString()

  const allowance = await getAllowance(walletAddress)
  if (allowance < BigInt(depositAtomic)) {
    const approveRes = await circleClient.createContractExecutionTransaction({
      walletId,
      contractAddress: ARC_TESTNET_USDC,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [GATEWAY_WALLET, MAX_UINT256],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey: crypto.randomUUID(),
    })
    const approveTxId = approveRes.data?.id
    if (approveTxId) await waitConfirmed(approveTxId)
  }

  const depositRes = await circleClient.createContractExecutionTransaction({
    walletId,
    contractAddress: GATEWAY_WALLET,
    abiFunctionSignature: 'deposit(address,uint256)',
    abiParameters: [ARC_TESTNET_USDC, depositAtomic],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: crypto.randomUUID(),
  })
  const depositTxId = depositRes.data?.id
  if (!depositTxId) throw new Error('Gateway deposit did not return a transaction ID')
  const txHash = await waitConfirmed(depositTxId)
  return { txHash }
}

/**
 * Top up a wallet's Circle Gateway balance from its own on-chain USDC when it
 * drops below MIN_GATEWAY_BALANCE_USDC. x402 payments settle against the
 * Gateway's internal ledger, not the wallet's raw on-chain balance — deposit
 * is a prerequisite, not a one-time setup step.
 */
export async function ensureGatewayFunded(walletId: string, walletAddress: Address): Promise<void> {
  const available = await getGatewayAvailableBalance(walletAddress).catch(() => 0)
  if (available >= MIN_GATEWAY_BALANCE_USDC) return
  await depositToGateway(walletId, walletAddress, TOP_UP_AMOUNT_USDC)
}

/**
 * Withdraw USDC from a wallet's Circle Gateway reserve back to its own
 * on-chain balance (same chain -> instant, no 7-day delay). Two phases, same
 * "no raw private key" model as the rest of this file:
 *  1. Sign an EIP-712 "BurnIntent" remotely via Circle's signTypedData() and
 *     POST it to Gateway's /transfer API, which returns a mint attestation.
 *  2. Submit that attestation on-chain via gatewayMint(), again through
 *     Circle's remote contract-execution API (createContractExecutionTransaction),
 *     never a local viem wallet client with a raw key.
 * Field layout/contract addresses mirror @circle-fin/x402-batching's own
 * GatewayClient.withdraw()/createBurnIntent() implementation exactly.
 */
export async function withdrawFromGateway(
  walletId: string,
  walletAddress: Address,
  amountUsdc: number,
): Promise<{ txHash: string | null }> {
  const available = await getGatewayAvailableBalance(walletAddress)
  if (amountUsdc > available) {
    throw new Error(`Cannot withdraw ${amountUsdc} USDC — only ${available} USDC available in Gateway`)
  }

  const toBytes32 = (addr: string) => `0x${addr.slice(2).toLowerCase().padStart(64, '0')}`
  const burnIntent = {
    maxBlockHeight: MAX_UINT256_BIGINT,
    maxFee: BigInt(Math.round(WITHDRAW_MAX_FEE_USDC * 1e6)),
    spec: {
      version: 1,
      sourceDomain: ARC_TESTNET_GATEWAY_DOMAIN,
      destinationDomain: ARC_TESTNET_GATEWAY_DOMAIN, // same chain (Arc -> Arc)
      sourceContract: toBytes32(GATEWAY_WALLET),
      destinationContract: toBytes32(GATEWAY_MINTER),
      sourceToken: toBytes32(ARC_TESTNET_USDC),
      destinationToken: toBytes32(ARC_TESTNET_USDC),
      sourceDepositor: toBytes32(walletAddress),
      destinationRecipient: toBytes32(walletAddress), // withdraw back to self
      sourceSigner: toBytes32(walletAddress),
      destinationCaller: toBytes32(ZERO_ADDRESS),
      value: BigInt(Math.round(amountUsdc * 1e6)),
      salt: `0x${randomBytes(32).toString('hex')}`,
      hookData: '0x',
    },
  }

  const typedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
      ],
      TransferSpec: [
        { name: 'version', type: 'uint32' },
        { name: 'sourceDomain', type: 'uint32' },
        { name: 'destinationDomain', type: 'uint32' },
        { name: 'sourceContract', type: 'bytes32' },
        { name: 'destinationContract', type: 'bytes32' },
        { name: 'sourceToken', type: 'bytes32' },
        { name: 'destinationToken', type: 'bytes32' },
        { name: 'sourceDepositor', type: 'bytes32' },
        { name: 'destinationRecipient', type: 'bytes32' },
        { name: 'sourceSigner', type: 'bytes32' },
        { name: 'destinationCaller', type: 'bytes32' },
        { name: 'value', type: 'uint256' },
        { name: 'salt', type: 'bytes32' },
        { name: 'hookData', type: 'bytes' },
      ],
      BurnIntent: [
        { name: 'maxBlockHeight', type: 'uint256' },
        { name: 'maxFee', type: 'uint256' },
        { name: 'spec', type: 'TransferSpec' },
      ],
    },
    domain: { name: 'GatewayWallet', version: '1' },
    primaryType: 'BurnIntent',
    message: burnIntent,
  }

  const sigRes = await circleClient.signTypedData({
    walletId,
    data: JSON.stringify(typedData, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signature = (sigRes.data as any)?.signature ?? (sigRes.data as any)?.data?.signature
  if (!signature) throw new Error('Circle signTypedData did not return a signature for the Gateway withdrawal')

  const transferRes = await fetch(`${GATEWAY_API_TESTNET}/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ burnIntent, signature }], (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  })
  const result = await transferRes.json()
  if (!transferRes.ok || result.success === false || result.error || !result.attestation || !result.signature) {
    throw new Error(`Gateway withdrawal failed: ${result.message ?? result.error ?? transferRes.statusText}`)
  }

  const mintRes = await circleClient.createContractExecutionTransaction({
    walletId,
    contractAddress: GATEWAY_MINTER,
    abiFunctionSignature: 'gatewayMint(bytes,bytes)',
    abiParameters: [result.attestation, result.signature],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: crypto.randomUUID(),
  })
  const mintTxId = mintRes.data?.id
  if (!mintTxId) throw new Error('Gateway mint did not return a transaction ID')
  const txHash = await waitConfirmed(mintTxId)

  return { txHash }
}

/**
 * Pay for an x402-protected MironPay endpoint using a Circle-managed EOA wallet
 * (the caller's Agent Wallet). No PIN/user interaction — Circle signs the
 * EIP-3009 authorization remotely via signTypedData(), same as an unsigned
 * system-charged transaction (e.g. the per-message chat fee).
 */
export async function payX402<T = unknown>(
  url: string,
  walletId: string,
  walletAddress: Address,
): Promise<{ data: T; txHash: string | null; network: string }> {
  await ensureGatewayFunded(walletId, walletAddress)

  const signer = createCircleX402Signer(walletId, walletAddress)
  const scheme = new BatchEvmScheme(signer)

  const client = new x402Client()
  // @circle-fin/x402-batching resolves its own copy of @x402/core's types (dual
  // esm/cjs package hazard) — structurally identical to this package's, but
  // TypeScript treats them as distinct nominal types.
  client.register(ARC_TESTNET_NETWORK, scheme as unknown as Parameters<typeof client.register>[1])
  const httpClient = new x402HTTPClient(client)

  const initialRes = await fetch(url)
  if (initialRes.status !== 402) {
    return { data: (await initialRes.json()) as T, txHash: null, network: ARC_TESTNET_NETWORK }
  }

  const body = await initialRes.json().catch(() => undefined)
  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => initialRes.headers.get(name),
    body,
  )
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired)
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload)

  const paidRes = await fetch(url, { headers: paymentHeaders })
  const { settleResponse } = await httpClient.processPaymentResult(
    paymentPayload,
    (name) => paidRes.headers.get(name),
    paidRes.status,
  )

  if (!paidRes.ok) {
    const bodyText = await paidRes.clone().text().catch(() => '')
    throw new Error(`x402 payment failed: ${settleResponse?.errorReason ?? paidRes.status}${bodyText ? ` — ${bodyText.slice(0, 300)}` : ''}`)
  }

  return {
    data: (await paidRes.json()) as T,
    txHash: settleResponse?.transaction ?? null,
    network: ARC_TESTNET_NETWORK,
  }
}
