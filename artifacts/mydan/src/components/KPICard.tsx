import { memo, type ReactNode } from 'react';

interface Props { icon: ReactNode; title: string; value?: string | number; loading?: boolean; color?: string; hint?: string }
export const KPICard = memo(function KPICard({ icon, title, value, loading, color, hint }: Props) {
  return <div className="kpi" style={color ? { ['--kc' as string]: color } : undefined} data-testid={`kpi-${title}`}>
    <div className="row muted"><span className="ic">{icon}</span><span>{title}</span></div>
    {loading ? <div className="skel" style={{ height: 30, width: '60%' }} /> : <div className="big">{value}</div>}
    {hint && !loading && <div className="muted" style={{ fontSize: 12 }}>{hint}</div>}
  </div>;
});
export default KPICard;
