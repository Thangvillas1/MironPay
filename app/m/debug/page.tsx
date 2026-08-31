'use client'

import { useEffect, useState } from 'react'

type Row = [string, string]

export default function MDebugPage() {
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    const probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);' +
      'padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)'
    document.body.appendChild(probe)
    const cs = getComputedStyle(probe)

    const nav = navigator as Navigator & { standalone?: boolean }
    const data: Row[] = [
      ['window.innerWidth', String(window.innerWidth)],
      ['window.innerHeight', String(window.innerHeight)],
      ['document.documentElement.clientHeight', String(document.documentElement.clientHeight)],
      ['visualViewport.height', String(window.visualViewport?.height ?? 'n/a')],
      ['visualViewport.offsetTop', String(window.visualViewport?.offsetTop ?? 'n/a')],
      ['devicePixelRatio', String(window.devicePixelRatio)],
      ['env(safe-area-inset-top)', cs.paddingTop],
      ['env(safe-area-inset-bottom)', cs.paddingBottom],
      ['env(safe-area-inset-left)', cs.paddingLeft],
      ['env(safe-area-inset-right)', cs.paddingRight],
      ['matchMedia(display-mode: standalone)', String(window.matchMedia('(display-mode: standalone)').matches)],
      ['navigator.standalone (iOS)', String(nav.standalone)],
      ['userAgent', navigator.userAgent],
    ]
    probe.remove()
    setRows(data)

    const onResize = () => {
      setRows((prev) =>
        prev.map(([k, v]) =>
          k === 'window.innerHeight' ? [k, String(window.innerHeight)] :
          k === 'visualViewport.height' ? [k, String(window.visualViewport?.height ?? 'n/a')] :
          [k, v]
        )
      )
    }
    window.visualViewport?.addEventListener('resize', onResize)
    window.addEventListener('resize', onResize)
    return () => {
      window.visualViewport?.removeEventListener('resize', onResize)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'auto', background: '#fff', color: '#111', fontFamily: 'monospace', fontSize: 13, padding: 16, WebkitTextSizeAdjust: '100%' }}>
      <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>MironPay /m diagnostics</h1>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '6px 8px 6px 0', color: '#666', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{k}</td>
              <td style={{ padding: '6px 0', wordBreak: 'break-all', fontWeight: 600 }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 24, padding: 12, background: '#f5f4f2', borderRadius: 8 }}>
        Cuộn xuống đáy trang này — nếu bạn thấy khoảng trắng thừa bên dưới dòng cuối, chụp màn hình lại phần đó luôn.
      </div>
    </div>
  )
}
