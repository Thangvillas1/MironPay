import { circleClient } from '@/app/lib/circle'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Lay circle_wallet_id cua user tu profiles.
 * Neu chua co (user cu), tu dong tim trong Circle va cap nhat profiles.
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

  // Fallback: tim trong Circle bang wallet address
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletsRes = await circleClient.listWallets({} as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (walletsRes.data?.wallets as any[])?.find(
    (w) => w.address?.toLowerCase() === profile.wallet_address.toLowerCase()
  )

  if (!match?.id) return null

  // Luu lai cho lan sau
  await supabase
    .from('profiles')
    .update({ circle_wallet_id: match.id })
    .eq('id', userId)

  return { circleWalletId: match.id, walletAddress: profile.wallet_address }
}
