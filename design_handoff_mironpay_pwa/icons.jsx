// MironPay icon set — inline SVG, Lucide-style (1.9px stroke, round caps).
// The real app ships hand-written inline SVGs (no icon library); these match
// that stroke style. Substituted set is documented in the README ICONOGRAPHY section.
const Icon = ({ d, fill, size = 22, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill || 'none'}
    stroke={fill ? 'none' : 'currentColor'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {d}
  </svg>
);

const Icons = {
  wallet:   (p) => <Icon {...p} d={<><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12.5h2.5"/><path d="M3 9h14a1 1 0 011 1"/></>} />,
  agent:    (p) => <Icon {...p} d={<><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M8.5 13v1M15.5 13v1"/><path d="M2 13v2M22 13v2"/></>} />,
  users:    (p) => <Icon {...p} d={<><path d="M16 19v-1a4 4 0 00-8 0v1"/><circle cx="12" cy="9" r="3"/></>} />,
  trophy:   (p) => <Icon {...p} d={<><path d="M7 4h10v4a5 5 0 01-10 0V4z"/><path d="M7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M9 19h6M10 19l.5-3h3l.5 3"/></>} />,
  settings: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1l-.3-2.5H9.4l-.3 2.5a7 7 0 00-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.3 2.5h5.2l.3-2.5a7 7 0 001.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/></>} />,
  send:     (p) => <Icon {...p} d={<path d="M7 17L17 7M17 7H9M17 7v8"/>} />,
  receive:  (p) => <Icon {...p} d={<path d="M17 7L7 17M7 17h8M7 17V9"/>} />,
  swap:     (p) => <Icon {...p} d={<><path d="M7 4v12M7 16l-3-3M7 16l3-3"/><path d="M17 20V8M17 8l-3 3M17 8l3 3"/></>} />,
  plus:     (p) => <Icon {...p} d={<path d="M12 5v14M5 12h14"/>} />,
  copy:     (p) => <Icon {...p} d={<><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h8"/></>} />,
  qr:       (p) => <Icon {...p} d={<><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2M20 14v.01M14 20h6"/></>} />,
  arrowLeft:(p) => <Icon {...p} d={<path d="M15 19l-7-7 7-7"/>} />,
  arrowRight:(p)=> <Icon {...p} d={<path d="M9 5l7 7-7 7"/>} />,
  google:   (p) => <Icon {...p} size={p.size||20} d={<><path d="M21 12.2c0-.6-.1-1.2-.2-1.8H12v3.4h5a4.3 4.3 0 01-1.9 2.8v2.3h3a9 9 0 002.8-6.7z" fill="#4285F4" stroke="none"/><path d="M12 21c2.4 0 4.5-.8 6-2.2l-3-2.3c-.8.6-1.9.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.3A9 9 0 0012 21z" fill="#34A853" stroke="none"/><path d="M7 13.7a5.4 5.4 0 010-3.4V8H4a9 9 0 000 8l3-2.3z" fill="#FBBC05" stroke="none"/><path d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 004 8l3 2.3c.7-2.1 2.7-3.7 5-3.7z" fill="#EA4335" stroke="none"/></>} />,
  bell:     (p) => <Icon {...p} d={<><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></>} />,
  sun:      (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M5 5l1.5 1.5M17.5 17.5L19 19M2 12h2M20 12h2M5 19l1.5-1.5M17.5 6.5L19 5"/></>} />,
  moon:     (p) => <Icon {...p} d={<path d="M21 12.8A8 8 0 1111 3a6 6 0 0010 9z"/>} />,
  check:    (p) => <Icon {...p} d={<path d="M5 12.5l4.5 4.5L19 7.5"/>} />,
  chevron:  (p) => <Icon {...p} d={<path d="M9 6l6 6-6 6"/>} />,
  back:     (p) => <Icon {...p} d={<path d="M12 19l-7-7 7-7M5 12h14"/>} />,
  flame:    (p) => <Icon {...p} d={<path d="M12 3c1 3 4 4 4 8a4 4 0 11-8 0c0-2 1-3 1-3s.5 1.5 1.5 1.5S12 6 12 3z"/>} />,
};

window.Icons = Icons;
