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
