import { NextRequest, NextResponse } from 'next/server'
import { circleClient } from '@/app/lib/circle'

export async function POST(_request: NextRequest) {
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID
  if (!walletSetId) {
    return NextResponse.json({ error: 'CIRCLE_WALLET_SET_ID not configured' }, { status: 500 })
  }

  // Main wallet: EOA (simple signature, used with PIN)
  const mainRes = await circleClient.createWallets({
    walletSetId,
    blockchains: ['ARC-TESTNET'],
    count: 1,
    accountType: 'EOA',
    idempotencyKey: crypto.randomUUID(),
  })

  const mainWallet = mainRes.data?.wallets?.[0]
  if (!mainWallet?.address) {
    return NextResponse.json({ error: 'Circle did not return main wallet' }, { status: 500 })
  }

  // Agent wallet: EOA — required for x402 nanopayments (ecrecover verify, no ERC-1271 support)
  const agentRes = await circleClient.createWallets({
    walletSetId,
    blockchains: ['ARC-TESTNET'],
    count: 1,
    accountType: 'EOA',
    idempotencyKey: crypto.randomUUID(),
  })

  const agentWallet = agentRes.data?.wallets?.[0]
  if (!agentWallet?.address) {
    return NextResponse.json({ error: 'Circle did not return agent wallet' }, { status: 500 })
  }

  return NextResponse.json({
    address: mainWallet.address,
    walletId: mainWallet.id,
    agentAddress: agentWallet.address,
    agentWalletId: agentWallet.id,
  })
}

// Single EOA wallet for legacy lazy-creation of main wallets
export async function PUT(_request: NextRequest) {
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID
  if (!walletSetId) {
    return NextResponse.json({ error: 'CIRCLE_WALLET_SET_ID not configured' }, { status: 500 })
  }

  const response = await circleClient.createWallets({
    walletSetId,
    blockchains: ['ARC-TESTNET'],
    count: 1,
    accountType: 'EOA',
    idempotencyKey: crypto.randomUUID(),
  })

  const wallet = response.data?.wallets?.[0]
  if (!wallet?.address) {
    return NextResponse.json({ error: 'Circle did not return a wallet' }, { status: 500 })
  }

  return NextResponse.json({ address: wallet.address, walletId: wallet.id })
}
