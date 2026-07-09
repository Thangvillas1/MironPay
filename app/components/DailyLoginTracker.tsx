'use client'

import { useEffect } from 'react'
import { supabase } from '@/app/lib/supabase'
import { addScore } from '@/app/lib/score'

export default function DailyLoginTracker() {
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const storageKey = 'miron_last_login_score'
    const last = localStorage.getItem(storageKey)

    if (last === today) return

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return
      addScore('daily_login', data.session.access_token)
      localStorage.setItem(storageKey, today)
    })
  }, [])

  return null
}
