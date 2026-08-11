import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import type { SupabaseClient } from '@supabase/supabase-js'

const scrypt = promisify(scryptCallback)
const PIN_WINDOW_MS = 15 * 60 * 1000
const PIN_MAX_FAILURES = 5
const failedAttempts = new Map<string, { count: number; resetAt: number }>()

function legacyHashPin(userId: string, pin: string): string {
  return createHash('sha256').update(`${userId}:${pin}:miron`).digest('hex')
}

export async function hashPin(userId: string, pin: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scrypt(`${userId}:${pin}`, salt, 32) as Buffer
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

async function matchesPin(userId: string, pin: string, stored: string): Promise<boolean> {
  if (!stored.startsWith('scrypt$')) {
    const expected = Buffer.from(legacyHashPin(userId, pin), 'hex')
    const actual = Buffer.from(stored, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }

  const [, saltHex, hashHex] = stored.split('$')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scrypt(`${userId}:${pin}`, Buffer.from(saltHex, 'hex'), expected.length) as Buffer
  return actual.length === expected.length && timingSafeEqual(actual, expected)
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

  const now = Date.now()
  const attempts = failedAttempts.get(userId)
  if (attempts && attempts.resetAt > now && attempts.count >= PIN_MAX_FAILURES) {
    return { ok: false, error: 'Too many PIN attempts. Try again later' }
  }
  if (attempts && attempts.resetAt <= now) failedAttempts.delete(userId)

  const { data: profile } = await supabase
    .from('profiles')
    .select('pin_hash')
    .eq('id', userId)
    .single()

  if (!profile?.pin_hash) return { ok: false, error: 'PIN not set' }
  if (!(await matchesPin(userId, pin, profile.pin_hash))) {
    const current = failedAttempts.get(userId)
    failedAttempts.set(userId, {
      count: (current?.count ?? 0) + 1,
      resetAt: current?.resetAt && current.resetAt > now ? current.resetAt : now + PIN_WINDOW_MS,
    })
    return { ok: false, error: 'Incorrect PIN' }
  }

  failedAttempts.delete(userId)
  if (!profile.pin_hash.startsWith('scrypt$')) {
    await supabase.from('profiles').update({ pin_hash: await hashPin(userId, pin) }).eq('id', userId)
  }

  return { ok: true }
}
