import 'server-only'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import type { ScoreAction } from '@/app/api/score/add/route'

export async function awardVerifiedScore(userId: string, action: ScoreAction, eventId: string) {
  const { data, error } = await createAdminSupabaseClient().rpc('award_miron_score', {
    p_user_id: userId,
    p_action: action,
    p_event_id: eventId,
  })
  if (error) throw new Error(`Score award failed: ${error.message}`)
  return data?.[0] ?? null
}
