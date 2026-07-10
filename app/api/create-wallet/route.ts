import { NextRequest, NextResponse } from 'next/server'
import { circleClient } from '@/app/lib/circle'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Idempotent: if this user already has wallets on file, hand those back
  // instead of minting new ones. Onboarding can be retried after a
  // mid-flow failure (F5, network drop) — retrying must never orphan a
  // wallet that was already created on-chain for this user.
  const { data: existing } = await supabase
    .from('profiles')
    .select('wallet_address, circle_wallet_id, agent_wallet_address, agent_wallet_id')
    .eq('id', user.id)
    .single()

  if (existing?.wallet_address && existing?.agent_wallet_address) {
    return NextResponse.json({
      address: existing.wallet_address,
      walletId: existing.circle_wallet_id,
      agentAddress: existing.agent_wallet_address,
      agentWalletId: existing.agent_wallet_id,
    })
  }

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

  // Persist immediately, server-side — a client crash/refresh right after
  // this response must not lose track of wallets that already exist on-chain.
  const { error: saveError } = await supabase
    .from('profiles')
    .update({
      wallet_address: mainWallet.address,
      circle_wallet_id: mainWallet.id,
      agent_wallet_address: agentWallet.address,
      agent_wallet_id: agentWallet.id,
    })
    .eq('id', user.id)

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 })
  }

  await supabase
    .from('wallets')
    .upsert({ user_id: user.id, balance: 0, currency: 'USD' }, { onConflict: 'user_id', ignoreDuplicates: true })

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
