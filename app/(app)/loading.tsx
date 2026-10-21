// Instant feedback for tab switches. Without a loading boundary Next has
// nothing to prefetch for these dynamic routes, so a click waited on the full
// server round trip with the old screen frozen in place. This shell is
// prefetched with each link: the sidebar stays put and the content area swaps
// to a skeleton immediately, then the real page streams in.
export default function Loading() {
  const block = (height: number, width: string = '100%') => (
    <div
      style={{
        height,
        width,
        borderRadius: 14,
        background: 'var(--c-panel-2)',
        animation: 'mpSkeletonPulse 1.2s ease-in-out infinite',
      }}
    />
  )

  return (
    <div aria-busy="true" aria-label="Loading" style={{ padding: '24px 16px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{'@keyframes mpSkeletonPulse{0%,100%{opacity:.55}50%{opacity:1}}'}</style>
      {block(28, '40%')}
      {block(150)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
        {block(90)}
        {block(90)}
        {block(90)}
      </div>
      {block(260)}
    </div>
  )
}
