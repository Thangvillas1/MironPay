export const PIN_REAUTH_WINDOW_MS = 10 * 60 * 1000

export type PinVerificationFailure = {
  ok: false
  error: string
  code: 'INVALID_PIN' | 'PIN_LOCKED' | 'PIN_UNAVAILABLE' | 'PIN_NOT_SET' | 'WRONG_PIN'
  retryAfterSeconds?: number
}

export type PinVerificationResult = { ok: true } | PinVerificationFailure

export function isRecentPinAuthentication(
  lastSignInAt: string | null | undefined,
  now = Date.now(),
): boolean {
  const lastSignIn = Date.parse(lastSignInAt ?? '')
  const age = now - lastSignIn
  return Number.isFinite(lastSignIn) && age >= -60_000 && age <= PIN_REAUTH_WINDOW_MS
}

export function pinFailureHttp(failure: PinVerificationFailure): {
  status: number
  headers?: Record<string, string>
} {
  if (failure.code === 'PIN_LOCKED') {
    return {
      status: 429,
      headers: { 'Retry-After': String(failure.retryAfterSeconds ?? 1) },
    }
  }
  if (failure.code === 'PIN_UNAVAILABLE') return { status: 503 }
  if (failure.code === 'PIN_NOT_SET') return { status: 409 }
  if (failure.code === 'WRONG_PIN') return { status: 401 }
  return { status: 400 }
}
