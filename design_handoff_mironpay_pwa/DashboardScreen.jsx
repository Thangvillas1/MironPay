// Dashboard — the main hub. Header, wallet cards, quick actions, Miron Score,
// recent transactions, token holdings.
function DashboardScreen({ onNav, theme, onToggleTheme, layout = 'cards' }) {
  const DS = window.MironPayDesignSystem_577c4b;
  const { WalletCard, QuickAction, MironScoreCard, TokenRow, Avatar, IconButton } = DS;
  const I = window.Icons;

  const txs = [
    { who: 'Sent to @bea_k', sub: 'Today · 2:14 PM', amt: '-25.00', up: false },
    { who: 'Received from @tomr', sub: 'Today · 9:02 AM', amt: '+120.00', up: true },
    { who: 'Swap USDC → ETH', sub: 'Yesterday', amt: '-50.00', up: false },
  ];

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--c-page)' }}>
      <div style={{ padding: '18px 18px 90px' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ padding: 2, borderRadius: '50%', background: 'var(--grad-primary, linear-gradient(135deg,#818cf8,#4338ca))', display: 'inline-flex' }}>
              <Avatar name="@miron_alex" size={42} verified />
            </span>
            <div>
              <div style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>Welcome back</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text)' }}>@miron_alex</div>
            </div>
          </div>
          <IconButton variant="soft" label="theme" onClick={onToggleTheme}>
            {theme === 'dark' ? <I.sun size={20} /> : <I.moon size={20} />}
          </IconButton>
        </div>

        {/* total balance hero */}
        <div style={{ position: 'relative', padding: '26px 24px 22px', borderRadius: 'var(--radius-xl)', marginBottom: 16, overflow: 'hidden',
          background: 'linear-gradient(150deg, rgba(47,107,255,0.24), rgba(109,108,255,0.06) 55%), var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))',
          border: '1px solid var(--glass-border)', boxShadow: 'var(--glow-blue), var(--shadow-lg), inset 0 1px 0 var(--glass-hi)' }}>
          <div style={{ position: 'absolute', top: -60, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(109,108,255,0.28), transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--c-muted)', letterSpacing: '0.03em' }}>Total balance</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 6 }}>
            <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-0.035em', color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>$3,794<span style={{ fontSize: 24, color: 'var(--c-muted)' }}>.75</span></div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 'var(--radius-full)', background: 'rgba(43,212,164,0.16)', color: 'var(--c-success)', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
              <I.receive size={13} /> +5.2%
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--c-muted2)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>Across 3 wallets · ARC network</div>
        </div>

        {/* quick-pay QR CTA */}
        <button onClick={() => onNav('scanpay')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', marginBottom: 22, borderRadius: 'var(--radius-lg)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
          background: 'var(--grad-primary, linear-gradient(135deg,#818cf8,#4338ca))', color: '#fff', boxShadow: 'var(--glow-primary)' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.qr size={19} /></span>
          <span style={{ flex: 1, textAlign: 'left' }}>
            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>Thanh toán nhanh bằng QR</span>
            <span style={{ display: 'block', fontSize: 12, opacity: 0.85 }}>Quét mã để trả tiền tức thì</span>
          </span>
          <I.arrowRight size={18} />
        </button>

        {/* wallet cards — horizontal scroll (cards layout) or compact rows */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 4px 10px' }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your wallets</h3>
        </div>
        {layout === 'compact' ? (
          <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-lg)', marginBottom: 20, overflow: 'hidden' }}>
            {[{ n: 'Main Wallet', b: '2,480.55', c: '#2f6bff' }, { n: 'Agent Wallet', b: '64.20', c: '#6d6cff' }, { n: 'Status', b: '1,250 STS', c: '#22c6e0' }].map((w, i) => (
              <div key={w.n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderBottom: i < 2 ? '1px solid var(--c-border)' : 'none' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: w.c, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14.5, fontWeight: 500, color: 'var(--c-text)' }}>{w.n}</span>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>{w.b}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', margin: '0 -18px 22px', padding: '0 18px 4px', scrollbarWidth: 'none' }}>
            <WalletCard variant="blue" balance="2,480.55" address="0x7a3f…9C2e" style={{ minWidth: 230 }}>
              <Sparkline color="#5b8cff" />
            </WalletCard>
            <WalletCard variant="purple" label="Agent AI" balance="64.20" style={{ minWidth: 230 }}>
              <LimitBar spent={120} limit={500} />
            </WalletCard>
            <WalletCard variant="cyan" label="Status" symbol="STS" balance="1,250" style={{ minWidth: 200 }} />
          </div>
        )}

        {/* quick actions */}
        {layout === 'compact' ? (
          <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
            {[{ l: 'Send', i: I.send, r: 'send' }, { l: 'Receive', i: I.receive, r: 'receive' }, { l: 'Swap', i: I.swap, r: 'swap' }, { l: 'Top Up', i: I.plus, r: 'topup' }].map((a) => (
              <button key={a.l} onClick={() => onNav(a.r)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 4px', borderRadius: 12, border: '1px solid var(--c-border)', background: 'var(--c-panel)', color: 'var(--c-text)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                <a.i size={18} /><span style={{ fontSize: 11 }}>{a.l}</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 6px', marginBottom: 24 }}>
            <QuickAction icon={<I.send size={22} />} label="Send" onClick={() => onNav('send')} />
            <QuickAction icon={<I.receive size={22} />} label="Receive" accent="var(--c-success)" onClick={() => onNav('receive')} />
            <QuickAction icon={<I.swap size={22} />} label="Swap" accent="var(--c-blue-accent)" onClick={() => onNav('swap')} />
            <QuickAction icon={<I.plus size={22} />} label="Top Up" accent="var(--c-purple-accent)" onClick={() => onNav('topup')} />
          </div>
        )}

        {/* miron score */}
        <div style={{ marginBottom: 24 }}>
          <MironScoreCard score={420} level="Trusted" streak={7} xp={64} xpMax={100} />
        </div>

        {/* recent transactions */}
        <SectionHead title="Recent activity" action="View all" />
        <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', boxShadow: 'inset 0 1px 0 var(--glass-hi)', padding: 6, marginBottom: 22 }}>
          {txs.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderBottom: i < txs.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
              <span style={{ width: 38, height: 38, borderRadius: '50%', background: t.up ? 'rgba(34,197,94,0.14)' : 'var(--c-input)', color: t.up ? 'var(--c-success)' : 'var(--c-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {t.up ? <I.receive size={18} /> : <I.send size={18} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>{t.who}</div>
                <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>{t.sub}</div>
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: t.up ? 'var(--c-success)' : 'var(--c-text)' }}>{t.amt}</div>
            </div>
          ))}
        </div>

        {/* token holdings */}
        <SectionHead title="Holdings" />
        <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', boxShadow: 'inset 0 1px 0 var(--glass-hi)', padding: 6 }}>
          <TokenRow symbol="USDC" name="USD Coin" balance="2,480.55" fiat="$2,480" change={0.0} />
          <TokenRow symbol="ETH" name="Ethereum" balance="0.84" fiat="$2,910" change={-2.4} />
          <TokenRow symbol="BTC" name="Bitcoin (bridged)" balance="0.012" fiat="$780" change={1.6} />
        </div>
      </div>
    </div>
  );
}

function SectionHead({ title, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 4px 10px' }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text)', margin: 0 }}>{title}</h3>
      {action && <button style={{ background: 'none', border: 'none', color: 'var(--c-purple-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>{action}</button>}
    </div>
  );
}

function Sparkline({ color }) {
  return (
    <svg width="100%" height="34" viewBox="0 0 200 34" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs><linearGradient id={'sg' + color} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity="0.35" /><stop offset="1" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <path d="M0 26 L25 22 L50 24 L75 14 L100 18 L125 8 L150 12 L175 5 L200 9" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M0 26 L25 22 L50 24 L75 14 L100 18 L125 8 L150 12 L175 5 L200 9 L200 34 L0 34 Z" fill={'url(#sg' + color + ')'} />
    </svg>
  );
}

function LimitBar({ spent, limit }) {
  const pct = Math.min(100, (spent / limit) * 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--c-muted)', marginBottom: 6 }}>
        <span>Daily spent</span><span>${spent} / ${limit}</span>
      </div>
      <div style={{ height: 7, borderRadius: 9999, background: 'var(--c-input)', overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', borderRadius: 9999, background: 'linear-gradient(90deg,#6d6cff,#2f6bff)' }} />
      </div>
    </div>
  );
}

window.DashboardScreen = DashboardScreen;
