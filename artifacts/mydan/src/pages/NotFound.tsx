import { Link } from 'react-router-dom';
import { Compass } from '@/components/Icons';
import { t } from '@/i18n';

export default function NotFound() {
  return <div className="page" style={{ minHeight: '70dvh', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
    <Compass size={64} color="var(--color-primary)" />
    <div className="big">{t('٤٠٤')}</div>
    <div className="title">{t('هذه الصفحة غير موجودة')}</div>
    <p className="muted">{t('ربما تغير الرابط أو لم تعد الصفحة متاحة.')}</p>
    <Link to="/" className="btn" data-testid="link-home">{t('العودة للرئيسية')}</Link>
  </div>;
}
