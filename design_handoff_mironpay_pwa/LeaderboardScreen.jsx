// Leaderboard — on-chain agent reputation ranking.
function LeaderboardScreen() {
  const DS = window.MironPayDesignSystem_577c4b;
  const { Avatar, VerifiedBadge, Badge } = DS;

  const rows = [
    { rank: 1, handle: '@dex_wei', score: 980, verified: true, streak: 41 },
    { rank: 2, handle: '@tomr', score: 875, verified: true, streak: 22 },
    { rank: 3, handle: '@bea_k', score: 810, verified: false, streak: 15 },
    { rank: 4, handle: '@miron_alex', score: 420, verified: true, streak: 7, me: true },
    { rank: 5, handle: '@lin_soo', score: 388, verified: false, streak: 4 },
  ];

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--c-page)' }}>
      <div style={{ padding: '20px 18px 90px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)', margin: '0 0 6px' }}>Leaderboard</h1>
        <p style={{ fontSize: 13.5, color: 'var(--c-muted)', margin: '0 0 18px' }}>Xếp hạng Miron Score theo hoạt động on-chain.</p>
        <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', boxShadow: 'inset 0 1px 0 var(--glass-hi)', padding: 6 }}>
          {rows.map((r) => (
            <div key={r.rank} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px', borderBottom: r.rank < rows.length ? '1px solid var(--c-border)' : 'none', background: r.me ? 'var(--c-input)' : 'transparent', borderRadius: r.me ? 10 : 0 }}>
              <span style={{ width: 22, textAlign: 'center', fontSize: 14, fontWeight: 700, color: r.rank <= 3 ? 'var(--c-warning)' : 'var(--c-muted)' }}>{r.rank}</span>
              <Avatar name={r.handle} size={36} verified={r.verified} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 5 }}>{r.handle}{r.me && <Badge tone="info">Bạn</Badge>}</div>
                <div style={{ fontSize: 11.5, color: 'var(--c-muted2)' }}>🔥 {r.streak} ngày liên tiếp</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>{r.score}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
window.LeaderboardScreen = LeaderboardScreen;
