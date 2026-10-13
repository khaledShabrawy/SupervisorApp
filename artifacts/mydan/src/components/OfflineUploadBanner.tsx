import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, WifiOff } from '@/components/Icons';
import { t } from '@/i18n';

/** Shows an offline warning, then an "Upload" button when the connection is restored. */
export function OfflineUploadBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hadOffline, setHadOffline] = useState(false);
  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => { setIsOnline(false); setHadOffline(true); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const upload = useCallback(async () => {
    setUploading(true);
    await qc.refetchQueries();
    setHadOffline(false);
    setUploading(false);
  }, [qc]);

  if (!isOnline) {
    return (
      <div style={{ background: '#FFFBEB', color: '#92400E', borderBottom: '1px solid #F59E0B', padding: '8px 16px', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
        <WifiOff size={16} />
        <span>{t('أنت غير متصل بالإنترنت')}</span>
      </div>
    );
  }

  if (isOnline && hadOffline) {
    return (
      <div style={{ background: '#ECFDF5', color: '#065F46', borderBottom: '1px solid #6EE7B7', padding: '8px 16px', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
        <span>{t('عاد الاتصال بالإنترنت')}</span>
        <button
          onClick={upload}
          disabled={uploading}
          style={{ background: 'var(--color-success)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', display: 'flex', gap: 6, alignItems: 'center', cursor: uploading ? 'default' : 'pointer', fontSize: 13, opacity: uploading ? 0.7 : 1 }}
        >
          <Upload size={15} />
          {uploading ? t('جاري الرفع...') : t('رفع البيانات')}
        </button>
      </div>
    );
  }

  return null;
}
