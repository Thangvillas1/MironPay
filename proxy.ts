import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = new Set(['/', '/auth/callback', '/leaderboard', '/mobile-app', '/m'])

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith('/invoice/') || pathname.startsWith('/m/')
}

const MOBILE_UA = /Android|iPhone|iPad|iPod/i

export async function proxy(request: NextRequest) {
  // Phones hitting the homepage get the real mobile app (/m) instead of the
  // desktop-styled login card — done here (server-side, off the real
  // request User-Agent) rather than client-side so it can't flash the wrong
  // screen first and works even before any client JS runs.
  if (request.nextUrl.pathname === '/' && MOBILE_UA.test(request.headers.get('user-agent') ?? '')) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/m'
    return NextResponse.redirect(redirect)
  }

  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) return response

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        for (const cookie of cookies) request.cookies.set(cookie.name, cookie.value)
        response = NextResponse.next({ request })
        for (const cookie of cookies) response.cookies.set(cookie.name, cookie.value, cookie.options)
      },
    },
  })

  // getUser verifies the JWT with Supabase; getSession alone must not be used
  // as an authorization decision in middleware.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/'
    redirect.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(redirect)
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|html)$).*)'],
}
