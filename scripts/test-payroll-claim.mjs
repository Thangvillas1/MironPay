/**
 * End-to-end smoke test for MironPayrollClaim on Arc Testnet.
 * Usage: node --env-file=.env.local scripts/test-payroll-claim.mjs
 *
 * Covers: payBatch (fee + per-recipient ClaimBox funding), claim (signature
 * verify + sweep), double-claim rejection, and reclaim after expiry.
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  toBytes,
  formatUnits,
  encodePacked,
} from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

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
  { name: 'computeBoxAddress', type: 'function', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'address' }] },
  { name: 'payBatch', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'bytes32[]' }, { type: 'uint256[]' }, { type: 'uint64' }], outputs: [] },
  { name: 'claim', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'bytes32' }, { type: 'address' }, { type: 'bytes' }], outputs: [] },
  { name: 'reclaim', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'bytes32' }], outputs: [] },
  { name: 'feeBps', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'admin', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'boxes', type: 'function', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'address' }, { type: 'uint64' }, { type: 'bool' }] },
]

function boxIdForEmail(email) {
  const normalized = email.trim().toLowerCase()
  return keccak256(toBytes(normalized))
}

// Arc Testnet's public RPC is flaky under repeated eth_call — retry with backoff.
async function withRetry(fn, { retries = 8, delayMs = 2000, label = '' } = {}) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i < retries) {
        console.log(`  (retrying ${label || 'call'}, attempt ${i + 1}/${retries}: ${(e.shortMessage || e.message || '').slice(0, 80)})`)
        await new Promise(r => setTimeout(r, delayMs))
      }
    }
  }
  throw lastErr
}

async function main() {
  if (!PAYROLL) {
    console.error('Error: PAYROLL_CLAIM_CONTRACT not set in .env.local')
    process.exit(1)
  }
  const companyKey = process.env.AGENT_OWNER_PRIVATE_KEY
  if (!companyKey) {
    console.error('Error: AGENT_OWNER_PRIVATE_KEY not set in .env.local')
    process.exit(1)
  }

  const company = privateKeyToAccount(companyKey)
  const recipientKey = generatePrivateKey()
  const recipient = privateKeyToAccount(recipientKey)

  console.log(`Company (payer):   ${company.address}`)
  console.log(`Recipient (claim): ${recipient.address} (fresh ephemeral test wallet)`)

  const walletClient = createWalletClient({ account: company, chain: arcTestnet, transport: http(undefined, { timeout: 30_000 }) })
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(undefined, { timeout: 30_000 }) })

  const read = (functionName, args, address = PAYROLL, abi = PAYROLL_ABI) =>
    withRetry(() => publicClient.readContract({ address, abi, functionName, args }), { label: functionName })

  const sendAndWait = (functionName, args, address = PAYROLL, abi = PAYROLL_ABI) =>
    withRetry(async () => {
      const hash = await walletClient.writeContract({ address, abi, functionName, args })
      await withRetry(() => publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 }), { label: `wait ${functionName}` })
      return hash
    }, { label: `send ${functionName}`, retries: 3 })

  const admin = await read('admin')
  const feeBps = await read('feeBps')
  console.log(`Contract admin (fee recipient): ${admin}, feeBps: ${feeBps} (${Number(feeBps) / 100}%)`)

  // ---- Test 1: payBatch + claim (happy path) ----
  const boxIdClaim = boxIdForEmail(`test-claim-${Date.now()}@example.com`)
  const boxIdReclaim = boxIdForEmail(`test-reclaim-${Date.now()}@example.com`)

  const amountClaim = 100_000n // 0.1 USDC
  const amountReclaim = 50_000n // 0.05 USDC
  const total = amountClaim + amountReclaim
  const fee = (total * feeBps) / 10000n
  const approveAmount = total + fee

  console.log(`\nApproving ${formatUnits(approveAmount, 6)} USDC for payroll contract...`)
  const approveHash = await sendAndWait('approve', [PAYROLL, approveAmount], USDC, ERC20_ABI)
  console.log(`Approved. tx: ${approveHash}`)

  const boxAddrClaim = await read('computeBoxAddress', [boxIdClaim])
  const boxAddrReclaim = await read('computeBoxAddress', [boxIdReclaim])
  console.log(`\nPrecomputed claim box:   ${boxAddrClaim}`)
  console.log(`Precomputed reclaim box: ${boxAddrReclaim}`)

  const RECLAIM_EXPIRY_SECONDS = 60
  console.log(`\nCalling payBatch (expiry=${RECLAIM_EXPIRY_SECONDS}s for the reclaim test box)...`)
  const payHash = await sendAndWait('payBatch', [[boxIdClaim, boxIdReclaim], [amountClaim, amountReclaim], RECLAIM_EXPIRY_SECONDS])
  console.log(`payBatch confirmed. tx: ${payHash}`)

  // ---- Test (early): reclaim before expiry must revert — check this
  // immediately after payBatch, before other RPC-retry-heavy steps eat into
  // the real wall-clock window we have before the box actually expires.
  console.log(`\nTrying to reclaim before expiry (must fail — well within the ${RECLAIM_EXPIRY_SECONDS}s window)...`)
  try {
    await walletClient.writeContract({
      address: PAYROLL, abi: PAYROLL_ABI, functionName: 'reclaim', args: [boxIdReclaim],
    })
    console.error('❌ UNEXPECTED: early reclaim succeeded — this is a bug')
  } catch (e) {
    console.log('✅ Early reclaim correctly rejected:', e.shortMessage || e.message)
  }

  const adminBalAfterPay = await read('balanceOf', [admin], USDC, ERC20_ABI)
  const boxClaimBal = await read('balanceOf', [boxAddrClaim], USDC, ERC20_ABI)
  console.log(`Admin USDC balance now: ${formatUnits(adminBalAfterPay, 6)} (fee received)`)
  console.log(`Claim box USDC balance: ${formatUnits(boxClaimBal, 6)} (should equal amountClaim)`)

  // Recipient signs proof of ownership off-chain (free, no gas)
  const message = keccak256(encodePacked(
    ['bytes32', 'address', 'address', 'uint256'],
    [boxIdClaim, recipient.address, PAYROLL, BigInt(arcTestnet.id)]
  ))
  const signature = await recipient.signMessage({ message: { raw: message } })
  console.log(`\nRecipient signed claim message off-chain (free).`)

  console.log(`Submitting claim() on recipient's behalf (relayer-style, company pays gas here)...`)
  const claimHash = await sendAndWait('claim', [boxIdClaim, recipient.address, signature])
  console.log(`claim() confirmed. tx: ${claimHash}`)

  const recipientBal = await read('balanceOf', [recipient.address], USDC, ERC20_ABI)
  console.log(`Recipient USDC balance: ${formatUnits(recipientBal, 6)} (should equal amountClaim = 0.1)`)

  // ---- Test 2: double-claim must revert ----
  console.log(`\nTrying to claim the same box again (must fail)...`)
  try {
    await walletClient.writeContract({
      address: PAYROLL, abi: PAYROLL_ABI, functionName: 'claim', args: [boxIdClaim, recipient.address, signature],
    })
    console.error('❌ UNEXPECTED: double-claim succeeded — this is a bug')
  } catch (e) {
    console.log('✅ Double-claim correctly rejected:', e.shortMessage || e.message)
  }

  // ---- Test 4: reclaim after expiry ----
  console.log(`\nWaiting for the reclaim-test box to expire (~${RECLAIM_EXPIRY_SECONDS}s from payBatch)...`)
  await new Promise(r => setTimeout(r, (RECLAIM_EXPIRY_SECONDS + 5) * 1000))

  const companyBalBeforeReclaim = await read('balanceOf', [company.address], USDC, ERC20_ABI)
  const reclaimHash = await sendAndWait('reclaim', [boxIdReclaim])
  const companyBalAfterReclaim = await read('balanceOf', [company.address], USDC, ERC20_ABI)
  console.log(`reclaim() confirmed. tx: ${reclaimHash}`)
  console.log(`Company USDC balance before: ${formatUnits(companyBalBeforeReclaim, 6)}, after: ${formatUnits(companyBalAfterReclaim, 6)}`)
  console.log(`Difference: ${formatUnits(companyBalAfterReclaim - companyBalBeforeReclaim, 6)} (should equal amountReclaim = 0.05)`)

  console.log(`\n✅ All scenarios exercised. Recipient wallet used for this test (ephemeral, not saved): ${recipient.address}`)
}

main().catch(err => {
  console.error('\nTest script failed:', err.shortMessage || err.message)
  process.exit(1)
})
