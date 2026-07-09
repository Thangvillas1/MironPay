'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'

function ConfirmUsernameContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const username = searchParams.get('username') ?? ''

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      if (!username) router.replace('/onboarding/username')
    })
  }, [router, username])

  if (!username) return null

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-xl font-bold text-mp-text">Confirm your username</h1>
        <p className="text-mp-muted text-sm mt-1">This can&apos;t be changed after this step</p>
      </div>

      <div className="bg-mp-card border border-white/8 rounded-[12px] p-6 text-center">
        <p className="text-4xl font-bold text-mp-text my-6">@{username}</p>

        <div className="bg-mp-warning/10 border border-mp-warning/25 rounded-[8px] p-3 mb-6 text-left">
          <p className="text-sm text-mp-warning">Your username can&apos;t be changed once confirmed.</p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push('/onboarding/username')}
            className="flex-1 border border-white/15 rounded-[8px] py-3 text-sm font-medium text-mp-muted hover:bg-white/5 active:bg-white/10 transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => router.push(`/onboarding/setup-pin?username=${encodeURIComponent(username)}`)}
            className="flex-1 bg-mp-primary text-white rounded-[8px] py-3 text-sm font-semibold hover:bg-blue-600 active:bg-blue-700 transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ConfirmUsernamePage() {
  return (
    <Suspense fallback={<p className="text-sm text-mp-muted">Loading...</p>}>
      <ConfirmUsernameContent />
    </Suspense>
  )
}
