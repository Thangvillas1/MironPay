import { supabase } from '@/app/lib/supabase'

// Every page under (app)/ calls this once on mount to gate entry, which
// added a redundant Supabase round-trip to every single tab switch.
// Completion is monotonic — once true for a user it can't become false
// again — so a positive result is safe to cache in memory for the rest of
// the session and skip the network call on subsequent navigations. A
// negative result is never cached: it's what gates the live onboarding flow
// and must reflect the current, real state every time.
const completedCache = new Set<string>()

// Onboarding isn't finished until username + PIN + main wallet all exist —
// a session alone (Google connected) is not enough to enter the app.
export async function isOnboardingComplete(userId: string): Promise<boolean> {
  if (completedCache.has(userId)) return true

  const { data } = await supabase
    .from('profiles')
    .select('username, pin_hash, wallet_address')
    .eq('id', userId)
    .single()

  const complete = !!(data?.username && data?.pin_hash && data?.wallet_address)
  if (complete) completedCache.add(userId)
  return complete
}
