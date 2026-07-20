// Agent — AI chat. Messages, per-message USDC cost, inline TxResultCard,
// typing indicator, input bar. Demo: typing "send 5 USDC to @bea" triggers a tx.
function AgentScreen({ onBack, onNeedPin }) {
  const DS = window.MironPayDesignSystem_577c4b;
  const { Avatar, Badge } = DS;
  const I = window.Icons;

  const [msgs, setMsgs] = React.useState([
    { role: 'assistant', text: "Hi @miron_alex 👋 I'm your MironPay agent. I can send, swap, or check balances on-chain. Try \"send 5 USDC to @bea\".", cost: '0.002' },
  ]);
  const [draft, setDraft] = React.useState('');
  const [typing, setTyping] = React.useState(false);
  const scroller = React.useRef(null);

  React.useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [msgs, typing]);

  const send = (text) => {
    const t = (text ?? draft).trim();
    if (!t) return;
    setMsgs((m) => [...m, { role: 'user', text: t }]);
    setDraft('');
    setTyping(true);
    const isTx = /send|pay|transfer/i.test(t);
    setTimeout(() => {
      setTyping(false);
      if (isTx) {
        setMsgs((m) => [...m, { role: 'assistant', text: 'Ready to send 5.00 USDC to @bea_k. Confirm with your PIN to execute on-chain.', cost: '0.004' }]);
        onNeedPin(() => {
          setMsgs((m) => [...m, { role: 'assistant', tx: { to: '@bea_k', amt: '5.00 USDC', hash: '0xab12…ff09' }, cost: '0.006' }]);
        });
      } else {
        setMsgs((m) => [...m, { role: 'assistant', text: 'Your Main Wallet holds 2,480.55 USDC and your Agent Wallet has 64.20 USDC available today.', cost: '0.003' }]);
      }
    }, 1300);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--c-page)' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '16px 18px', background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', borderBottom: '1px solid var(--glass-border)' }}>
        <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#5b8cff,#3b30c4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><I.agent size={20} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>Miron Agent</div>
          <div style={{ fontSize: 12, color: 'var(--c-success)', display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-success)' }} /> Online · on-chain ready</div>
        </div>
      </div>

      {/* messages */}
      <div ref={scroller} style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {msgs.map((m, i) => <Message key={i} m={m} I={I} />)}
        {typing && <Typing />}
      </div>

      {/* suggestion chips */}
      <div style={{ display: 'flex', gap: 8, padding: '0 18px 10px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {['Send 5 USDC to @bea', "What's my balance?", 'Swap 20 USDC → ETH'].map((s) => (
          <button key={s} onClick={() => send(s)} style={{ whiteSpace: 'nowrap', padding: '7px 13px', borderRadius: 9999, border: '1px solid var(--c-border-strong)', background: 'var(--c-input)', color: 'var(--c-muted)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>{s}</button>
        ))}
      </div>

      {/* input bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 18px', borderTop: '1px solid var(--c-border)' }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask your agent…" style={{ flex: 1, height: 46, padding: '0 16px', borderRadius: 9999, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', color: 'var(--c-text)', fontSize: 15, fontFamily: 'var(--font-sans)', outline: 'none' }} />
        <button onClick={() => send()} style={{ width: 46, height: 46, borderRadius: '50%', border: 'none', background: 'var(--c-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: 'var(--glow-primary)' }}><I.send size={20} /></button>
      </div>
    </div>
  );
}

function Message({ m, I }) {
  const user = m.role === 'user';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: user ? 'flex-end' : 'flex-start', gap: 4 }}>
      <div style={{ maxWidth: '82%', padding: '11px 14px', borderRadius: 16, borderBottomRightRadius: user ? 4 : 16, borderBottomLeftRadius: user ? 16 : 4,
        background: user ? 'var(--grad-primary)' : 'var(--glass-bg)', backdropFilter: user ? 'none' : 'blur(var(--glass-blur))', WebkitBackdropFilter: user ? 'none' : 'blur(var(--glass-blur))', color: user ? '#fff' : 'var(--c-text)', border: user ? 'none' : '1px solid var(--glass-border)', boxShadow: user ? 'var(--glow-primary)' : 'inset 0 1px 0 var(--glass-hi)', fontSize: 14.5, lineHeight: 1.5 }}>
        {m.tx ? <TxResult tx={m.tx} I={I} /> : m.text}
      </div>
      {!user && m.cost && <span style={{ fontSize: 10.5, color: 'var(--c-muted2)', fontFamily: 'var(--font-mono)' }}>cost {m.cost} USDC</span>}
    </div>
  );
}

function TxResult({ tx, I }) {
  return (
    <div style={{ minWidth: 200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: 'var(--c-success)', fontWeight: 600, fontSize: 14 }}>
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(34,197,94,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.check size={14} /></span>
        Transaction sent
      </div>
      <Row k="Amount" v={tx.amt} /><Row k="To" v={tx.to} /><Row k="Tx hash" v={tx.hash} mono link />
    </div>
  );
}
function Row({ k, v, mono, link }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
      <span style={{ color: 'var(--c-muted)' }}>{k}</span>
      <span style={{ color: link ? 'var(--c-blue-accent)' : 'var(--c-text)', fontFamily: mono ? 'var(--font-mono)' : 'inherit', fontWeight: 500 }}>{v}</span>
    </div>
  );
}
function Typing() {
  return (
    <div style={{ display: 'flex', gap: 5, padding: '12px 16px', background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 16, borderBottomLeftRadius: 4, width: 'fit-content' }}>
      {[0, 1, 2].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--c-muted)', animation: `mp-pulse 1s ${i * 0.16}s infinite` }} />)}
    </div>
  );
}

window.AgentScreen = AgentScreen;
