// Login — centered card, brand mark, single Google CTA. States: idle/loading/error.
function LoginScreen({ onLogin }) {
  const DS = window.MironPayDesignSystem_577c4b;
  const { Button } = DS;
  const I = window.Icons;
  const [phase, setPhase] = React.useState('idle');

  const go = () => {
    setPhase('loading');
    setTimeout(() => onLogin(), 1100);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 28px', textAlign: 'center', background:
      'radial-gradient(120% 80% at 50% -5%, rgba(47,107,255,0.22), transparent 58%), radial-gradient(90% 60% at 50% 105%, rgba(34,198,224,0.10), transparent 60%), var(--c-page)' }}>
      <img src="assets/logo-mark.svg" width="72" height="72" alt="MironPay" style={{ marginBottom: 22, filter: 'drop-shadow(0 8px 24px rgba(47,107,255,0.55))' }} />
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 8px', color: 'var(--c-text)' }}>
        Miron<span style={{ color: 'var(--c-purple-accent)' }}>Pay</span>
      </h1>
      <p style={{ fontSize: 15, color: 'var(--c-muted)', margin: '0 0 36px', lineHeight: 1.5, maxWidth: 260 }}>
        Send stablecoins as easily as a text. Your wallet, your AI agent, on-chain.
      </p>
      <Button variant="secondary" size="lg" fullWidth onClick={go} loading={phase === 'loading'}
        leadingIcon={phase === 'loading' ? null : <I.google />}
        style={{ background: '#fff', color: '#1f2430', borderColor: 'transparent', maxWidth: 320 }}>
        {phase === 'loading' ? 'Redirecting…' : 'Sign in with Google'}
      </Button>
      <p style={{ fontSize: 12, color: 'var(--c-muted2)', marginTop: 22, maxWidth: 260, lineHeight: 1.5 }}>
        By continuing you agree to the Terms & Privacy Policy.
      </p>
    </div>
  );
}
window.LoginScreen = LoginScreen;
