import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function getServerUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Protected layouts fail closed when auth is not configured. This avoids
  // accidentally rendering private app screens in a broken deployment.
  if (!url || !anonKey) return null

  const cookieStore = await cookies()
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options)
          }
        } catch {
          // Server Components cannot always write cookies. The root Proxy
          // refreshes them when it runs, while this client still verifies the
          // current request and provides a production-safe auth fallback.
        }
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Cheap "is someone signed in?" gate for protected layouts. getUser() above
 * makes a round trip to Supabase Auth on every navigation; this project signs
 * JWTs with an asymmetric key (ES256), so getClaims() verifies the token's
 * signature and expiry locally against the cached JWKS — same trust level for
 * a yes/no gate, minus a network hop that ran on every tab switch.
 */
export async function hasServerSession(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return false

  const cookieStore = await cookies()
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options)
          }
        } catch {
          // See getServerUser: the Proxy refreshes cookies when it runs.
        }
      },
    },
  })

  const { data, error } = await supabase.auth.getClaims()
  return !error && !!data?.claims?.sub
}
