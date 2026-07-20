// AppMain — full orchestrator: PWA splash -> login -> onboarding (3 steps) ->
// app shell (bottom tab bar: Dashboard / Wallet / Agent / Launchpad / Settings)
// with Leaderboard + Send/Receive as stacked routes. Shared PIN sheet for tx confirm.
function AppMain({ theme, setTheme, dashboardLayout }) {
  const DS = window.MironPayDesignSystem_577c4b;
  const { NavItem } = DS;

  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const check = () => window.Icons && window.SplashScreen && window.LoginScreen && window.UsernameScreen &&
      window.PinModal && window.SendScreen && window.ReceiveScreen && window.AgentScreen &&
      window.WalletScreen && window.LaunchpadScreen && window.LeaderboardScreen && window.SettingsScreen && window.DashboardScreen && window.ScanPayScreen;
    if (check()) { setReady(true); return; }
    const t = setInterval(() => { if (check()) { setReady(true); clearInterval(t); } }, 60);
    return () => clearInterval(t);
  }, []);

  const I = window.Icons;

  const [stage, setStage] = React.useState('splash'); // splash | login | onb-username | onb-confirm | onb-pin | onb-complete | app
  const [username, setUsername] = React.useState('');
  const [tab, setTab] = React.useState('dashboard'); // dashboard | wallet | agent | launchpad | settings
  const [route, setRoute] = React.useState(null); // send | receive | leaderboard | null
  const [pin, setPin] = React.useState({ open: false, cb: null, title: 'Enter your PIN' });

  React.useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  const needPin = (cb, title) => setPin({ open: true, cb, title: title || 'Enter your PIN' });
  const pinSuccess = () => { const cb = pin.cb; setPin({ open: false, cb: null }); cb && cb(); };

  const goTab = (t) => { setTab(t); setRoute(null); };

  if (!ready) {
    return <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#070b15', color: '#586484', fontSize: 13 }}>Đang tải…</div>;
  }

  let screen;
  if (stage === 'splash') screen = <window.SplashScreen onContinue={() => setStage('login')} />;
  else if (stage === 'login') screen = <window.LoginScreen onLogin={() => setStage('onb-username')} />;
  else if (stage === 'onb-username') screen = <window.UsernameScreen username={username} setUsername={setUsername} onBack={() => setStage('login')} onNext={() => setStage('onb-confirm')} />;
  else if (stage === 'onb-confirm') screen = <window.ConfirmUsernameScreen username={username} onBack={() => setStage('onb-username')} onNext={() => setStage('onb-pin')} />;
  else if (stage === 'onb-pin') screen = <window.SetupPinScreen onBack={() => setStage('onb-confirm')} onNext={() => setStage('onb-complete')} />;
  else if (stage === 'onb-complete') screen = <window.OnboardingCompleteScreen username={username} onFinish={() => { setStage('app'); setTab('dashboard'); }} />;
  else {
    // authenticated app
    if (route === 'send') screen = <window.SendScreen onBack={() => setRoute(null)} onNeedPin={needPin} />;
    else if (route === 'receive') screen = <window.ReceiveScreen onBack={() => setRoute(null)} />;
    else if (route === 'scanpay') screen = <window.ScanPayScreen onBack={() => setRoute(null)} onNeedPin={needPin} />;
    else if (route === 'leaderboard') screen = (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--c-border)' }}>
          <button onClick={() => setRoute(null)} style={{ width: 38, height: 38, borderRadius: 12, border: '1px solid var(--c-border)', background: 'var(--c-input)', color: 'var(--c-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><I.arrowLeft size={20} /></button>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: 'var(--c-text)' }}>Leaderboard</h2>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}><window.LeaderboardScreen /></div>
      </div>
    );
    else if (tab === 'wallet') screen = <window.WalletScreen onNav={(r) => setRoute(r === 'swap' ? null : r)} />;
    else if (tab === 'agent') screen = <window.AgentScreen onNeedPin={needPin} />;
    else if (tab === 'launchpad') screen = <window.LaunchpadScreen />;
    else if (tab === 'settings') screen = <window.SettingsScreen theme={theme} onToggleTheme={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')} onNav={setRoute} onLogout={() => { setStage('login'); setTab('dashboard'); setUsername(''); }} />;
    else screen = <window.DashboardScreen layout={dashboardLayout} onNav={(r) => setRoute(['send', 'receive', 'scanpay'].includes(r) ? r : null)} theme={theme} onToggleTheme={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')} />;
  }

  const showTabs = stage === 'app' && !route;
  const tabs = [
    { id: 'dashboard', label: 'Home', icon: I.wallet },
    { id: 'wallet', label: 'Wallet', icon: I.wallet },
    { id: 'agent', label: 'Agent', icon: I.agent },
    { id: 'launchpad', label: 'Launchpad', icon: I.trophy },
    { id: 'settings', label: 'Settings', icon: I.settings },
  ];

  return (
    <div className="screen">
      {screen}
      {showTabs && (
        <div className="tabbar">
          {tabs.map((t) => {
            const Ic = t.icon;
            return <NavItem key={t.id} orientation="vertical" icon={<Ic size={20} />} label={t.label} active={tab === t.id} onClick={() => goTab(t.id)} />;
          })}
        </div>
      )}
      <window.PinModal open={pin.open} title={pin.title} onSuccess={pinSuccess} onClose={() => setPin({ open: false, cb: null })} />
    </div>
  );
}
window.AppMain = AppMain;
