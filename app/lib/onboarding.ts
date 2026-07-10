import { supabase } from '@/app/lib/supabase'

// Onboarding isn't finished until username + PIN + main wallet all exist —
// a session alone (Google connected) is not enough to enter the app.
export async function isOnboardingComplete(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('username, pin_hash, wallet_address')
    .eq('id', userId)
    .single()

  return !!(data?.username && data?.pin_hash && data?.wallet_address)
}
