/**
 * End-to-end test for the Invoice feature's on-chain verify mechanism on Arc
 * Testnet: creates an invoice row directly (bypassing the auth'd API — no
 * browser session available in a script), sends a real USDC transfer for the
 * exact amount to the invoice's receive_address, then runs the same
 * scan+match logic as app/api/cron/invoice-index/route.ts to confirm the
 * invoice flips to 'paid' — without going through a running Next.js server.
 *
 * Usage: node --env-file=.env.local scripts/test-invoice-flow.mjs
 */

import { createClient } from '@supabase/supabase-js'
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbiItem,
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
const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

const ERC20_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
]

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

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
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
  const payerKey = process.env.AGENT_OWNER_PRIVATE_KEY
  if (!payerKey) throw new Error('AGENT_OWNER_PRIVATE_KEY not set')

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const payer = privateKeyToAccount(payerKey)
  const issuerWallet = privateKeyToAccount(generatePrivateKey()) // stand-in receive_address, no real issuer account needed for this test

  console.log(`Payer:            ${payer.address}`)
  console.log(`Invoice receive_address (fresh, ephemeral): ${issuerWallet.address}`)

  const walletClient = createWalletClient({ account: payer, chain: arcTestnet, transport: http(undefined, { timeout: 30_000 }) })
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(undefined, { timeout: 30_000 }) })

  // --- Find a real issuer_user_id to satisfy the FK (any existing user row is fine — test-only) ---
  const { data: anyUser, error: userErr } = await supabase.from('profiles').select('id').limit(1).single()
  if (userErr || !anyUser) throw new Error('No profiles row found to use as issuer_user_id — sign in to the app at least once first')

  const invoiceCode = `INV-TEST${Date.now().toString().slice(-6)}`
  const amount = 0.1 // USDC
  const dueDate = new Date(Date.now() + 60_000) // 1 min out, doesn't matter for this test

  console.log(`\nCreating invoice ${invoiceCode} for ${amount} USDC...`)
  const { data: invoice, error: insertErr } = await supabase
    .from('invoices')
    .insert({
      issuer_user_id: anyUser.id,
      receive_address: issuerWallet.address,
      recipient_email: 'test-invoice@example.com',
      amount,
      invoice_code: invoiceCode,
      due_date: dueDate.toISOString(),
    })
    .select()
    .single()
  if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`)
  console.log(`Invoice created, status: ${invoice.status}`)

  console.log(`\nSending ${amount} USDC from payer to receive_address (simulating an external wallet paying the invoice)...`)
  const amountMicro = BigInt(Math.round(amount * 1_000_000))
  const beforeBlock = await publicClient.getBlockNumber()
  const txHash = await withRetry(
    () => walletClient.writeContract({ address: USDC, abi: ERC20_ABI, functionName: 'transfer', args: [issuerWallet.address, amountMicro] }),
    { label: 'USDC transfer' }
  )
  await withRetry(() => publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 }), { label: 'wait transfer' })
  console.log(`Transfer confirmed. tx: ${txHash}`)

  console.log(`\nScanning USDC Transfer logs (mirrors app/api/cron/invoice-index logic)...`)
  const tip = await publicClient.getBlockNumber()
  const logs = await withRetry(
    () => publicClient.getLogs({ address: USDC, event: TRANSFER_EVENT, fromBlock: beforeBlock, toBlock: tip }),
    { label: 'getLogs' }
  )
  console.log(`Found ${logs.length} Transfer log(s) in range.`)

  let matched = false
  for (const log of logs) {
    const to = log.args.to?.toLowerCase()
    const value = log.args.value
    if (to !== issuerWallet.address.toLowerCase()) continue
    const matchedAmount = Math.round(Number(value) / 10_000) / 100
    if (matchedAmount !== amount) continue

    console.log(`Match found (tx: ${log.transactionHash}) — marking invoice paid...`)
    const { error: updateErr } = await supabase
      .from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString(), tx_hash: log.transactionHash })
      .eq('id', invoice.id)
      .in('status', ['pending', 'overdue'])
    if (updateErr) throw new Error(`Update failed: ${updateErr.message}`)
    matched = true
    break
  }

  if (!matched) {
    console.error('❌ No matching Transfer log found — on-chain verify did not fire')
    process.exit(1)
  }

  const { data: finalInvoice } = await supabase.from('invoices').select('status, tx_hash, paid_at').eq('id', invoice.id).single()
  console.log(`\n✅ Invoice status after watcher logic: ${finalInvoice.status}`)
  console.log(`   tx_hash: ${finalInvoice.tx_hash}`)
  console.log(`   paid_at: ${finalInvoice.paid_at}`)

  if (finalInvoice.status !== 'paid') {
    console.error('❌ FAIL: invoice did not flip to paid')
    process.exit(1)
  }
  console.log('\n✅ End-to-end invoice on-chain verify flow passed.')
}

main().catch(err => {
  console.error('\nTest script failed:', err.shortMessage || err.message)
  process.exit(1)
})
