// PWA chrome illustrations — splash screen + home-screen install mock.
function SplashScreen({ onContinue }) {
  return (
    <div onClick={onContinue} style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      background: 'radial-gradient(120% 90% at 50% 30%, rgba(47,107,255,0.30), transparent 60%), #070b15' }}>
      <img src="assets/logo-mark.svg" width="88" height="88" alt="MironPay" style={{ filter: 'drop-shadow(0 10px 30px rgba(47,107,255,0.6))', marginBottom: 20 }} />
      <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Miron<span style={{ color: '#8487F5' }}>Pay</span></div>
      <div style={{ position: 'absolute', bottom: 36, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Chạm để tiếp tục</div>
    </div>
  );
}

function InstallScreen() {
  const apps = ['Mail', 'Photos', 'Maps', 'Notes', 'Camera', 'Music'];
  return (
    <div style={{ height: '100%', background: 'linear-gradient(180deg,#1c2440,#0a0e1c)', display: 'flex', flexDirection: 'column', padding: '54px 22px 24px', position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, marginBottom: 30 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, background: 'var(--grad-primary, linear-gradient(135deg,#818cf8,#4338ca))', boxShadow: '0 6px 18px rgba(47,107,255,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="assets/logo-mark.svg" width="30" height="30" alt="MironPay" />
          </div>
          <span style={{ fontSize: 10.5, color: '#fff', fontFamily: 'var(--font-sans)' }}>MironPay</span>
        </div>
        {apps.map((a) => (
          <div key={a} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 54, height: 54, borderRadius: 14, background: 'rgba(255,255,255,0.08)' }} />
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-sans)' }}>{a}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', borderRadius: 20, padding: '16px 16px 22px' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.3)', margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--grad-primary, linear-gradient(135deg,#818cf8,#4338ca))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="assets/logo-mark.svg" width="24" height="24" alt="" />
          </div>
          <div>
            <div style={{ color: '#fff', fontSize: 14.5, fontWeight: 600, fontFamily: 'var(--font-sans)' }}>Thêm vào MH chính</div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontFamily: 'var(--font-sans)' }}>MironPay sẽ hiện như 1 app thật</div>
          </div>
        </div>
        <div style={{ height: 46, borderRadius: 12, background: 'var(--grad-primary, linear-gradient(135deg,#818cf8,#4338ca))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14.5, fontWeight: 600, fontFamily: 'var(--font-sans)' }}>Thêm</div>
      </div>
    </div>
  );
}

window.SplashScreen = SplashScreen;
window.InstallScreen = InstallScreen;
