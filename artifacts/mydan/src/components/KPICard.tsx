import { memo, type ReactNode } from 'react';
import { LANG } from '@/i18n';

interface Props { icon: ReactNode; title: string; value?: string | number; loading?: boolean; color?: string; hint?: string; onClick?: () => void }
export const KPICard = memo(function KPICard({ icon, title, value, loading, color, hint, onClick }: Props) {
  return (
    <div
      className={onClick ? 'kpi kpi-clickable' : 'kpi'}
      style={{
        ...(color ? { ['--kc' as string]: color } : {}),
        ...(onClick ? { cursor: 'pointer' } : {}),
      }}
      data-testid={`kpi-${title}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      <div className="row muted" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="row muted" style={{ gap: 8, alignItems: 'center' }}>
          <span className="ic kpi-ic">{icon}</span>
          <span className="kpi-title">{title}</span>
        </div>
        {onClick && <span className="kpi-arrow" aria-hidden="true">{LANG === 'ar' ? '←' : '→'}</span>}
      </div>
      {loading ? <div className="skel" style={{ height: 30, width: '60%' }} /> : <div className="big">{value}</div>}
      {hint && !loading && <div className="muted kpi-hint" style={{ fontSize: 12 }}>{hint}</div>}
    </div>
  );
});
export default KPICard;
