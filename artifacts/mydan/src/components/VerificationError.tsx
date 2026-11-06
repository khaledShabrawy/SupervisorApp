import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/i18n';

export function VerificationError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { signOut } = useAuth();
  return <main className="settings-error" role="alert">
    <h1>{t('تعذر التحقق من الحساب')}</h1>
    <p>{t(message)}</p>
    <button onClick={onRetry}>{t('إعادة المحاولة')}</button>
    <button onClick={() => void signOut().catch(() => undefined)}>{t('تسجيل الخروج')}</button>
  </main>;
}
