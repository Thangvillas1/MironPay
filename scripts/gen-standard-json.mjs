import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const contractPath = path.join(__dirname, '../contracts/MironPayrollClaim.sol')
const source = readFileSync(contractPath, 'utf8')

const input = {
  language: 'Solidity',
  sources: { 'MironPayrollClaim.sol': { content: source } },
  settings: {
    viaIR: true,
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
  },
}

const outPath = path.join(__dirname, '../scratch/standard-input.json')
writeFileSync(outPath, JSON.stringify(input, null, 2))
console.log('Written to', outPath)
