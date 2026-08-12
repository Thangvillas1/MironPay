import { readFileSync } from 'node:fs'
import solc from 'solc'

for (const file of ['IDOLaunchpad.sol', 'MironPayrollClaim.sol', 'MironSpendingLimit.sol']) {
  const input = {
    language: 'Solidity',
    sources: { [file]: { content: readFileSync(new URL(`../contracts/${file}`, import.meta.url), 'utf8') } },
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  }
  const output = JSON.parse(solc.compile(JSON.stringify(input)))
  const errors = (output.errors ?? []).filter(error => error.severity === 'error')
  if (errors.length) throw new Error(`${file}\n${errors.map(error => error.formattedMessage).join('\n')}`)
  console.log(`✓ ${file}`)
}
