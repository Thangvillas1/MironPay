'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, isSupabaseConfigured } from '@/app/lib/supabase'
import { useAuthStore } from '@/app/store/auth'

type LoginState = 'idle' | 'loading' | 'error'

export default function LoginPage() {
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)
  const [state, setState] = useState<LoginState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUser(data.session.user)
        router.replace('/dashboard')
      }
    })
  }, [router, setUser])

  async function handleGoogleLogin() {
    if (!isSupabaseConfigured) {
      setState('error')
      setErrorMessage('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local')
      return
    }

    setState('loading')
    setErrorMessage('')

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      })

      if (error) { setState('error'); setErrorMessage(error.message); return }
      if (!data.url) { setState('error'); setErrorMessage('Could not get the OAuth URL from Supabase.'); return }

      window.location.href = data.url
    } catch (err) {
      setState('error')
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/miron-logo-lockup-horizontal-dark.png" alt="MironPay" className="mp-logo-dark" style={{ height: 40, width: 'auto' }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/miron-logo-lockup-horizontal-light.png" alt="MironPay" className="mp-logo-light" style={{ height: 40, width: 'auto' }} />
        </div>
        <p className="text-mp-muted text-sm mt-1">Stablecoin wallet on ARC Testnet</p>
      </div>

      <div className="bg-mp-card border border-white/8 rounded-[12px] p-6">
        <h2 className="text-base font-semibold text-mp-text mb-1">Sign in</h2>
        <p className="text-sm text-mp-muted mb-5">Continue with your Google account</p>

        {state === 'error' && errorMessage && (
          <p className="mb-4 text-sm text-mp-danger bg-mp-danger/10 border border-mp-danger/20 rounded-[8px] p-3">
            {errorMessage}
          </p>
        )}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={state === 'loading'}
          className="w-full flex items-center justify-center gap-3 border border-white/15 rounded-[8px] py-3 text-sm font-medium text-mp-text hover:bg-white/5 active:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {state !== 'loading' && (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          {state === 'loading' ? 'Redirecting...' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  )
}
