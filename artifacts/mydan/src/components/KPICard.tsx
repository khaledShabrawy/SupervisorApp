import { memo, type ReactNode } from 'react';

interface Props { icon: ReactNode; title: string; value?: string | number; loading?: boolean; color?: string; hint?: string }
export const KPICard = memo(function KPICard({ icon, title, value, loading, color, hint }: Props) {
  return (
    <div className="kpi" style={color ? { ['--kc' as string]: color } : undefined} data-testid={`kpi-${title}`}>
      <div className="kpi-ic">{icon}</div>
      {loading
        ? <div className="skel" style={{ height: 26, width: '60%', margin: '6px 0 4px' }} />
        : <div className="big">{value ?? '—'}</div>}
      <div className="kpi-lbl">{title}</div>
      {hint && !loading && <div className="kpi-hint">{hint}</div>}
    </div>
  );
});
export default KPICard;
