'use client'

import { supabase } from '@/app/lib/supabase'

export const PIN_RECOVERY_NEXT = '/settings?reset_pin=1'
export const PIN_RECOVERY_USER_KEY = 'mironpay_pin_recovery_user'

export async function startPinRecovery(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sign in again to reset your PIN.')

  sessionStorage.setItem(PIN_RECOVERY_USER_KEY, session.user.id)
  const callback = new URL('/auth/callback', window.location.origin)
  callback.searchParams.set('next', PIN_RECOVERY_NEXT)

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) throw error
  if (!data.url) throw new Error('Could not open Google verification.')
  window.location.assign(data.url)
}
