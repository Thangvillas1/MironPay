import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Route map (auth enforced client-side — see SPEC.md):
//   /login                          public
//   /auth/callback                  public
//   /onboarding/username            requires session (no username yet)
//   /onboarding/confirm-username    requires session + pending username in ?username=
//   /onboarding/setup-pin           requires session + pending username in ?username=
//   /dashboard                      requires session + username
//
// Proxy cannot read the Supabase session: the browser client stores it in
// localStorage, not in a cookie. Auth guards live in each page's useEffect.
//
// TODO: migrate to @supabase/ssr, then enforce here:
//   import { createServerClient } from '@supabase/ssr'
//   const supabase = createServerClient(url, key, { cookies: { get: k => req.cookies.get(k)?.value } })
//   const { data: { session } } = await supabase.auth.getSession()
//   const { data: profile } = await supabase.from('profiles').select('username').eq('id', session.user.id).single()
export function proxy(_req: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
