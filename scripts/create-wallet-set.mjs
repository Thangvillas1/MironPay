/**
 * Chay 1 lan de tao Circle Wallet Set.
 * Usage: node scripts/create-wallet-set.mjs
 * Can CIRCLE_API_KEY va CIRCLE_ENTITY_SECRET trong .env.local
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'

// Doc .env.local
const envPath = resolve(process.cwd(), '.env.local')
const env = readFileSync(envPath, 'utf-8')
  .split('\n')
  .reduce((acc, line) => {
    const [k, ...v] = line.split('=')
    if (k && v.length) acc[k.trim()] = v.join('=').trim()
    return acc
  }, {})

const CIRCLE_API_KEY = env['CIRCLE_API_KEY']
const CIRCLE_ENTITY_SECRET = env['CIRCLE_ENTITY_SECRET']

if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
  console.error('Thieu CIRCLE_API_KEY hoac CIRCLE_ENTITY_SECRET trong .env.local')
  process.exit(1)
}

const client = initiateDeveloperControlledWalletsClient({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
})

const response = await client.createWalletSet({ name: 'MironPay' })
const walletSetId = response.data?.walletSet?.id

if (!walletSetId) {
  console.error('Loi:', JSON.stringify(response))
  process.exit(1)
}

console.log('\n=== Wallet Set da tao thanh cong ===')
console.log('CIRCLE_WALLET_SET_ID=' + walletSetId)
console.log('\nThem dong tren vao .env.local la xong.')
