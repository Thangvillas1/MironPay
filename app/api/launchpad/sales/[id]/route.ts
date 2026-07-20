import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { getSaleOnChain, getUserContributionOnChain, saleIdFromProjectId } from '@/app/lib/launchpad-chain'
import { isAdminEmail } from '@/app/lib/admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminSupabaseClient()

  const { data: s } = await admin
    .from('launchpad_submissions')
    .select('*')
    .eq('project_id', id)
    .eq('status', 'approved')
    .maybeSingle()

  if (!s) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const onChain = await getSaleOnChain(s.project_id).catch(() => null)
  const { data: contributionRows } = await admin
    .from('launchpad_contributions')
    .select('user_id')
    .eq('project_id', s.project_id)
  const backers = new Set((contributionRows ?? []).map(r => r.user_id)).size

  const now = Date.now()
  const start = new Date(s.start_at).getTime()
  const end = new Date(s.end_at).getTime()
  const status = now < start ? 'soon' : now > end ? 'ended' : 'live'

  // Best-effort: the caller's own on-chain contribution, checking both wallets
  // since contribution can come via the manual Main Wallet flow or the
  // agent-assisted Agent Wallet flow.
  let myContribution = 0
  let isOwnerOrAdmin = false
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (token) {
    try {
      const supabase = createServerSupabaseClient(token)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        isOwnerOrAdmin = user.id === s.submitted_by || isAdminEmail(user.email)
        const { data: profile } = await supabase.from('profiles').select('wallet_address, agent_wallet_address').eq('id', user.id).single()
        const [mainContribution, agentContribution] = await Promise.all([
          profile?.wallet_address ? getUserContributionOnChain(s.project_id, profile.wallet_address) : Promise.resolve(0),
          profile?.agent_wallet_address ? getUserContributionOnChain(s.project_id, profile.agent_wallet_address) : Promise.resolve(0),
        ])
        myContribution = mainContribution + agentContribution
      }
    } catch { /* not logged in / no wallet yet — fine, default to 0 */ }
  }

  return NextResponse.json({
    id: s.project_id,
    name: s.name, sym: s.sym, mark: s.mark, accent: s.accent, category: s.category,
    tagline: s.tagline, blurb: s.blurb, highlights: s.highlights,
    team: s.team, backersList: s.backers, socialLinks: s.social_links,
    tokenomics: s.tokenomics, vesting: s.vesting,
    price: s.price, target: s.target, cap: s.cap, minContribution: s.min_contribution,
    supply: s.supply, audit: s.audit,
    startAt: s.start_at, endAt: s.end_at, status,
    raised: onChain?.totalRaised ?? 0,
    minRaise: onChain?.minRaise ?? s.min_raise ?? 0,
    softcapMet: onChain ? onChain.totalRaised >= onChain.minRaise : true,
    backers,
    myContribution,
    onChainRegistered: !!onChain,
    isOwnerOrAdmin,
    saleIdHash: saleIdFromProjectId(s.project_id),
    contractAddress: process.env.IDO_LAUNCHPAD_CONTRACT ?? null,
    tokenAddress: onChain?.tokenAddress ?? s.token_address ?? null,
    tokenDecimals: onChain?.tokenDecimals ?? null,
    priceMicro: onChain?.priceMicro ?? null,
    tokensDeposited: onChain?.tokensDeposited ?? 0,
  })
}
