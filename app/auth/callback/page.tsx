'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { useAuthStore } from '@/app/store/auth'

async function resolvePostLoginRoute(userId: string): Promise<'/dashboard' | '/onboarding/username'> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .single()

  return profile?.username ? '/dashboard' : '/onboarding/username'
}

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setUser = useAuthStore((s) => s.setUser)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    async function handleCallback() {
      // OAuth errors arrive as ?error=...&error_description=...
      const errorParam = searchParams.get('error')
      if (errorParam) {
        const desc = searchParams.get('error_description') ?? errorParam
        setErrorMessage(desc.replace(/\+/g, ' '))
        return
      }

      const code = searchParams.get('code')

      if (!code) {
        // No code — check if session already exists (e.g. user navigated here directly)
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          setUser(data.session.user)
          router.replace(await resolvePostLoginRoute(data.session.user.id))
        } else {
          setErrorMessage('No authorization code received. Please try signing in again.')
        }
        return
      }

      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setUser(data.session.user)
      router.replace(await resolvePostLoginRoute(data.session.user.id))
    }

    handleCallback()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (errorMessage) {
    return (
      <div className="w-full max-w-sm p-8 bg-white border border-gray-200 rounded-lg text-center">
        <p className="text-sm text-red-600 mb-4">{errorMessage}</p>
        <button
          type="button"
          onClick={() => router.replace('/login')}
          className="text-sm text-gray-500 hover:underline"
        >
          Back to sign in
        </button>
      </div>
    )
  }

  return <p className="text-sm text-gray-500">Signing you in...</p>
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Suspense fallback={<p className="text-sm text-gray-500">Loading...</p>}>
        <CallbackHandler />
      </Suspense>
    </div>
  )
}
