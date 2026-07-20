// Wallet — full detail: 3 wallets (Main/Agent/Status) with per-wallet actions + holdings.
function WalletScreen({ onNav }) {
  const DS = window.MironPayDesignSystem_577c4b;
  const { WalletCard, TokenRow, Button } = DS;
  const I = window.Icons;

  const wallets = [
    { variant: 'blue', label: 'Main Wallet', balance: '2,480.55', address: '0x7a3f…9C2e' },
    { variant: 'purple', label: 'Agent Wallet', balance: '64.20', address: 'Daily limit $500' },
    { variant: 'cyan', label: 'Status', symbol: 'STS', balance: '1,250' },
  ];

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--c-page)' }}>
      <div style={{ padding: '20px 18px 90px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)', margin: '0 0 18px' }}>Wallet</h1>

        {wallets.map((w, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <WalletCard variant={w.variant} label={w.label} symbol={w.symbol} balance={w.balance} address={w.address} style={{ width: '100%' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <Button variant="secondary" size="sm" fullWidth leadingIcon={<I.send size={15} />} onClick={() => onNav('send')}>Send</Button>
              <Button variant="secondary" size="sm" fullWidth leadingIcon={<I.receive size={15} />} onClick={() => onNav('receive')}>Receive</Button>
              <Button variant="secondary" size="sm" fullWidth leadingIcon={<I.swap size={15} />} onClick={() => onNav('swap')}>Swap</Button>
            </div>
          </div>
        ))}

        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text)', margin: '10px 4px 10px' }}>Holdings</h3>
        <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', boxShadow: 'inset 0 1px 0 var(--glass-hi)', padding: 6 }}>
          <TokenRow symbol="USDC" name="USD Coin" balance="2,480.55" fiat="$2,480" change={0.0} />
          <TokenRow symbol="ETH" name="Ethereum" balance="0.84" fiat="$2,910" change={-2.4} />
          <TokenRow symbol="BTC" name="Bitcoin (bridged)" balance="0.012" fiat="$780" change={1.6} />
        </div>
      </div>
    </div>
  );
}
window.WalletScreen = WalletScreen;
