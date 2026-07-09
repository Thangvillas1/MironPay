'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/app/lib/supabase'
import { validateUsernameFormat } from '@/app/lib/username'

type ValidationStatus = 'idle' | 'validating' | 'invalid' | 'taken' | 'available'

export default function UsernamePage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState<ValidationStatus>('idle')
  const [reason, setReason] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login')
    })
  }, [router])

  useEffect(() => {
    if (!username) { setStatus('idle'); setReason(''); return }

    const formatError = validateUsernameFormat(username)
    if (formatError) { setStatus('invalid'); setReason(formatError); return }

    setStatus('validating')
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle()
      setStatus(data ? 'taken' : 'available')
    }, 500)

    return () => clearTimeout(timer)
  }, [username])

  function handleInput(value: string) {
    setUsername(value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))
  }

  function handleContinue() {
    if (status !== 'available') return
    router.push(`/onboarding/confirm-username?username=${encodeURIComponent(username)}`)
  }

  const borderColor =
    status === 'invalid' || status === 'taken' ? 'border-mp-danger/50 focus:ring-mp-danger/30' :
    status === 'available' ? 'border-mp-success/50 focus:ring-mp-success/30' :
    'border-white/15 focus:ring-mp-primary/40'

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="w-14 h-14 bg-mp-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-mp-text">Choose a username</h1>
        <p className="text-mp-muted text-sm mt-1">3-20 characters. Letters, numbers and _ only</p>
      </div>

      <div className="bg-mp-card border border-white/8 rounded-[12px] p-6">
        <input
          type="text"
          value={username}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="username"
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={`w-full bg-white/5 border ${borderColor} rounded-[8px] px-3 py-2.5 text-sm text-mp-text placeholder:text-mp-muted mb-1 focus:outline-none focus:ring-2 transition-colors`}
        />

        <div className="h-5 mb-4">
          {status === 'validating' && <p className="text-xs text-mp-muted">Checking...</p>}
          {status === 'invalid' && <p className="text-xs text-mp-danger">{reason}</p>}
          {status === 'taken' && <p className="text-xs text-mp-danger">@{username} is already taken</p>}
          {status === 'available' && <p className="text-xs text-mp-success">@{username} is available</p>}
        </div>

        {username && (
          <p className="text-3xl font-bold text-mp-text text-center mb-5">@{username}</p>
        )}

        <button
          type="button"
          onClick={handleContinue}
          disabled={status !== 'available'}
          className="w-full bg-mp-primary text-white rounded-[8px] py-3 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600 active:bg-blue-700 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
