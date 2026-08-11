/**
 * Measures actual on-chain gasUsed for payBatch() at increasing recipient
 * counts, to derive an empirical (base_gas, per_recipient_gas) formula and
 * a safe client-side batch-size cap against Arc Testnet's per-tx gas limit
 * (16,777,216 per EIP-7825, confirmed by Circle support 2026-08-03).
 *
 * Usage: node --env-file=.env.local scripts/measure-paybatch-gas.mjs
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  toBytes,
  formatUnits,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
}

const USDC = '0x3600000000000000000000000000000000000000'
const PAYROLL = process.env.PAYROLL_CLAIM_CONTRACT

const ERC20_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
]

const PAYROLL_ABI = [
  { name: 'payBatch', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'bytes32[]' }, { type: 'uint256[]' }, { type: 'uint64' }], outputs: [] },
  { name: 'feeBps', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
]

function boxIdFor(tag) {
  return keccak256(toBytes(`gas-measure-${tag}-${Date.now()}-${Math.random()}`))
}

async function withRetry(fn, { retries = 8, delayMs = 2000, label = '' } = {}) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i < retries) {
        console.log(`  (retrying ${label}, attempt ${i + 1}/${retries}: ${(e.shortMessage || e.message || '').slice(0, 80)})`)
        await new Promise(r => setTimeout(r, delayMs))
      }
    }
  }
  throw lastErr
}

async function main() {
  if (!PAYROLL) throw new Error('PAYROLL_CLAIM_CONTRACT not set')
  const companyKey = process.env.AGENT_OWNER_PRIVATE_KEY
  if (!companyKey) throw new Error('AGENT_OWNER_PRIVATE_KEY not set')

  const company = privateKeyToAccount(companyKey)
  const walletClient = createWalletClient({ account: company, chain: arcTestnet, transport: http(undefined, { timeout: 30_000 }) })
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(undefined, { timeout: 30_000 }) })

  const read = (functionName, args, address = PAYROLL, abi = PAYROLL_ABI) =>
    withRetry(() => publicClient.readContract({ address, abi, functionName, args }), { label: functionName })

  const feeBps = await read('feeBps')
  console.log(`feeBps: ${feeBps}`)

  const amountPerRecipient = 1_000n // 0.000001 USDC — trivial, just needs to be > 0
  const batchSizes = [3, 10, 30, 60, 100]
  const results = []

  for (const n of batchSizes) {
    const boxIds = Array.from({ length: n }, (_, i) => boxIdFor(`${n}-${i}`))
    const amounts = Array.from({ length: n }, () => amountPerRecipient)
    const total = amountPerRecipient * BigInt(n)
    const fee = (total * feeBps) / 10000n
    const approveAmount = total + fee

    console.log(`\n--- N=${n} ---`)
    console.log(`Approving ${formatUnits(approveAmount, 6)} USDC...`)
    const approveHash = await withRetry(
      () => walletClient.writeContract({ address: USDC, abi: ERC20_ABI, functionName: 'approve', args: [PAYROLL, approveAmount] }),
      { label: 'approve' }
    )
    await withRetry(() => publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 60_000 }), { label: 'wait approve' })

    console.log(`Calling payBatch with ${n} recipients...`)
    const hash = await withRetry(
      () => walletClient.writeContract({ address: PAYROLL, abi: PAYROLL_ABI, functionName: 'payBatch', args: [boxIds, amounts, 3600] }),
      { label: 'payBatch', retries: 3 }
    )
    const receipt = await withRetry(() => publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 }), { label: 'wait payBatch' })
    const gasUsed = receipt.gasUsed
    console.log(`gasUsed: ${gasUsed} (tx: ${hash})`)
    results.push({ n, gasUsed: Number(gasUsed) })
  }

  console.log('\n=== Results ===')
  console.table(results)

  // Linear regression: gasUsed = base + per_recipient * n
  const nMean = results.reduce((s, r) => s + r.n, 0) / results.length
  const gMean = results.reduce((s, r) => s + r.gasUsed, 0) / results.length
  let num = 0, den = 0
  for (const r of results) {
    num += (r.n - nMean) * (r.gasUsed - gMean)
    den += (r.n - nMean) ** 2
  }
  const perRecipient = num / den
  const base = gMean - perRecipient * nMean

  console.log(`\nFitted: gasUsed ≈ ${base.toFixed(0)} + ${perRecipient.toFixed(0)} * N`)

  const TX_GAS_LIMIT = 16_777_216
  const SAFETY_MARGIN = 0.8 // leave 20% headroom for gas price/estimation variance
  const maxN = Math.floor(((TX_GAS_LIMIT * SAFETY_MARGIN) - base) / perRecipient)
  console.log(`Safe max batch size (80% of ${TX_GAS_LIMIT} tx gas limit): ${maxN} recipients`)
}

main().catch(err => {
  console.error('\nMeasurement script failed:', err.shortMessage || err.message)
  process.exit(1)
})
