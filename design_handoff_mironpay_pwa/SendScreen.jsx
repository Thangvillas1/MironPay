// Send — recipient, token, amount, fee estimate, PIN confirm, then the
// 4-phase on-chain progress (Fund → Withdraw → Send → Deposit) and success.
function SendScreen({ onBack, onNeedPin }) {
  const DS = window.MironPayDesignSystem_577c4b;
  const { Button, Input } = DS;
  const I = window.Icons;

  const [recipient, setRecipient] = React.useState('@bea_k');
  const [amount, setAmount] = React.useState('25.00');
  const [view, setView] = React.useState('form'); // form | progress | done
  const [phase, setPhase] = React.useState(0);

  const phases = ['Fund Agent Wallet', 'Withdraw from Main', 'Send on-chain', 'Deposit to recipient'];

  const runProgress = () => {
    setView('progress'); setPhase(0);
    let p = 0;
    const t = setInterval(() => {
      p += 1; setPhase(p);
      if (p >= phases.length) { clearInterval(t); setTimeout(() => setView('done'), 500); }
    }, 850);
  };

  const submit = () => onNeedPin(runProgress);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--c-page)' }}>
      <Header title="Send USDC" onBack={onBack} I={I} />

      {view === 'form' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Input label="Recipient" prefix="@" value={recipient.replace('@', '')} onChange={(e) => setRecipient('@' + e.target.value)} state="valid" helper="Bea Kim · verified" />

          {/* token + amount */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 7, color: 'var(--c-text)' }}>Amount</div>
            <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span style={{ fontSize: 40, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em' }}>$</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
                  style={{ width: 150, background: 'transparent', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 40, fontWeight: 700, fontFamily: 'var(--font-sans)', letterSpacing: '-0.02em' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#2775ca', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>$</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-muted)' }}>USDC</span>
                <I.chevron size={16} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {['10', '25', '50', '100'].map((q) => (
                <button key={q} onClick={() => setAmount(q + '.00')} style={{ flex: 1, height: 36, borderRadius: 10, border: '1px solid var(--c-border-strong)', background: 'var(--c-input)', color: 'var(--c-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>${q}</button>
              ))}
            </div>
          </div>

          {/* fee */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px', fontSize: 13.5 }}>
            <span style={{ color: 'var(--c-muted)' }}>Network fee (est.)</span>
            <span style={{ color: 'var(--c-text)', fontWeight: 500 }}>~$0.01</span>
          </div>
        </div>
      )}

      {view === 'progress' && (
        <div style={{ flex: 1, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
          <h3 style={{ textAlign: 'center', fontSize: 18, fontWeight: 600, margin: '0 0 8px', color: 'var(--c-text)' }}>Sending {amount} USDC</h3>
          {phases.map((p, i) => {
            const done = i < phase, active = i === phase;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: done || active ? 1 : 0.4 }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', background: done ? 'var(--c-success)' : active ? 'transparent' : 'var(--c-input)', border: active ? '2px solid var(--c-primary)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                  {done ? <I.check size={17} /> : active ? <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--c-primary)', borderTopColor: 'transparent', animation: 'mp-spin 0.7s linear infinite' }} /> : <span style={{ fontSize: 12, color: 'var(--c-muted2)' }}>{i + 1}</span>}
                </span>
                <span style={{ fontSize: 15, fontWeight: done || active ? 600 : 500, color: 'var(--c-text)' }}>{p}</span>
              </div>
            );
          })}
        </div>
      )}

      {view === 'done' && (
        <div style={{ flex: 1, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 6 }}>
          <span style={{ width: 76, height: 76, borderRadius: '50%', background: 'rgba(34,197,94,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-success)', marginBottom: 12 }}><I.check size={40} /></span>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--c-text)' }}>Sent!</h2>
          <p style={{ fontSize: 15, color: 'var(--c-muted)', margin: '4px 0 0' }}>{amount} USDC to {recipient}</p>
          <a href="#" style={{ fontSize: 13, color: 'var(--c-blue-accent)', fontFamily: 'var(--font-mono)', marginTop: 8, textDecoration: 'none' }}>0xab12…ff09 ↗</a>
        </div>
      )}

      {view === 'form' && (
        <div style={{ padding: '12px 18px 22px', borderTop: '1px solid var(--c-border)' }}>
          <Button variant="primary" size="lg" fullWidth onClick={submit} leadingIcon={<I.send size={18} />}>Send {amount} USDC</Button>
        </div>
      )}
      {view === 'done' && (
        <div style={{ padding: '12px 18px 22px' }}>
          <Button variant="secondary" size="lg" fullWidth onClick={onBack}>Done</Button>
        </div>
      )}
    </div>
  );
}

function Header({ title, onBack, I }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--c-border)' }}>
      <button onClick={onBack} style={{ width: 38, height: 38, borderRadius: 12, border: '1px solid var(--c-border)', background: 'var(--c-input)', color: 'var(--c-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><I.arrowLeft size={20} /></button>
      <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: 'var(--c-text)' }}>{title}</h2>
    </div>
  );
}

window.SendScreen = SendScreen;
window.ScreenHeader = Header;
