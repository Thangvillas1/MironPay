/**
 * End-to-end HTTP test of the payroll-claim API routes against a running
 * dev server (http://localhost:3000). Uses:
 *  - the real thang1usd@gmail.com account as the paying "company"
 *  - a freshly created throwaway test account as the "recipient"
 * so no other real user's account/data is touched.
 *
 * Usage: node --env-file=.env.local scripts/test-payroll-claim-api.mjs
 */
import { createClient } from '@supabase/supabase-js'

const BASE = 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const COMPANY_EMAIL = 'thang1usd@gmail.com'

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

async function sessionForEmail(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  const tokenHash = data.properties?.hashed_token
  if (!tokenHash) throw new Error('No hashed_token in generateLink response')

  const anon = createClient(SUPABASE_URL, ANON_KEY)
  const { data: verified, error: verr } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (verr) throw verr
  return verified.session.access_token
}

async function findUserId(email) {
  let page = 1
  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 50, page })
    if (error) throw error
    const u = data.users.find((u) => u.email === email)
    if (u) return u.id
    if (data.users.length < 50) break
    page++
  }
  return null
}

async function api(path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function main() {
  console.log('--- Setting up recipient test account ---')
  const recipientEmail = `payroll-test-recipient-${Date.now()}@example.com`

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: recipientEmail,
    email_confirm: true,
  })
  if (createErr) throw createErr
  const recipientId = created.user.id
  console.log(`Created recipient auth user: ${recipientId} (${recipientEmail})`)

  const { error: profileErr } = await admin.from('profiles').insert({ id: recipientId })
  if (profileErr) throw profileErr
  console.log('Inserted profiles row.')

  const recipientToken = await sessionForEmail(recipientEmail)
  console.log('Got recipient session token.')

  const walletRes = await api('/api/create-wallet', recipientToken, {})
  if (walletRes.status !== 200) {
    console.error('create-wallet failed:', walletRes.status, walletRes.json)
    process.exit(1)
  }
  console.log(`Recipient wallet: ${walletRes.json.address}`)

  console.log('\n--- Company (thang1usd@gmail.com) pays via /api/payroll/claim/pay ---')
  const companyId = await findUserId(COMPANY_EMAIL)
  if (!companyId) throw new Error('Company user not found')
  const companyToken = await sessionForEmail(COMPANY_EMAIL)
  console.log('Got company session token.')

  const payRes = await api('/api/payroll/claim/pay', companyToken, {
    period: `api-test-${Date.now()}`,
    items: [{ email: recipientEmail, amount: 0.15, note: 'API smoke test' }],
    expirySeconds: 3600,
  })
  console.log('payBatch response:', payRes.status, JSON.stringify(payRes.json, null, 2))
  if (payRes.status !== 200) process.exit(1)

  const runId = payRes.json.run.id

  console.log('\n--- Recipient lists claimable items via GET /api/payroll/claim/claim ---')
  const listRes = await api('/api/payroll/claim/claim', recipientToken)
  console.log('list response:', listRes.status, JSON.stringify(listRes.json, null, 2))
  const item = listRes.json.items?.find((i) => i.run_id === runId)
  if (!item) {
    console.error('Could not find the paid item in recipient claim list')
    process.exit(1)
  }

  console.log('\n--- Recipient claims via POST /api/payroll/claim/claim ---')
  const claimRes = await api('/api/payroll/claim/claim', recipientToken, { itemId: item.id })
  console.log('claim response:', claimRes.status, JSON.stringify(claimRes.json, null, 2))

  console.log('\n✅ Done. Recipient test account (for manual cleanup if desired):', recipientEmail, recipientId)
}

main().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
