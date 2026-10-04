import type { ReactNode } from 'react';

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: { label: string; onClick: () => void } }) {
  return <div className="empty">
    <div className="ring">{icon}</div>
    <div className="title" style={{ color: 'var(--ink)' }}>{title}</div>
    {text && <div className="muted">{text}</div>}
    {action && <button className="btn" onClick={action.onClick}>{action.label}</button>}
  </div>;
}
export default EmptyState;
