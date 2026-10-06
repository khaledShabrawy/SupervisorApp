import { useEffect, type ReactNode } from 'react';
import { X } from '@/components/Icons';
import { t } from '@/i18n';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return <div className="sheet-bg" onClick={onClose}>
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
        <button className="icon-btn" aria-label={t('إغلاق')} onClick={onClose}><X /></button>
      </div>
      {children}
    </div>
  </div>;
}
