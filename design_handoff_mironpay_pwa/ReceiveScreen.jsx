// Receive — QR of the wallet address, copyable address, token selector.
// (Real app uses qrcode.react; here the QR is a representative module grid.)
function ReceiveScreen({ onBack }) {
  const DS = window.MironPayDesignSystem_577c4b;
  const { Button, Badge } = DS;
  const I = window.Icons;
  const Header = window.ScreenHeader;
  const [copied, setCopied] = React.useState(false);
  const addr = '0x7a3f9C2e4Bd1aF08b612cc90Ee37';

  const copy = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--c-page)' }}>
      <Header title="Receive USDC" onBack={onBack} I={I} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <Badge tone="info" dot>ARC Network · Circle</Badge>
        <div style={{ background: '#fff', padding: 18, borderRadius: 20, boxShadow: 'var(--shadow-lg)' }}>
          <QrMock seed={addr} />
        </div>
        <p style={{ fontSize: 14, color: 'var(--c-muted)', textAlign: 'center', margin: 0, maxWidth: 260, lineHeight: 1.5 }}>
          Scan to send USDC to <b style={{ color: 'var(--c-text)' }}>@miron_alex</b>
        </p>
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '13px 15px' }}>
          <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addr}</span>
          <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, border: 'none', background: copied ? 'rgba(34,197,94,0.16)' : 'var(--c-input)', color: copied ? 'var(--c-success)' : 'var(--c-purple-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            {copied ? <I.check size={15} /> : <I.copy size={15} />}{copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div style={{ padding: '12px 18px 22px', borderTop: '1px solid var(--c-border)' }}>
        <Button variant="secondary" size="lg" fullWidth onClick={onBack}>Done</Button>
      </div>
    </div>
  );
}

// Deterministic module grid that reads as a QR for mock purposes.
function QrMock({ seed }) {
  const n = 21;
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 131 + seed.charCodeAt(i)) >>> 0;
  const rand = () => { h = (h * 1103515245 + 12345) & 0x7fffffff; return h / 0x7fffffff; };
  const cells = [];
  const finder = (r, c) => (r < 7 && c < 7) || (r < 7 && c > n - 8) || (r > n - 8 && c < 7);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (finder(r, c)) continue;
    if (rand() > 0.52) cells.push(<rect key={r + '-' + c} x={c * 8} y={r * 8} width="8" height="8" fill="#0a0718" />);
  }
  const Finder = ({ x, y }) => (
    <g transform={`translate(${x} ${y})`}>
      <rect width="56" height="56" fill="#0a0718" /><rect x="8" y="8" width="40" height="40" fill="#fff" /><rect x="16" y="16" width="24" height="24" fill="#0a0718" />
    </g>
  );
  return (
    <svg width="168" height="168" viewBox="0 0 168 168" shapeRendering="crispEdges">
      {cells}<Finder x={0} y={0} /><Finder x={112} y={0} /><Finder x={0} y={112} />
    </svg>
  );
}

window.ReceiveScreen = ReceiveScreen;
