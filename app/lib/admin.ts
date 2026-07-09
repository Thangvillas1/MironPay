// Simple env-based admin gate — no role system in the DB yet. Only ever
// checked server-side (API routes), never trust a client-side check alone.
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const list = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  return list.includes(email.toLowerCase())
}
