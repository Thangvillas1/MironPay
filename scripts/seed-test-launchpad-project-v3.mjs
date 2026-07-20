/**
 * One-off: seed a longer-running test Launchpad project (76-day sale window)
 * against the v3 contract (token claim). Uses the existing "VaPay" test
 * token (VP) already held in the test wallet as the project's ERC-20.
 *
 * Usage: node --env-file=.env.local scripts/seed-test-launchpad-project-v3.mjs
 */
import { createWalletClient, createPublicClient, http, keccak256, toBytes, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUBMITTED_BY = 'da844f76-0271-4101-9208-2300c850ddd8' // thang1usd@gmail.com
const CONTRACT = process.env.IDO_LAUNCHPAD_CONTRACT
const TREASURY = process.env.AGENT_OWNER_ADDRESS
const VP_TOKEN = '0xd5c71e8e278b5b3fca62c60281127a197efded03'
const USDC_DECIMALS = 6
const PRICE_USD = 0.01 // $0.01 per VP token

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
}

const ABI = parseAbi([
  'function createSale(bytes32 saleId, (address treasury,uint256 cap,uint256 minRaise,uint256 minContribution,uint256 maxContribution,uint64 startTime,uint64 endTime,address tokenAddress,uint8 tokenDecimals,uint256 priceMicro) params) external',
  'function decimals() view returns (uint8)',
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
  const projectId = `vapay-ido-${Date.now()}`
  const now = new Date()
  const startAt = new Date(now.getTime() - 60_000) // started 1 min ago
  const endAt = new Date(now.getTime() + 76 * 24 * 60 * 60_000) // 76 days from now

  console.log(`Creating test project "${projectId}" (76-day window)...`)

  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })
  const tokenDecimals = await publicClient.readContract({ address: VP_TOKEN, abi: ABI, functionName: 'decimals' })
  console.log('VP token decimals:', tokenDecimals)

  const [submission] = await sb('launchpad_submissions', {
    method: 'POST',
    body: JSON.stringify({
      submitted_by: SUBMITTED_BY,
      status: 'approved',
      project_id: projectId,
      name: 'VaPay IDO',
      sym: 'VP',
      mark: 'VP',
      accent: '#22c6e0',
      category: 'Test',
      tagline: 'Long-running test sale for flow + claim verification',
      blurb: 'A 76-day test IDO using the existing VaPay (VP) test token to verify contribute, softcap, deposit, and claim flows end-to-end.',
      price: PRICE_USD,
      target: 100,
      min_raise: 50,
      cap: 10,
      min_contribution: 1,
      supply: '1000000',
      token_address: VP_TOKEN,
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

  console.log('Creating sale on-chain (v3)...')
  const hash = await walletClient.writeContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'createSale',
    args: [
      saleId,
      {
        treasury: TREASURY,
        cap: toMicro(100),
        minRaise: toMicro(50),
        minContribution: toMicro(1),
        maxContribution: toMicro(10),
        startTime: BigInt(Math.floor(startAt.getTime() / 1000)),
        endTime: BigInt(Math.floor(endAt.getTime() / 1000)),
        tokenAddress: VP_TOKEN,
        tokenDecimals,
        priceMicro: toMicro(PRICE_USD),
      },
    ],
  })
  console.log('Sale creation tx submitted:', hash)

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
  console.log(`Softcap $50, hardcap $100, ends ${endAt.toDateString()} (76 days)`)
  console.log(`Price $0.01/VP — contribute $X to get an estimate of X*100 VP owed at claim.`)
}

main().catch(err => { console.error(err); process.exit(1) })
