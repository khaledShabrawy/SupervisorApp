const svgs: Record<string, JSX.Element> = {
  visits: (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="60" cy="90" rx="40" ry="6" fill="currentColor" opacity=".08"/>
      <rect x="30" y="30" width="60" height="52" rx="8" fill="currentColor" opacity=".12"/>
      <rect x="38" y="38" width="44" height="6" rx="3" fill="currentColor" opacity=".3"/>
      <rect x="38" y="50" width="30" height="4" rx="2" fill="currentColor" opacity=".2"/>
      <rect x="38" y="60" width="20" height="4" rx="2" fill="currentColor" opacity=".15"/>
      <circle cx="84" cy="34" r="12" fill="currentColor" opacity=".9"/>
      <path d="M80 34l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  customers: (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="60" cy="90" rx="40" ry="6" fill="currentColor" opacity=".08"/>
      <circle cx="45" cy="42" r="14" fill="currentColor" opacity=".2"/>
      <circle cx="45" cy="38" r="8" fill="currentColor" opacity=".4"/>
      <path d="M25 70c0-11 9-19 20-19s20 8 20 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity=".35"/>
      <circle cx="78" cy="45" r="10" fill="currentColor" opacity=".15"/>
      <circle cx="78" cy="42" r="6" fill="currentColor" opacity=".3"/>
      <path d="M62 70c0-9 7-15 16-15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2" opacity=".25"/>
    </svg>
  ),
  notifications: (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="60" cy="90" rx="40" ry="6" fill="currentColor" opacity=".08"/>
      <path d="M60 22c-13 0-22 9-22 22v14l-6 8h56l-6-8V44c0-13-9-22-22-22z" fill="currentColor" opacity=".2"/>
      <path d="M60 22c-13 0-22 9-22 22v14l-6 8h56l-6-8V44c0-13-9-22-22-22z" stroke="currentColor" strokeWidth="1.5" opacity=".4"/>
      <path d="M54 72c0 3.3 2.7 6 6 6s6-2.7 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".4"/>
      <circle cx="60" cy="22" r="4" fill="currentColor" opacity=".5"/>
      <line x1="34" y1="40" x2="30" y2="36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".2"/>
      <line x1="86" y1="40" x2="90" y2="36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".2"/>
    </svg>
  ),
  orders: (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="60" cy="90" rx="40" ry="6" fill="currentColor" opacity=".08"/>
      <rect x="28" y="28" width="64" height="52" rx="8" fill="currentColor" opacity=".12"/>
      <circle cx="44" cy="44" r="6" fill="currentColor" opacity=".3"/>
      <rect x="55" y="40" width="28" height="4" rx="2" fill="currentColor" opacity=".25"/>
      <rect x="55" y="47" width="18" height="3" rx="1.5" fill="currentColor" opacity=".18"/>
      <circle cx="44" cy="62" r="6" fill="currentColor" opacity=".2"/>
      <rect x="55" y="58" width="28" height="4" rx="2" fill="currentColor" opacity=".2"/>
      <rect x="55" y="65" width="20" height="3" rx="1.5" fill="currentColor" opacity=".13"/>
    </svg>
  ),
  shelf: (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="60" cy="90" rx="40" ry="6" fill="currentColor" opacity=".08"/>
      <rect x="20" y="72" width="80" height="4" rx="2" fill="currentColor" opacity=".3"/>
      <rect x="20" y="48" width="80" height="4" rx="2" fill="currentColor" opacity=".3"/>
      <rect x="20" y="24" width="80" height="4" rx="2" fill="currentColor" opacity=".3"/>
      <rect x="24" y="52" width="12" height="20" rx="2" fill="currentColor" opacity=".25"/>
      <rect x="40" y="56" width="10" height="16" rx="2" fill="currentColor" opacity=".2"/>
      <rect x="54" y="54" width="14" height="18" rx="2" fill="currentColor" opacity=".3"/>
      <rect x="72" y="58" width="10" height="14" rx="2" fill="currentColor" opacity=".18"/>
      <rect x="86" y="52" width="10" height="20" rx="2" fill="currentColor" opacity=".22"/>
    </svg>
  ),
  targets: (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="60" cy="90" rx="40" ry="6" fill="currentColor" opacity=".08"/>
      <circle cx="60" cy="48" r="28" stroke="currentColor" strokeWidth="1.5" opacity=".2"/>
      <circle cx="60" cy="48" r="20" stroke="currentColor" strokeWidth="1.5" opacity=".25"/>
      <circle cx="60" cy="48" r="12" stroke="currentColor" strokeWidth="1.5" opacity=".3"/>
      <circle cx="60" cy="48" r="4" fill="currentColor" opacity=".5"/>
      <line x1="60" y1="20" x2="60" y2="30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".3"/>
      <line x1="60" y1="66" x2="60" y2="76" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".3"/>
      <line x1="32" y1="48" x2="42" y2="48" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".3"/>
      <line x1="78" y1="48" x2="88" y2="48" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".3"/>
    </svg>
  ),
  default: (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="60" cy="90" rx="40" ry="6" fill="currentColor" opacity=".08"/>
      <rect x="30" y="25" width="60" height="55" rx="10" fill="currentColor" opacity=".12"/>
      <rect x="42" y="38" width="36" height="4" rx="2" fill="currentColor" opacity=".3"/>
      <rect x="42" y="48" width="26" height="3" rx="1.5" fill="currentColor" opacity=".2"/>
      <rect x="42" y="56" width="18" height="3" rx="1.5" fill="currentColor" opacity=".15"/>
      <circle cx="60" cy="22" r="10" fill="currentColor" opacity=".2"/>
      <path d="M56 22h4m0 0v4m0-4l3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".5"/>
    </svg>
  ),
};

export type IllustrationType = keyof typeof svgs;

export function EmptyIllustration({ type = 'default' }: { type?: IllustrationType }) {
  return (
    <div className="empty-illu" aria-hidden="true">
      {svgs[type] ?? svgs.default}
    </div>
  );
}
