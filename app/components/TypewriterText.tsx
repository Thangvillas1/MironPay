'use client'

import { useEffect, useState, Fragment } from 'react'

// Lightweight markdown-lite: **bold** and line breaks only — chat replies
// aren't full markdown, just need bold wallet headers and one-token-per-line.
export function formatInlineText(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  return lines.flatMap((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={j}>{part.slice(2, -2)}</strong>
        : <Fragment key={j}>{part}</Fragment>
    )
    return i < lines.length - 1 ? [...parts, <br key={`br-${i}`} />] : parts
  })
}

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

  return <>{formatInlineText(shown)}</>
}
