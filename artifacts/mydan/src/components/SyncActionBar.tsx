import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Upload, WifiOff, CheckCheck } from '@/components/Icons';
import { notify } from '@/lib/toast';
import { t } from '@/i18n';
import { num } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import {
  downloadFreshData,
  getPendingCount,
  subscribeToQueueChanges,
  uploadPendingOfflineActions,
} from '@/lib/offline-sync';

export function SyncActionBar() {
  const qc = useQueryClient();
  const { supervisor } = useAuth();
  const companyId = supervisor?.company_id;
  const supervisorId = supervisor?.id;

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = subscribeToQueueChanges((cnt) => setPendingCount(cnt), companyId, supervisorId, () => notify('تعذر قراءة العمل المحلي المحفوظ.', 'error'));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, [companyId, supervisorId]);

  // Handler for Refresh / Sync Down (e.g. newly assigned beat plan or targets)
  const handleRefresh = useCallback(async () => {
    if (isRefreshing || isUploading) return;
    setIsRefreshing(true);
    try {
      await downloadFreshData(qc);
      notify(t('✅ تم تحديث كافة البيانات وخطة الزيارات بنجاح'), 'success');
    } catch (err: any) {
      notify(err?.message || t('تعذر تحديث البيانات. تحقق من الاتصال.'), 'error');
    } finally {
      setIsRefreshing(false);
    }
  }, [qc, isRefreshing, isUploading]);

  // Handler for Upload / Sync Up (flushing offline recorded visits or orders)
  const handleUpload = useCallback(async () => {
    if (isUploading || isRefreshing) return;
    setIsUploading(true);
    try {
      const result = await uploadPendingOfflineActions(companyId, supervisorId);
      if (result.total === 0) {
        await qc.invalidateQueries();
        notify(t('✅ جميع البيانات محدثة ومرفوعة بالفعل.'), 'info');
      } else if (result.syncedCount > 0 && result.failedCount === 0) {
        notify(
          t('✅ تم رفع ومزامنة {n} عملية مسجلة بنجاح!', { n: result.syncedCount }),
          'success'
        );
        await qc.invalidateQueries();
      } else if (result.syncedCount > 0 && result.failedCount > 0) {
        notify(
          t('⚠️ تم رفع {s} عملية بنجاح، وتعذر رفع {f} عملية. حاول مجدداً.', { s: result.syncedCount, f: result.failedCount }),
          'error'
        );
        await qc.invalidateQueries();
      } else {
        notify(t('⚠️ تعذر رفع البيانات. تحقق من الاتصال أو راجع المدير.'), 'error');
      }
    } catch (err: any) {
      notify(err?.message || t('تعذر رفع البيانات المعلقة.'), 'error');
    } finally {
      setIsUploading(false);
      }
  }, [qc, isUploading, isRefreshing, companyId, supervisorId]);

  const uploadRef = useRef(handleUpload);
  uploadRef.current = handleUpload;
  useEffect(() => {
    const resume = () => { void uploadRef.current(); };
    window.addEventListener('online', resume);
    return () => window.removeEventListener('online', resume);
  }, []);

  return <div className={`sync-status-bar ${!isOnline ? 'is-offline' : ''}`} data-testid="sync-action-bar">
    <span className="sync-status-copy" role="status" aria-live="polite">
      {!isOnline ? <WifiOff size={15} /> : <CheckCheck size={15} />}
      {!isOnline ? t('غير متصل · العمل محفوظ على الجهاز') : pendingCount > 0 ?
        t('{n} عملية بانتظار المزامنة', { n: num(pendingCount) }) : t('لا توجد عمليات معلقة')}
    </span>
    <div className="sync-status-actions">
      {pendingCount > 0 && <button type="button" className="sync-upload" onClick={handleUpload}
        disabled={!isOnline || isRefreshing || isUploading} data-testid="btn-sync-up">
        <Upload size={15} className={isUploading ? 'spin' : ''} />
        {isUploading ? t('جاري الرفع...') : t('مزامنة {n}', { n: num(pendingCount) })}
      </button>}
      <button type="button" className="sync-refresh" onClick={handleRefresh}
        disabled={!isOnline || isRefreshing || isUploading} data-testid="btn-sync-down" aria-label={t('تحديث البيانات')} title={t('تحديث البيانات')}>
        <RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />
      </button>
    </div>
  </div>;
}
