import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { getSaleOnChain } from '@/app/lib/launchpad-chain'

export async function GET() {
  const admin = createAdminSupabaseClient()
  const { data: submissions, error } = await admin
    .from('launchpad_submissions')
    .select('*')
    .eq('status', 'approved')
    .order('start_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const projects = await Promise.all((submissions ?? []).map(async (s) => {
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

    return {
      id: s.project_id,
      name: s.name, sym: s.sym, mark: s.mark, accent: s.accent, category: s.category,
      tagline: s.tagline, blurb: s.blurb, highlights: s.highlights,
      team: s.team, backersList: s.backers, socialLinks: s.social_links,
      tokenomics: s.tokenomics, vesting: s.vesting,
      price: s.price, target: s.target, cap: s.cap, minContribution: s.min_contribution,
      supply: s.supply, audit: s.audit,
      startAt: s.start_at, endAt: s.end_at, status,
      raised: onChain?.totalRaised ?? 0,
      backers,
      onChainRegistered: !!onChain,
    }
  }))

  return NextResponse.json({ projects })
}
