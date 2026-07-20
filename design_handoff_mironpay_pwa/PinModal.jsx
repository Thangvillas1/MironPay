// Shared PIN sheet — slides up from bottom, numpad + dots, shake on wrong PIN.
function PinModal({ open, title = 'Enter your PIN', onSuccess, onClose, correct = '123456' }) {
  const DS = window.MironPayDesignSystem_577c4b;
  const { PinDots } = DS;
  const I = window.Icons;
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState(false);

  React.useEffect(() => { if (open) { setPin(''); setError(false); } }, [open]);

  const press = (n) => {
    if (pin.length >= 6) return;
    const next = pin + n;
    setPin(next);
    if (next.length === 6) {
      setTimeout(() => {
        if (next === correct) { onSuccess && onSuccess(); }
        else { setError(true); setTimeout(() => { setPin(''); setError(false); }, 650); }
      }, 180);
    }
  };
  const del = () => setPin((p) => p.slice(0, -1));

  if (!open) return null;
  const keys = ['1','2','3','4','5','6','7','8','9','','0','del'];

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', zIndex: 40 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: 'var(--c-panel)', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '22px 22px 30px', borderTop: '1px solid var(--c-border-strong)', animation: 'mp-slideup 0.28s var(--ease-out)' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--c-border-strong)', margin: '0 auto 18px' }} />
        <h3 style={{ textAlign: 'center', fontSize: 17, fontWeight: 600, margin: '0 0 4px', color: 'var(--c-text)' }}>{title}</h3>
        <p style={{ textAlign: 'center', fontSize: 13, color: error ? 'var(--c-error)' : 'var(--c-muted)', margin: '0 0 22px', minHeight: 18 }}>
          {error ? 'Incorrect PIN, try again' : 'Confirm to authorize this transaction'}
        </p>
        <PinDots filled={pin.length} error={error} style={{ marginBottom: 26 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, maxWidth: 280, margin: '0 auto' }}>
          {keys.map((k, i) => k === '' ? <div key={i} /> : (
            <button key={i} onClick={() => k === 'del' ? del() : press(k)}
              style={{ height: 58, borderRadius: 16, border: '1px solid var(--c-border)', background: 'var(--c-input)', color: 'var(--c-text)', fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
              {k === 'del' ? <I.arrowLeft size={22} /> : k}
            </button>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--c-muted2)', marginTop: 18 }}>Demo PIN — 123456</p>
      </div>
    </div>
  );
}
window.PinModal = PinModal;
