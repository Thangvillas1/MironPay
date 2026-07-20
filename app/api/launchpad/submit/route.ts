import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getAddress } from 'viem'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { circleClient } from '@/app/lib/circle'
import { resolveCircleWalletId } from '@/app/lib/circle-wallet'

const LISTING_FEE_USDC = 50
const TREASURY_ADDRESS = process.env.AGENT_OWNER_ADDRESS!

function hashPin(userId: string, pin: string): string {
  return createHash('sha256').update(`${userId}:${pin}:miron`).digest('hex')
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { pin, name, sym, mark, accent, category, tagline, blurb, highlights, team, backers, socialLinks,
      tokenomics, vesting, price, target, cap, minRaise, minContribution, supply, audit, startAt, endAt, tokenAddress } = body

    if (!pin || typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN required' }, { status: 400 })
    }
    if (!name || !sym || !mark || !accent || !category || !tagline || !blurb || !supply || !startAt || !endAt || !tokenAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    let checksummedToken: string
    try {
      checksummedToken = getAddress(tokenAddress)
    } catch {
      return NextResponse.json({ error: 'Invalid token contract address checksum' }, { status: 400 })
    }
    const priceNum = parseFloat(price), targetNum = parseFloat(target), capNum = parseFloat(cap), minNum = parseFloat(minContribution)
    const minRaiseNum = parseFloat(minRaise)
    if ([priceNum, targetNum, capNum, minNum, minRaiseNum].some(n => isNaN(n) || n <= 0)) {
      return NextResponse.json({ error: 'Price/target/softcap/cap/min must be positive numbers' }, { status: 400 })
    }
    if (capNum < minNum) return NextResponse.json({ error: 'Per-wallet cap must be >= minimum contribution' }, { status: 400 })
    if (minRaiseNum > targetNum) return NextResponse.json({ error: 'Softcap must be <= raise target' }, { status: 400 })
    const startDate = new Date(startAt), endDate = new Date(endAt)
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
      return NextResponse.json({ error: 'Invalid sale window' }, { status: 400 })
    }

    // Verify PIN (same canonical hash used across the whole app)
    const { data: profile } = await supabase.from('profiles').select('pin_hash').eq('id', user.id).single()
    if (!profile?.pin_hash) {
      return NextResponse.json({ error: 'Set a PIN first (from the Wallet page) before submitting a project.' }, { status: 400 })
    }
    const computedHash = hashPin(user.id, pin)
    if (computedHash !== profile.pin_hash) {
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 403 })
    }

    // Resolve unique project slug
    const baseSlug = slugify(name)
    if (!baseSlug) return NextResponse.json({ error: 'Invalid project name' }, { status: 400 })
    let projectId = baseSlug
    for (let i = 2; i < 50; i++) {
      const { data: existing } = await supabase.from('launchpad_submissions').select('id').eq('project_id', projectId).maybeSingle()
      if (!existing) break
      projectId = `${baseSlug}-${i}`
    }

    // Charge the real listing fee from the submitter's Main Wallet
    const wallet = await resolveCircleWalletId(supabase, user.id)
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    const balRes = await circleClient.getWalletTokenBalance({ id: wallet.circleWalletId })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usdc = ((balRes.data?.tokenBalances ?? []) as any[]).find(b => b.token?.symbol === 'USDC')
    if (!usdc?.token?.id) return NextResponse.json({ error: 'USDC not found in wallet' }, { status: 400 })
    if (parseFloat(usdc.amount ?? '0') < LISTING_FEE_USDC) {
      return NextResponse.json({ error: `Insufficient USDC balance — listing fee is $${LISTING_FEE_USDC}` }, { status: 400 })
    }

    const feeTx = await circleClient.createTransaction({
      walletId: wallet.circleWalletId,
      tokenId: usdc.token.id,
      destinationAddress: TREASURY_ADDRESS,
      amount: [LISTING_FEE_USDC.toString()],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      idempotencyKey: crypto.randomUUID(),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feeTxId = (feeTx.data as any)?.id
    let feeTxHash: string | null = null
    if (feeTxId) {
      try {
        const confirmed = await circleClient.getTransaction({ id: feeTxId, waitForState: 'SENT', pollingInterval: 1500 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        feeTxHash = (confirmed.data as any)?.transaction?.txHash ?? null
      } catch { /* keep going without a hash yet */ }
    }
    if (!feeTxId) return NextResponse.json({ error: 'Listing fee payment failed' }, { status: 500 })

    const { data: inserted, error: insertErr } = await supabase.from('launchpad_submissions').insert({
      submitted_by: user.id,
      project_id: projectId,
      name, sym, mark, accent, category, tagline, blurb,
      highlights: highlights ?? [], team: team ?? [], backers: backers ?? [], social_links: socialLinks ?? {},
      tokenomics: tokenomics ?? [], vesting: vesting ?? [],
      price: priceNum, target: targetNum, cap: capNum, min_raise: minRaiseNum, min_contribution: minNum,
      token_address: checksummedToken,
      supply, audit: audit ?? null,
      start_at: startDate.toISOString(), end_at: endDate.toISOString(),
      listing_fee_usdc: LISTING_FEE_USDC, listing_fee_tx_hash: feeTxHash,
    }).select('id').single()

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, submissionId: inserted?.id, projectId, feeTxHash })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[launchpad/submit]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
