/**
 * Deploy IDOClaim contract to ARC Testnet.
 * Usage: node --env-file=.env.local scripts/deploy-ido-claim.mjs
 *
 * Requires IDO_LAUNCHPAD_CONTRACT already set in .env.local (constructor arg).
 * After deploy: copy the printed address to .env.local as IDO_CLAIM_CONTRACT=0x...
 */

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const solc = require('solc')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
}

async function main() {
  const ownerKey = process.env.AGENT_OWNER_PRIVATE_KEY
  if (!ownerKey) {
    console.error('Error: AGENT_OWNER_PRIVATE_KEY not set in .env.local')
    process.exit(1)
  }

  const launchpadAddress = process.env.IDO_LAUNCHPAD_CONTRACT
  if (!launchpadAddress) {
    console.error('Error: IDO_LAUNCHPAD_CONTRACT not set in .env.local')
    process.exit(1)
  }

  const contractPath = path.join(__dirname, '../contracts/IDOClaim.sol')
  const source = readFileSync(contractPath, 'utf8')

  console.log('Compiling IDOClaim.sol...')

  const input = {
    language: 'Solidity',
    sources: { 'IDOClaim.sol': { content: source } },
    settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
  }

  const compiled = JSON.parse(solc.compile(JSON.stringify(input)))

  if (compiled.errors) {
    const errors = compiled.errors.filter(e => e.severity === 'error')
    if (errors.length > 0) {
      console.error('Compilation errors:')
      errors.forEach(e => console.error(e.formattedMessage))
      process.exit(1)
    }
    compiled.errors.forEach(e => console.warn(e.formattedMessage))
  }

  const contract = compiled.contracts['IDOClaim.sol']['IDOClaim']
  const abi = contract.abi
  const bytecode = '0x' + contract.evm.bytecode.object

  console.log('Compilation successful.')
  console.log('ABI functions:', abi.map(f => f.name).filter(Boolean).join(', '))

  const abiOutPath = path.join(__dirname, '../app/lib/ido-claim-abi.json')
  const { writeFileSync } = await import('fs')
  writeFileSync(abiOutPath, JSON.stringify(abi, null, 2))
  console.log(`ABI written to ${abiOutPath}`)

  const account = privateKeyToAccount(ownerKey)
  console.log(`Deploying from: ${account.address}`)
  console.log(`Linked IDOLaunchpad: ${launchpadAddress}`)

  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http() })
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })

  console.log('Deploying to ARC Testnet...')

  const hash = await walletClient.deployContract({ abi, bytecode, args: [launchpadAddress] })
  console.log(`Deploy TX: ${hash}`)
  console.log('Waiting for confirmation...')

  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })

  if (!receipt.contractAddress) {
    console.error('Deploy failed — no contract address in receipt')
    process.exit(1)
  }

  console.log('\n✅ IDOClaim deployed!')
  console.log(`Contract address: ${receipt.contractAddress}`)
  console.log('\nAdd to .env.local:')
  console.log(`IDO_CLAIM_CONTRACT=${receipt.contractAddress}`)
  console.log(`\nView on explorer: https://testnet.arcscan.app/address/${receipt.contractAddress}`)
}

main().catch(err => {
  console.error('Deploy failed:', err.message)
  process.exit(1)
})
