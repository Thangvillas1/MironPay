'use client'

import { useEffect, useState } from 'react'

export function TypewriterText({ text }: { text: string }) {
  const [shown, setShown] = useState('')

  useEffect(() => {
    setShown('')
    if (!text) return
    let i = 0
    const id = setInterval(() => {
      i += 3 // reveal a few chars per tick — brisk, not real typing speed
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(id)
    }, 18)
    return () => clearInterval(id)
  }, [text])

  return <>{shown}</>
}
