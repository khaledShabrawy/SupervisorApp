import { memo, type ReactNode } from 'react';

interface Props { icon: ReactNode; title: string; value?: string | number; loading?: boolean; color?: string; hint?: string; onClick?: () => void }
export const KPICard = memo(function KPICard({ icon, title, value, loading, color, hint, onClick }: Props) {
  return (
    <div
      className="kpi"
      style={{
        ...(color ? { ['--kc' as string]: color } : {}),
        ...(onClick ? { cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.15s' } : {}),
      }}
      data-testid={`kpi-${title}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      onMouseEnter={onClick ? (e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; } : undefined}
      onMouseLeave={onClick ? (e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; (e.currentTarget as HTMLDivElement).style.transform = ''; } : undefined}
    >
      <div className="row muted" style={{ justifyContent: 'space-between' }}>
        <div className="row muted" style={{ gap: 4 }}><span className="ic">{icon}</span><span>{title}</span></div>
        {onClick && <span style={{ fontSize: 14, color: 'var(--color-primary)', opacity: 0.7 }}>←</span>}
      </div>
      {loading ? <div className="skel" style={{ height: 30, width: '60%' }} /> : <div className="big">{value}</div>}
      {hint && !loading && <div className="muted" style={{ fontSize: 12 }}>{hint}</div>}
    </div>
  );
});
export default KPICard;
