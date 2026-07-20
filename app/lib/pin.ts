import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export function hashPin(userId: string, pin: string): string {
  return createHash('sha256').update(`${userId}:${pin}:miron`).digest('hex')
}

/** Verifies a 6-digit PIN against the user's stored hash. Throws no exceptions — returns a result object. */
export async function verifyPin(
  supabase: SupabaseClient,
  userId: string,
  pin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pin || typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    return { ok: false, error: 'Invalid PIN format' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('pin_hash')
    .eq('id', userId)
    .single()

  if (!profile?.pin_hash) return { ok: false, error: 'PIN not set' }
  if (profile.pin_hash !== hashPin(userId, pin)) return { ok: false, error: 'Incorrect PIN' }

  return { ok: true }
}
