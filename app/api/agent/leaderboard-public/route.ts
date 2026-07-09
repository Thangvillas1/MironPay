import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/app/lib/supabase'

// Public — không cần đăng nhập (arc_agent_leaderboard cho phép SELECT công khai qua RLS).
// ?agentId=840671 → chỉ trả rank của 1 agent (nhẹ, dùng cho badge trên dashboard).
// Không có agentId → trả top 50 + tổng số agent có mặt trên bảng xếp hạng.
export async function GET(request: NextRequest) {
  const agentIdParam = request.nextUrl.searchParams.get('agentId')

  if (agentIdParam) {
    const { data: agent } = await supabase
      .from('arc_agent_leaderboard')
      .select('agent_id, total_score, feedback_count')
      .eq('agent_id', agentIdParam)
      .maybeSingle()

    if (!agent) return NextResponse.json({ agentId: agentIdParam, rank: null })

    const { count } = await supabase
      .from('arc_agent_leaderboard')
      .select('*', { count: 'exact', head: true })
      .gt('total_score', agent.total_score)

    return NextResponse.json({
      agentId: agentIdParam,
      rank: (count ?? 0) + 1,
      totalScore: agent.total_score,
      feedbackCount: agent.feedback_count,
    })
  }

  const { data: top } = await supabase
    .from('arc_agent_leaderboard')
    .select('agent_id, total_score, feedback_count, owner_address')
    .order('total_score', { ascending: false })
    .limit(50)

  const { count: totalAgents } = await supabase
    .from('arc_agent_leaderboard')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({
    leaderboard: (top ?? []).map((a, i) => ({ rank: i + 1, ...a })),
    totalAgents: totalAgents ?? 0,
  })
}
