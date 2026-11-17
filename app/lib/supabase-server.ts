import { createClient } from '@supabase/supabase-js'

export function createServerSupabaseClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    }
  )
}

/**
 * The signed-in user from the request's access token, verified locally
 * (signature + expiry against Supabase's cached public keys) instead of
 * getUser()'s round trip to Supabase Auth on every request. Used by the
 * routes the app calls on every screen; money-moving routes still check the
 * PIN server-side on top of this.
 */
export async function getAuthUser(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  accessToken: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase.auth.getClaims(accessToken)
  const sub = data?.claims?.sub
  return error || !sub ? null : { id: sub }
}
