// Launchpad — IDO discovery list + simple detail view.
function LaunchpadScreen() {
  const DS = window.MironPayDesignSystem_577c4b;
  const { Badge, Button } = DS;
  const [selected, setSelected] = React.useState(null);

  const idos = [
    { symbol: 'NOVA', name: 'Nova Protocol', status: 'live', raised: 68, target: '$500k', tag: 'DeFi' },
    { symbol: 'ARCX', name: 'ArcExchange', status: 'upcoming', raised: 0, target: '$1.2M', tag: 'Infra' },
    { symbol: 'GRID', name: 'GridNet', status: 'ended', raised: 100, target: '$300k', tag: 'DePIN' },
  ];

  if (selected) {
    const p = selected;
    return (
      <div style={{ height: '100%', overflowY: 'auto', background: 'var(--c-page)' }}>
        <div style={{ padding: '18px' }}>
          <button onClick={() => setSelected(null)} style={{ marginBottom: 16, width: 38, height: 38, borderRadius: 12, border: '1px solid var(--c-border)', background: 'var(--c-input)', color: 'var(--c-text)', cursor: 'pointer' }}>←</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--grad-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>{p.symbol[0]}</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-text)' }}>{p.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)' }}>{p.symbol}</div>
            </div>
          </div>
          <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--c-muted)', marginBottom: 8 }}>
              <span>Đã huy động</span><span>{p.raised}% · mục tiêu {p.target}</span>
            </div>
            <div style={{ height: 8, borderRadius: 9999, background: 'var(--c-input)', overflow: 'hidden' }}>
              <div style={{ width: p.raised + '%', height: '100%', background: 'var(--grad-primary)' }} />
            </div>
          </div>
          <p style={{ fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.6 }}>
            {p.name} là dự án {p.tag} trên ARC network. Đầu tư sớm bằng USDC ngay trong ví MironPay.
          </p>
        </div>
        <div style={{ padding: '12px 18px 22px', borderTop: '1px solid var(--c-border)' }}>
          <Button variant="primary" size="lg" fullWidth disabled={p.status !== 'live'}>
            {p.status === 'live' ? 'Tham gia IDO' : p.status === 'upcoming' ? 'Sắp mở' : 'Đã kết thúc'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--c-page)' }}>
      <div style={{ padding: '20px 18px 90px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)', margin: '0 0 18px' }}>Launchpad</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {idos.map((p) => (
            <button key={p.symbol} onClick={() => setSelected(p)} style={{ textAlign: 'left', border: '1px solid var(--c-border)', background: 'var(--c-panel)', borderRadius: 14, padding: 14, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--grad-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, flexShrink: 0 }}>{p.symbol[0]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>{p.tag} · {p.target}</div>
                </div>
                <Badge tone={p.status === 'live' ? 'success' : p.status === 'upcoming' ? 'info' : 'neutral'}>{p.status === 'live' ? 'Đang mở' : p.status === 'upcoming' ? 'Sắp tới' : 'Kết thúc'}</Badge>
              </div>
              <div style={{ height: 6, borderRadius: 9999, background: 'var(--c-input)', overflow: 'hidden' }}>
                <div style={{ width: p.raised + '%', height: '100%', background: 'var(--grad-primary)' }} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
window.LaunchpadScreen = LaunchpadScreen;
