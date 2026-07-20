/**
 * One-off: seed a test Launchpad project (submission + on-chain sale) so the
 * softcap/refund feature can be tested end-to-end without going through the
 * PIN-gated submit + admin-approve UI flow.
 *
 * Usage: node --env-file=.env.local scripts/seed-test-launchpad-project.mjs
 */
import { createWalletClient, createPublicClient, http, keccak256, toBytes, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUBMITTED_BY = 'da844f76-0271-4101-9208-2300c850ddd8' // thang1usd@gmail.com
const CONTRACT = process.env.IDO_LAUNCHPAD_CONTRACT
const TREASURY = process.env.AGENT_OWNER_ADDRESS
const USDC_DECIMALS = 6

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
}

const ABI = parseAbi([
  'function createSale(bytes32 saleId, address treasury, uint256 cap, uint256 minRaise, uint256 minContribution, uint256 maxContribution, uint64 startTime, uint64 endTime) external',
])

function toMicro(usdc) {
  return BigInt(Math.round(usdc * 10 ** USDC_DECIMALS))
}

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`Supabase ${path} failed: ${res.status} ${JSON.stringify(data)}`)
  return data
}

async function main() {
  if (!CONTRACT) throw new Error('IDO_LAUNCHPAD_CONTRACT not set')
  const projectId = `softcap-test-${Date.now()}`
  const now = new Date()
  const startAt = new Date(now.getTime() - 60_000) // started 1 min ago, so it's immediately live
  const endAt = new Date(now.getTime() + 3 * 60_000) // ends in 3 minutes — fast to test

  console.log(`Creating test project "${projectId}"...`)

  const [submission] = await sb('launchpad_submissions', {
    method: 'POST',
    body: JSON.stringify({
      submitted_by: SUBMITTED_BY,
      status: 'approved',
      project_id: projectId,
      name: 'Softcap Test',
      sym: 'STEST',
      mark: 'ST',
      accent: '#6366f1',
      category: 'Test',
      tagline: 'Testing softcap + auto-refund',
      blurb: 'A throwaway test sale to verify the softcap/refund flow end-to-end. Softcap $50, hardcap $100, ends in 3 minutes.',
      price: 0.01,
      target: 100,
      min_raise: 50,
      cap: 10,
      min_contribution: 1,
      supply: '1000000',
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      listing_fee_usdc: 0,
      reviewed_by: SUBMITTED_BY,
      reviewed_at: now.toISOString(),
    }),
  })

  console.log('Submission inserted:', submission.id)

  const saleId = keccak256(toBytes(projectId))
  const account = privateKeyToAccount(process.env.AGENT_OWNER_PRIVATE_KEY)
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http() })
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })

  console.log('Creating sale on-chain...')
  const hash = await walletClient.writeContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'createSale',
    args: [
      saleId,
      TREASURY,
      toMicro(100), // hardcap
      toMicro(50),  // softcap
      toMicro(1),   // per-wallet min
      toMicro(10),  // per-wallet max
      BigInt(Math.floor(startAt.getTime() / 1000)),
      BigInt(Math.floor(endAt.getTime() / 1000)),
    ],
  })
  await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
  console.log('Sale created on-chain:', hash)

  await sb('launchpad_sales', {
    method: 'POST',
    body: JSON.stringify({
      submission_id: submission.id,
      project_id: projectId,
      sale_id_hash: saleId,
      contract_address: CONTRACT,
      treasury_address: TREASURY,
      create_tx_hash: hash,
    }),
  })

  console.log(`\n✅ Test project ready: /launchpad/${projectId}`)
  console.log(`Softcap $50, hardcap $100, ends ${endAt.toLocaleTimeString()}`)
  console.log(`Contribute LESS than $50 total to test the refund flow once it ends.`)
}

main().catch(err => { console.error(err); process.exit(1) })
