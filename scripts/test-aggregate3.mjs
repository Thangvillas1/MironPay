/**
 * De-risk script for Payroll v0 (see mironpay-payroll-spec-v0.md §6.1).
 *
 * Fires ONE real Multicall3From.aggregate3() call on Arc Testnet, batching
 * two tiny USDC transfer() calls, to confirm what shape Circle's
 * createContractExecutionTransaction wants for a `(address,bool,bytes)[]`
 * (tuple-array) parameter. Existing repo usage (app/api/wallet/transfer/route.ts)
 * only demonstrates flat primitive params — this is unverified territory.
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-aggregate3.mjs <walletId> <recipient1> <recipient2>
 *
 * <walletId>   Circle walletId of a wallet holding at least ~0.02 USDC + gas.
 * <recipient1/2> Any two Arc testnet addresses (can be the same address twice
 *                for a trivial self-send test).
 *
 * Tries shape (a) nested positional arrays first. If Circle's API rejects
 * that, comment it out and uncomment shape (b) (nested objects) below.
 */

import { encodeFunctionData, parseAbi, getAddress } from 'viem'
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
})

const USDC = '0x3600000000000000000000000000000000000000' // 6 decimals
const MULTICALL3_FROM = '0x522fAf9A91c41c443c66765030741e4AaCe147D0'
const AMOUNT_MICRO = 10_000n // 0.01 USDC

const ERC20_ABI = parseAbi(['function transfer(address to, uint256 amount) returns (bool)'])

async function main() {
  const [walletId, recipient1, recipient2] = process.argv.slice(2)
  if (!walletId || !recipient1 || !recipient2) {
    console.error('Usage: node --env-file=.env.local scripts/test-aggregate3.mjs <walletId> <recipient1> <recipient2>')
    process.exit(1)
  }

  const calls = [recipient1, recipient2].map((to) => ({
    target: USDC,
    allowFailure: true,
    callData: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [getAddress(to), AMOUNT_MICRO],
    }),
  }))

  // --- Shape (a): nested positional arrays ---
  const abiParametersA = [calls.map((c) => [c.target, c.allowFailure, c.callData])]

  // --- Shape (b): nested objects (fallback if (a) is rejected) ---
  // const abiParametersB = [calls.map((c) => ({ target: c.target, allowFailure: c.allowFailure, callData: c.callData }))]

  console.log('Calling aggregate3 on Multicall3From with shape (a)...')
  console.log(JSON.stringify(abiParametersA, null, 2))

  try {
    const tx = await circleClient.createContractExecutionTransaction({
      walletId,
      contractAddress: MULTICALL3_FROM,
      abiFunctionSignature: 'aggregate3((address,bool,bytes)[])',
      abiParameters: abiParametersA,
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey: crypto.randomUUID(),
    })

    const txId = tx.data?.id
    console.log(`Submitted. Circle transaction id: ${txId}`)

    const confirmed = await circleClient.getTransaction({
      id: txId,
      waitForState: 'COMPLETE',
      pollingInterval: 1500,
    })

    const txHash = confirmed.data?.transaction?.txHash
    const state = confirmed.data?.transaction?.state
    console.log(`Final state: ${state}`)
    console.log(`Tx hash: ${txHash}`)
    if (txHash) {
      console.log(`Explorer: https://testnet.arcscan.app/tx/${txHash}`)
    }
    console.log('\nRaw transaction response:')
    console.log(JSON.stringify(confirmed.data, null, 2))
  } catch (err) {
    console.error('\naggregate3 call failed with shape (a):')
    console.error(err.response?.data ?? err.message ?? err)
    console.error('\nIf this is a validation error about abiParameters shape, try shape (b) instead (see commented-out code above).')
    process.exit(1)
  }
}

main()
