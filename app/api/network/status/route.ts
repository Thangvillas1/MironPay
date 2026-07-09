import { NextResponse } from 'next/server'
import { arcPublicClient } from '@/app/lib/arc-chain'

// Gas price from eth_gasPrice is standard 18-decimal wei-equivalent (verified live:
// 21.5e9 wei * 21000 gas / 1e18 ≈ $0.00045, matching ARC's advertised sub-cent fees) —
// NOT the 6-decimal USDC display precision used for balances/transfers.
const TRANSFER_GAS_UNITS = 21_000n
const WEI_PER_UNIT = 1e18
// Single-block deltas are often 0s on ARC's sub-second block times — average over a
// wider window for a meaningful number.
const CONFIRM_SAMPLE_BLOCKS = 20n

export async function GET() {
  try {
    const client = arcPublicClient()
    const latest = await client.getBlock()
    const sample = await client.getBlock({ blockNumber: latest.number - CONFIRM_SAMPLE_BLOCKS })

    const avgConfirmSec = Number(latest.timestamp - sample.timestamp) / Number(CONFIRM_SAMPLE_BLOCKS)
    const gasPriceWei = await client.getGasPrice()
    const gasUsd = (Number(gasPriceWei * TRANSFER_GAS_UNITS) / WEI_PER_UNIT).toFixed(5)

    return NextResponse.json({
      chain: 'ARC · Circle',
      blockHeight: Number(latest.number),
      gasUsd: `~$${gasUsd}`,
      avgConfirmSec: avgConfirmSec > 0 ? avgConfirmSec : null,
      online: true,
    })
  } catch (err) {
    console.error('[network/status]', err instanceof Error ? err.message : err)
    return NextResponse.json({
      chain: 'ARC · Circle', blockHeight: null, gasUsd: null, avgConfirmSec: null, online: false,
    })
  }
}
