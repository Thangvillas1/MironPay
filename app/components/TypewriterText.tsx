'use client'

import { useEffect, useState, Fragment } from 'react'

const TOKEN_LINE_RE = /^([A-Za-z0-9]+):\s*(.+)$/

// Lightweight markdown-lite for chat replies: **bold** wallet headers get the
// brand purple + bold, "SYMBOL: amount" lines get the symbol in a lighter
// purple weight with the amount left in the default text color — everything
// else renders as plain text with line breaks.
export function formatInlineText(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  return lines.flatMap((line, i) => {
    const boldMatch = line.match(/^\*\*(.+)\*\*$/)
    const tokenMatch = !boldMatch ? line.match(TOKEN_LINE_RE) : null

    let rendered: React.ReactNode
    if (boldMatch) {
      rendered = <strong style={{ color: 'var(--c-indigo-light)', fontWeight: 700 }}>{boldMatch[1]}</strong>
    } else if (tokenMatch) {
      rendered = (
        <>
          <span style={{ color: 'var(--c-indigo-light)', fontWeight: 400 }}>{tokenMatch[1]}</span>
          {`: ${tokenMatch[2]}`}
        </>
      )
    } else {
      rendered = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={j}>{part.slice(2, -2)}</strong>
          : <Fragment key={j}>{part}</Fragment>
      )
    }

    return i < lines.length - 1
      ? [<Fragment key={i}>{rendered}</Fragment>, <br key={`br-${i}`} />]
      : [<Fragment key={i}>{rendered}</Fragment>]
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
