import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useSyncExternalStore } from 'react';
import { subscribeConfirm, getConfirmState, resolveConfirm } from '@/lib/confirm';
import { t } from '@/i18n';

export function ConfirmSheet() {
  const { open, message } = useSyncExternalStore(subscribeConfirm, getConfirmState);
  const dialog = useDialogFocus(open, () => resolveConfirm(false));
  if (!open) return null;
  return (
    <div className="sheet-bg" onClick={() => resolveConfirm(false)}>
      <div ref={dialog} tabIndex={-1} className="sheet" role="alertdialog" aria-modal="true" aria-label={t(message)} onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(16px + var(--sab, 0px))' }}>
        <p style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600, lineHeight: 1.5 }}>{t(message)}</p>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn ghost grow" onClick={() => resolveConfirm(false)}>{t('إلغاء')}</button>
          <button className="btn danger grow" onClick={() => resolveConfirm(true)}>{t('تأكيد')}</button>
        </div>
      </div>
    </div>
  );
}
