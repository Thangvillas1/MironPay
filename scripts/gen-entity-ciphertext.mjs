/**
 * Chay 1 lan de tao Entity Secret Ciphertext cho Circle.
 * Usage: node scripts/gen-entity-ciphertext.mjs
 * Can CIRCLE_API_KEY va CIRCLE_ENTITY_SECRET trong .env.local
 */

import crypto from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
const env = readFileSync(envPath, 'utf-8')
  .split('\n')
  .reduce((acc, line) => {
    const [k, ...v] = line.split('=')
    if (k && v.length) acc[k.trim()] = v.join('=').trim()
    return acc
  }, {})

const CIRCLE_API_KEY = env['CIRCLE_API_KEY']
const ENTITY_SECRET = env['CIRCLE_ENTITY_SECRET']

if (!CIRCLE_API_KEY) {
  console.error('Thieu CIRCLE_API_KEY trong .env.local')
  process.exit(1)
}
if (!ENTITY_SECRET || !/^[0-9a-f]{64}$/i.test(ENTITY_SECRET)) {
  console.error('Thieu hoac sai dinh dang CIRCLE_ENTITY_SECRET trong .env.local (can 64 ky tu hex)')
  process.exit(1)
}

const res = await fetch('https://api.circle.com/v1/w3s/config/entity/publicKey', {
  headers: {
    Authorization: `Bearer ${CIRCLE_API_KEY}`,
    'Content-Type': 'application/json',
  },
})

const json = await res.json()
if (!res.ok || !json.data?.publicKey) {
  console.error('Khong lay duoc public key:', JSON.stringify(json))
  process.exit(1)
}

const encrypted = crypto.publicEncrypt(
  {
    key: json.data.publicKey,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  },
  Buffer.from(ENTITY_SECRET, 'hex')
)

const ciphertext = encrypted.toString('base64')
console.log('\n=== Entity Secret Ciphertext (dan vao Circle Console) ===')
console.log(ciphertext)
console.log(`\nDo dai: ${ciphertext.length} ky tu`)
