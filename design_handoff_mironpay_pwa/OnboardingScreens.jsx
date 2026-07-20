// Onboarding — username -> confirm username -> 6-digit PIN setup -> complete.
// Shared centered-card shell (AuthShell-style per brief).

function AuthShell({ eyebrow, title, sub, children }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 26px',
      background: 'radial-gradient(120% 80% at 50% -5%, rgba(47,107,255,0.16), transparent 58%), var(--c-page)' }}>
      {eyebrow && <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-purple-accent)', marginBottom: 10, textAlign: 'center' }}>{eyebrow}</div>}
      <h1 style={{ fontSize: 23, fontWeight: 700, color: 'var(--c-text)', margin: '0 0 8px', textAlign: 'center', letterSpacing: '-0.01em' }}>{title}</h1>
      {sub && <p style={{ fontSize: 14, color: 'var(--c-muted)', margin: '0 0 28px', textAlign: 'center', lineHeight: 1.5 }}>{sub}</p>}
      {children}
    </div>
  );
}

function UsernameScreen({ onNext, onBack, username, setUsername }) {
  const DS = window.MironPayDesignSystem_577c4b;
  const { Button, Input } = DS;
  const I = window.Icons;
  const valid = username.length >= 3;
  return (
    <AuthShell eyebrow="Bước 1/3" title="Chọn @handle của bạn" sub="Đây là tên người khác dùng để gửi USDC cho bạn.">
      <button onClick={onBack} style={{ position: 'absolute', top: 18, left: 18, width: 38, height: 38, borderRadius: 12, border: '1px solid var(--c-border)', background: 'var(--c-input)', color: 'var(--c-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><I.arrowLeft size={18} /></button>
      <Input label="Username" prefix="@" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())}
        state={username.length === 0 ? 'default' : valid ? 'valid' : 'error'} helper={username.length === 0 ? 'Chữ thường, số, gạch dưới' : valid ? 'Có sẵn' : 'Tối thiểu 3 ký tự'} />
      <div style={{ marginTop: 22 }}>
        <Button variant="primary" size="lg" fullWidth disabled={!valid} onClick={onNext}>Tiếp tục</Button>
      </div>
    </AuthShell>
  );
}

function ConfirmUsernameScreen({ username, onNext, onBack }) {
  const DS = window.MironPayDesignSystem_577c4b;
  const { Button, Avatar, VerifiedBadge } = DS;
  const I = window.Icons;
  return (
    <AuthShell eyebrow="Bước 2/3" title="Xác nhận handle" sub="Không thể đổi @handle sau bước này.">
      <button onClick={onBack} style={{ position: 'absolute', top: 18, left: 18, width: 38, height: 38, borderRadius: 12, border: '1px solid var(--c-border)', background: 'var(--c-input)', color: 'var(--c-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><I.arrowLeft size={18} /></button>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '10px 0 30px' }}>
        <Avatar name={'@' + username} size={64} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 19, fontWeight: 700, color: 'var(--c-text)' }}>
          @{username || 'username'}<VerifiedBadge size={18} />
        </div>
      </div>
      <Button variant="primary" size="lg" fullWidth onClick={onNext}>Xác nhận &amp; tiếp tục</Button>
    </AuthShell>
  );
}

function SetupPinScreen({ onNext, onBack }) {
  const DS = window.MironPayDesignSystem_577c4b;
  const { PinDots } = DS;
  const I = window.Icons;
  const [stage, setStage] = React.useState('enter'); // enter | confirm
  const [first, setFirst] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState(false);

  const press = (n) => {
    if (pin.length >= 6) return;
    const next = pin + n;
    setPin(next);
    if (next.length === 6) {
      setTimeout(() => {
        if (stage === 'enter') { setFirst(next); setPin(''); setStage('confirm'); }
        else if (next === first) { onNext(); }
        else { setError(true); setTimeout(() => { setPin(''); setError(false); setStage('enter'); setFirst(''); }, 700); }
      }, 150);
    }
  };
  const del = () => setPin((p) => p.slice(0, -1));
  const keys = ['1','2','3','4','5','6','7','8','9','','0','del'];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 26px', position: 'relative',
      background: 'radial-gradient(120% 80% at 50% -5%, rgba(47,107,255,0.16), transparent 58%), var(--c-page)' }}>
      <button onClick={onBack} style={{ position: 'absolute', top: 18, left: 18, width: 38, height: 38, borderRadius: 12, border: '1px solid var(--c-border)', background: 'var(--c-input)', color: 'var(--c-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><I.arrowLeft size={18} /></button>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-purple-accent)', marginBottom: 10, textAlign: 'center' }}>Bước 3/3</div>
      <h1 style={{ fontSize: 23, fontWeight: 700, color: 'var(--c-text)', margin: '0 0 8px', textAlign: 'center' }}>{stage === 'enter' ? 'Tạo mã PIN' : 'Nhập lại để xác nhận'}</h1>
      <p style={{ fontSize: 14, color: error ? 'var(--c-error)' : 'var(--c-muted)', margin: '0 0 24px', textAlign: 'center', lineHeight: 1.5 }}>
        {error ? 'PIN không khớp, thử lại' : 'Dùng để xác nhận mọi giao dịch — ví sẽ được tạo sau bước này.'}
      </p>
      <PinDots filled={pin.length} error={error} style={{ marginBottom: 26, alignSelf: 'center' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, maxWidth: 280, margin: '0 auto' }}>
        {keys.map((k, i) => k === '' ? <div key={i} /> : (
          <button key={i} onClick={() => k === 'del' ? del() : press(k)}
            style={{ height: 58, borderRadius: 16, border: '1px solid var(--c-border)', background: 'var(--c-input)', color: 'var(--c-text)', fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {k === 'del' ? <I.arrowLeft size={22} /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}

function OnboardingCompleteScreen({ username, onFinish }) {
  const DS = window.MironPayDesignSystem_577c4b;
  const { Button, Avatar } = DS;
  const I = window.Icons;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 30px', textAlign: 'center',
      background: 'radial-gradient(120% 80% at 50% -5%, rgba(43,212,164,0.16), transparent 58%), var(--c-page)' }}>
      <span style={{ width: 76, height: 76, borderRadius: '50%', background: 'rgba(43,212,164,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-success)', marginBottom: 18 }}><I.check size={38} /></span>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--c-text)', margin: '0 0 8px' }}>Ví của bạn đã sẵn sàng</h1>
      <p style={{ fontSize: 14.5, color: 'var(--c-muted)', margin: '0 0 26px', lineHeight: 1.5, maxWidth: 260 }}>
        Chào mừng, @{username || 'username'}. Main Wallet &amp; Agent Wallet đã được tạo trên ARC network.
      </p>
      <div style={{ width: '100%', maxWidth: 280 }}>
        <Button variant="primary" size="lg" fullWidth onClick={onFinish}>Vào MironPay</Button>
      </div>
    </div>
  );
}

window.AuthShell = AuthShell;
window.UsernameScreen = UsernameScreen;
window.ConfirmUsernameScreen = ConfirmUsernameScreen;
window.SetupPinScreen = SetupPinScreen;
window.OnboardingCompleteScreen = OnboardingCompleteScreen;
