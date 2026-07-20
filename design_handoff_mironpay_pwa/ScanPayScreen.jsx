// Scan & Pay — QR scanner viewfinder for quick payments, with manual fallback.
function ScanPayScreen({ onBack, onNeedPin }) {
  const DS = window.MironPayDesignSystem_577c4b;
  const { Button, Input, Badge } = DS;
  const I = window.Icons;
  const Header = window.ScreenHeader;
  const [mode, setMode] = React.useState('scan'); // scan | manual | confirm | done
  const [handle, setHandle] = React.useState('bea_k');
  const [amount, setAmount] = React.useState('18.50');

  const found = () => setMode('confirm');
  const pay = () => onNeedPin(() => setMode('done'));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--c-page)' }}>
      <Header title="Thanh toán nhanh" onBack={onBack} I={I} />

      {mode === 'scan' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, padding: 24 }}>
          <div onClick={found} style={{ width: 240, height: 240, borderRadius: 24, position: 'relative', cursor: 'pointer',
            background: 'linear-gradient(160deg, rgba(47,107,255,0.16), rgba(9,12,24,0.6))', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
            {[[0,0],[1,0],[0,1]].map(([x,y]) => (
              <div key={x+''+y} style={{ position: 'absolute', width: 34, height: 34, top: y ? 'auto' : 14, bottom: y ? 14 : 'auto', left: x ? 'auto' : 14, right: x ? 14 : 'auto',
                borderTop: y ? 'none' : '3px solid var(--c-blue-accent)', borderBottom: y ? '3px solid var(--c-blue-accent)' : 'none',
                borderLeft: x ? 'none' : '3px solid var(--c-blue-accent)', borderRight: x ? '3px solid var(--c-blue-accent)' : 'none', borderRadius: 6 }} />
            ))}
            <div style={{ position: 'absolute', left: 14, right: 14, top: '50%', height: 2, background: 'var(--c-blue-accent)', boxShadow: '0 0 12px var(--c-blue-accent)', animation: 'mp-pulse 1.6s ease-in-out infinite' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <I.qr size={64} />
            </div>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--c-muted)', textAlign: 'center', margin: 0, maxWidth: 240, lineHeight: 1.5 }}>Hướng camera vào mã QR của người nhận (demo: chạm vào khung để mô phỏng quét được)</p>
          <button onClick={() => setMode('manual')} style={{ background: 'none', border: 'none', color: 'var(--c-purple-accent)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Nhập @handle thủ công</button>
        </div>
      )}

      {mode === 'manual' && (
        <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input label="Người nhận" prefix="@" value={handle} onChange={(e) => setHandle(e.target.value)} />
          <Input label="Số tiền (USDC)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Button variant="primary" size="lg" fullWidth onClick={found}>Tiếp tục</Button>
        </div>
      )}

      {mode === 'confirm' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 22, gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 0' }}>
            <Badge tone="info" dot>Đã nhận diện mã QR</Badge>
            <div style={{ fontSize: 34, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>${amount}</div>
            <div style={{ fontSize: 14, color: 'var(--c-muted)' }}>Trả cho @{handle}</div>
          </div>
          <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, padding: 14, fontSize: 13.5, display: 'flex', justifyContent: 'space-between', color: 'var(--c-muted)' }}>
            <span>Phí mạng (ước tính)</span><span style={{ color: 'var(--c-text)', fontWeight: 500 }}>~$0.01</span>
          </div>
          <div style={{ marginTop: 'auto' }}>
            <Button variant="primary" size="lg" fullWidth onClick={pay} leadingIcon={<I.qr size={17} />}>Xác nhận trả ${amount}</Button>
          </div>
        </div>
      )}

      {mode === 'done' && (
        <div style={{ flex: 1, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 6 }}>
          <span style={{ width: 76, height: 76, borderRadius: '50%', background: 'rgba(34,197,94,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-success)', marginBottom: 12 }}><I.check size={40} /></span>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--c-text)' }}>Đã thanh toán!</h2>
          <p style={{ fontSize: 15, color: 'var(--c-muted)', margin: '4px 0 0' }}>${amount} USDC tới @{handle}</p>
          <div style={{ width: '100%', maxWidth: 260, marginTop: 24 }}>
            <Button variant="secondary" size="lg" fullWidth onClick={onBack}>Xong</Button>
          </div>
        </div>
      )}
    </div>
  );
}
window.ScanPayScreen = ScanPayScreen;
