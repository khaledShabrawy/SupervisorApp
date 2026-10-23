import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Upload, WifiOff } from '@/components/Icons';
import { notify } from '@/lib/toast';
import { t } from '@/i18n';
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
  const [pendingCount, setPendingCount] = useState(() => getPendingCount(companyId, supervisorId));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setPendingCount(getPendingCount(companyId, supervisorId));
    const unsubscribe = subscribeToQueueChanges((cnt) => setPendingCount(cnt), companyId, supervisorId);

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
      setPendingCount(getPendingCount(companyId, supervisorId));
    }
  }, [qc, isUploading, isRefreshing, companyId, supervisorId]);

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderBottom: '1px solid var(--line)',
        padding: '8px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
      data-testid="sync-action-bar"
    >
      {/* Offline Alert Strip */}
      {!isOnline && (
        <div
          style={{
            background: '#FEF3C7',
            color: '#92400E',
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <WifiOff size={14} />
          <span>{t('أنت غير متصل بالإنترنت — تسجل العمليات محلياً وسترفع عند الاتصال')}</span>
        </div>
      )}

      {/* Action Buttons Row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* زر تحديث البيانات */}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing || isUploading}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            padding: '7px 12px',
            borderRadius: 10,
            border: '1.5px solid var(--color-primary)',
            background: '#F0F5FF',
            color: 'var(--color-primary)',
            fontSize: 13,
            fontWeight: 700,
            cursor: isRefreshing ? 'wait' : 'pointer',
            transition: 'all 0.15s ease',
            opacity: isRefreshing ? 0.75 : 1,
            minHeight: 38,
          }}
          title={t('تحديث وتنزيل أحدث خطط الزيارات والبيانات من السيرفر')}
          data-testid="btn-sync-down"
        >
          <RefreshCw
            size={16}
            style={isRefreshing ? { animation: 'spin 0.8s linear infinite' } : undefined}
          />
          <span>{isRefreshing ? t('جاري التحديث...') : t('تحديث البيانات')}</span>
        </button>

        {/* زر رفع البيانات */}
        <button
          type="button"
          onClick={handleUpload}
          disabled={isUploading || isRefreshing}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            padding: '7px 12px',
            borderRadius: 10,
            border: '1.5px solid var(--color-success)',
            background: pendingCount > 0 ? 'var(--color-success)' : '#ECFDF5',
            color: pendingCount > 0 ? '#FFFFFF' : 'var(--color-success)',
            fontSize: 13,
            fontWeight: 700,
            cursor: isUploading ? 'wait' : 'pointer',
            transition: 'all 0.15s ease',
            opacity: isUploading ? 0.75 : 1,
            minHeight: 38,
          }}
          title={t('رفع ومزامنة البيانات والزيارات المسجلة دون اتصال')}
          data-testid="btn-sync-up"
        >
          <Upload
            size={16}
            style={isUploading ? { animation: 'spin 0.8s linear infinite' } : undefined}
          />
          <span>{isUploading ? t('جاري الرفع...') : t('رفع البيانات')}</span>
          {pendingCount > 0 && (
            <span
              style={{
                background: '#EF4444',
                color: '#fff',
                fontSize: 11,
                fontWeight: 800,
                borderRadius: 10,
                padding: '1px 6px',
                minWidth: 18,
                textAlign: 'center',
              }}
            >
              {pendingCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
