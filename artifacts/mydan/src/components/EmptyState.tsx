import type { ReactNode } from 'react';
import { EmptyIllustration, type IllustrationType } from './EmptyIllustration';

interface Props {
  icon?: ReactNode;
  illustration?: IllustrationType;
  title: string;
  text?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, illustration, title, text, action }: Props) {
  return (
    <div className="empty">
      {illustration
        ? <EmptyIllustration type={illustration} />
        : icon ? <div className="ring">{icon}</div> : null}
      <div className="title" style={{ color: 'var(--ink)' }}>{title}</div>
      {text && <div className="muted">{text}</div>}
      {action && <button className="btn" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
export default EmptyState;
