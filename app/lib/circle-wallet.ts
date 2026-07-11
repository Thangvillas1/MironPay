import { circleClient } from '@/app/lib/circle'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Get the user's circle_wallet_id from profiles.
 * If missing (legacy user), look it up in Circle and backfill profiles.
 */
export async function resolveCircleWalletId(
  supabase: SupabaseClient,
  userId: string
): Promise<{ circleWalletId: string; walletAddress: string } | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('wallet_address, circle_wallet_id')
    .eq('id', userId)
    .single()

  if (!profile?.wallet_address) return null

  if (profile.circle_wallet_id) {
    return { circleWalletId: profile.circle_wallet_id, walletAddress: profile.wallet_address }
  }

  // Fallback: look it up in Circle by wallet address
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletsRes = await circleClient.listWallets({} as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (walletsRes.data?.wallets as any[])?.find(
    (w) => w.address?.toLowerCase() === profile.wallet_address.toLowerCase()
  )

  if (!match?.id) return null

  // Save it for next time
  await supabase
    .from('profiles')
    .update({ circle_wallet_id: match.id })
    .eq('id', userId)

  return { circleWalletId: match.id, walletAddress: profile.wallet_address }
}
