// Settings — account, security, theme, notifications, sign out.
function SettingsScreen({ theme, onToggleTheme, onNav, onLogout }) {
  const DS = window.MironPayDesignSystem_577c4b;
  const { Avatar, VerifiedBadge } = DS;
  const I = window.Icons;

  const Row = ({ icon: Ic, label, sub, right, danger, onClick }) => (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '13px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--c-border)', cursor: onClick ? 'pointer' : 'default', fontFamily: 'var(--font-sans)', textAlign: 'left' }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--c-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: danger ? 'var(--c-error)' : 'var(--c-text)', flexShrink: 0 }}><Ic size={17} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 500, color: danger ? 'var(--c-error)' : 'var(--c-text)' }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>{sub}</div>}
      </div>
      {right}
    </button>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--c-page)' }}>
      <div style={{ padding: '20px 18px 90px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)', margin: '0 0 18px' }}>Settings</h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px', background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, marginBottom: 18 }}>
          <Avatar name="@miron_alex" size={48} verified />
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 5 }}>@miron_alex <VerifiedBadge size={16} /></div>
            <div style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>Trusted · Miron Score 420</div>
          </div>
        </div>

        <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
          <Row icon={I.settings} label="Đổi mã PIN" sub="Cập nhật PIN xác nhận giao dịch" onClick={() => {}} />
          <Row icon={I.trophy} label="Leaderboard" sub="Xem xếp hạng Miron Score" onClick={() => onNav('leaderboard')} />
          <Row icon={I.bell} label="Thông báo" sub="Đẩy, email" onClick={() => {}} />
          <Row icon={theme === 'dark' ? I.sun : I.moon} label="Giao diện" sub={theme === 'dark' ? 'Dark theme' : 'Light theme'}
            right={<span onClick={(e) => { e.stopPropagation(); onToggleTheme(); }} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-purple-accent)' }}>Đổi</span>} />
        </div>

        <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, overflow: 'hidden' }}>
          <Row icon={I.arrowRight} label="Đăng xuất" danger onClick={onLogout} />
        </div>
      </div>
    </div>
  );
}
window.SettingsScreen = SettingsScreen;
