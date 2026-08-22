import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { createRequire } from 'node:module'
const nativeRequire = createRequire(import.meta.url)

function loadTs(path, stubs = {}) {
  const source = fs.readFileSync(path, 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const moduleRecord = { exports: {} }
  const localRequire = (name) => stubs[name] ?? (name.startsWith('@/') ? {} : nativeRequire(name))
  new Function('module', 'exports', 'require', code)(moduleRecord, moduleRecord.exports, localRequire)
  return moduleRecord.exports
}

const security = loadTs('app/lib/agent-security.ts', { '@/app/lib/circle': { circleClient: {} } })
assert.equal(security.parseAgentAmount('1.25'), 1.25)
assert.equal(security.parseAgentAmount('1,000'), null)
assert.equal(security.parseAgentAmount('1.0000001'), null)
const official = { amount: '2', token: { id: 'official', symbol: 'USDC', tokenAddress: '0x3600000000000000000000000000000000000000' } }
const officialDuplicate = { amount: '3', token: { id: 'official-max', symbol: 'USDC', tokenAddress: '0x3600000000000000000000000000000000000000' } }
const spoof = { amount: '999', token: { id: 'spoof', symbol: 'USDC', tokenAddress: '0x0000000000000000000000000000000000000001' } }
assert.equal(security.resolveCanonicalAgentToken([spoof, official], 'USDC').token.id, 'official')
assert.equal(security.resolveCanonicalAgentToken([official, spoof, officialDuplicate], 'USDC').token.id, 'official-max')
assert.equal(security.resolveCanonicalAgentToken([officialDuplicate, spoof, official], 'USDC').token.id, 'official-max')

const intent = loadTs('app/lib/agent-intent.ts', { '@/app/lib/agent-security': security })
assert.equal(intent.validateAgentIntent('send 2 USDC to @alice', { type: 'send', amount: '2', token: 'USDC', to: '@alice' }).ok, true)
assert.equal(intent.validateAgentIntent('can you send 2 USDC to @alice', { type: 'send', amount: '2', token: 'USDC', to: '@alice' }).ok, false)
assert.equal(intent.validateAgentIntent('swap 2 USDC to EURC', { type: 'swap', amount: '2', tokenIn: 'USDC', tokenOut: 'EURC' }).ok, true)
assert.equal(intent.validateAgentIntent('swap 2 EURC to USDC', { type: 'swap', amount: '2', tokenIn: 'USDC', tokenOut: 'EURC' }).ok, false)
assert.deepEqual(intent.parseDirectSwapIntent('swap 2 usdc to eurc main wallet'), {
  type: 'swap', amount: '2', tokenIn: 'USDC', tokenOut: 'EURC', walletSource: 'main',
})
assert.deepEqual(intent.parseDirectSwapIntent('đổi 2 EURC sang USDC ví agent'), {
  type: 'swap', amount: '2', tokenIn: 'EURC', tokenOut: 'USDC', walletSource: 'agent',
})
assert.equal(intent.parseDirectSwapIntent('can you swap 2 USDC to EURC main wallet'), null)
assert.equal(intent.parseDirectSwapIntent('swap 1,000 USDC to EURC main wallet'), null)

const lifecycle = loadTs('app/lib/agent-transaction-lifecycle.ts', {
  '@/app/lib/circle': { circleClient: {} }, '@/app/lib/supabase-admin': { createAdminSupabaseClient: () => ({}) },
})
assert.equal(lifecycle.classifyCircleState('SENT'), 'pending')
assert.equal(lifecycle.classifyCircleState('FAILED'), 'failed')
assert.equal(lifecycle.classifyCircleState('COMPLETE'), 'complete')
assert.equal(security.stableCircleIdempotencyKey('u1', 'agent-wallet'), security.stableCircleIdempotencyKey('u1', 'agent-wallet'))

const buyer = loadTs('app/lib/x402-buyer.ts', {
  './circle': { circleClient: {} }, './x402-signer': { createCircleX402Signer: () => ({}) }, './agent-security': security,
})
const unsafe = { network: 'eip155:1', asset: '0x3600000000000000000000000000000000000000', amount: '1' }
const expensive = { network: 'eip155:5042002', asset: '0x3600000000000000000000000000000000000000', amount: '10001' }
const safe = { network: 'eip155:5042002', asset: '0x3600000000000000000000000000000000000000', amount: '10000' }
assert.equal(buyer.selectAuthorizedX402Requirement([unsafe, expensive, safe]), safe)
assert.equal(buyer.selectAuthorizedX402Requirement([unsafe, expensive]), null)
const settlementProof = new buyer.X402SettlementUncertainError('paid but response failed', '0xabc', 0.01)
assert.equal(buyer.isX402SettlementUncertain(settlementProof), true)
assert.equal(settlementProof.txHash, '0xabc')

const migration = fs.readFileSync('supabase/migrations/20260822_agent_security_hardening.sql', 'utf8')
assert.match(migration, /before insert or update on public\.profiles/i)
assert.match(migration, /revoke insert, update on public\.profiles from authenticated/i)
assert.match(migration, /grant insert \(id, username\)/i)
assert.match(migration, /revoke insert, update, delete on public\.agent_wallets from authenticated/i)
assert.match(migration, /create policy "Users can read own agent wallet"/i)

const executeSource = fs.readFileSync('app/api/agent/execute/route.ts', 'utf8')
assert.match(executeSource, /Circle submission outcome is uncertain[\s\S]*SUBMISSION_UNCERTAIN/)
assert.match(executeSource, /\['FAILED', 'CANCELLED', 'DENIED'\][\s\S]*TRANSACTION_FAILED[\s\S]*status: 502/)
assert.match(executeSource, /onExternalAttempt:[\s\S]*launchpadExternalAttempted = true/)
assert.match(executeSource, /onTransactionCreated:[\s\S]*launchpadExternalAttempted = true[\s\S]*await attachReservationTransaction/)
assert.match(executeSource, /error instanceof LaunchpadTerminalError[\s\S]*release_agent_spend[\s\S]*LAUNCHPAD_TRANSACTION_FAILED/)
assert.match(executeSource, /if \(!txHash\)[\s\S]*status: 'pending'[\s\S]*TRANSACTION_NOT_COMPLETE/)
assert.match(executeSource, /walletSource === 'agent'[\s\S]*agentIntentProof:[\s\S]*pin: rawPin/)
const launchpadSource = fs.readFileSync('app/lib/launchpad-chain.ts', 'utf8')
assert.ok(launchpadSource.indexOf('onExternalAttempt?.()') < launchpadSource.indexOf('const contributeRes = await circleClient.createContractExecutionTransaction'))
const buyerSource = fs.readFileSync('app/lib/x402-buyer.ts', 'utf8')
assert.match(buyerSource, /if \(!paidRes\.ok\)[\s\S]*settleResponse\?\.transaction[\s\S]*X402SettlementUncertainError/)
assert.match(buyerSource, /waitForState: 'COMPLETE'/)
assert.doesNotMatch(buyerSource, /rpc\.testnet\.arc\.network/)
const chatSource = fs.readFileSync('app/api/agent/chat/route.ts', 'utf8')
assert.match(chatSource, /finalizeError \|\| !finalized/)
assert.match(chatSource, /transaction_hash: err\.txHash/)
const sessionSource = fs.readFileSync('app/api/agent/wallet/session/route.ts', 'utf8')
assert.match(sessionSource, /if \(selectError\)/)
assert.match(sessionSource, /if \(error\) return NextResponse\.json\(\{ error: 'Could not enable Agent session\.'/)
const swapSource = fs.readFileSync('app/api/wallet/swap/route.ts', 'utf8')
assert.match(swapSource, /createAdminSupabaseClient\(\)\.from\('agent_intent_uses'\)\.insert/)
assert.match(swapSource, /assertCircleWalletBinding\(profile\.agent_wallet_id, profile\.agent_wallet_address\)/)
assert.match(swapSource, /typeof agentIntentProof !== 'string' && !hasInternalAgentAuthorization\(request\)/)
assert.match(swapSource, /const RETRY_DELAYS_MS = \[1000, 2000, 3000\]/)
assert.match(chatSource, /const directSwap = parseDirectSwapIntent\(message\)/)
const dashboardSource = fs.readFileSync('app/(app)/dashboard/page.tsx', 'utf8')
assert.match(dashboardSource, /\{\(sending \|\| agentActionProgress\) && \(/)
assert.match(dashboardSource, /Miron Agent đang xác nhận swap/)
assert.doesNotMatch(dashboardSource, /pointer-events-none fixed left-1\/2 top-5/)
const limitSource = fs.readFileSync('app/lib/spending-limit.ts', 'utf8')
assert.match(limitSource, /if \(!contractAddress\) return null/)
assert.match(limitSource, /status: 'pending', txHash: hash/)
assert.doesNotMatch(limitSource, /getOnChainLimit error:[\s\S]*return null/)
const limitRouteSource = fs.readFileSync('app/api/agent/wallet/limit/route.ts', 'utf8')
const proofWrite = limitRouteSource.indexOf("update({ tx_hash: chainResult.txHash })")
const walletWrite = limitRouteSource.indexOf("update({ daily_limit: limit })")
assert.ok(proofWrite >= 0 && proofWrite < walletWrite, 'limit tx hash must be persisted before the wallet DB update')
assert.match(limitRouteSource, /if \(proofError\)[\s\S]*LIMIT_LEDGER_PENDING/)
assert.match(limitRouteSource, /if \(completeError\)[\s\S]*LIMIT_LEDGER_PENDING/)
const withdrawSource = fs.readFileSync('app/api/agent/wallet/withdraw/route.ts', 'utf8')
assert.match(withdrawSource, /waitForState: 'COMPLETE'/)
assert.match(withdrawSource, /const sent = state === 'COMPLETE' && Boolean\(txHash\)/)
assert.match(withdrawSource, /resolveCanonicalAgentToken\(rawBalances, tokenSymbol\)/)
const depositSource = fs.readFileSync('app/api/agent/wallet/deposit/route.ts', 'utf8')
assert.match(depositSource, /\['FAILED', 'CANCELLED', 'DENIED'\][\s\S]*DEPOSIT_FAILED[\s\S]*status: 502/)
console.log('agent security acceptance tests: OK')
