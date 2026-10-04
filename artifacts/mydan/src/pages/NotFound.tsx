import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return <div className="page" style={{ minHeight: '70dvh', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
    <Compass size={64} color="var(--color-primary)" />
    <div className="big">٤٠٤</div>
    <div className="title">هذه الصفحة غير موجودة</div>
    <p className="muted">ربما تغير الرابط أو لم تعد الصفحة متاحة.</p>
    <Link to="/" className="btn" data-testid="link-home">العودة للرئيسية</Link>
  </div>;
}
