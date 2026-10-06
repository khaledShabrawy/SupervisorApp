import ReactDOM from 'react-dom/client';
import { registerPwa } from './lib/pwa';
import { applyDocumentLanguage, DIR, t } from './i18n';
import './index.css';

applyDocumentLanguage();
const root = ReactDOM.createRoot(document.getElementById('root')!);
const hasSupabaseConfig = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

if (!hasSupabaseConfig) {
	root.render(
		<main dir={DIR} style={{ maxWidth: 640, margin: '12vh auto', padding: 24, fontFamily: 'Cairo, sans-serif' }}>
			<section role="alert" style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: 16, padding: 24 }}>
				<h1 style={{ marginTop: 0 }}>{t('إعداد التطبيق مطلوب')}</h1>
				<p>{t('لم تظهر شاشة الدخول لأن إعداد الاتصال بـ Supabase غير موجود محليًا.')}</p>
				<p>{t('أضف')} <strong>VITE_SUPABASE_URL</strong> {t('و')}<strong>VITE_SUPABASE_ANON_KEY</strong> {t('إلى الملف:')}</p>
				<p dir="ltr" style={{ background: '#f1f5f9', padding: 12, borderRadius: 8 }}>artifacts/mydan/.env.local</p>
				<p>{t('استخدم عنوان المشروع والمفتاح العام (anon أو publishable) من إعدادات Supabase. لا تستخدم مفتاح service_role ولا ترسله في المحادثة.')}</p>
				<p>{t('بعد حفظ الملف، أعد تشغيل خادم التطوير ثم حدّث هذه الصفحة.')}</p>
			</section>
		</main>,
	);
} else {
	void import('./App').then(({ default: App }) => root.render(<App />)).catch(() => {
		root.render(<main dir={DIR} role="alert" style={{ padding: 24, fontFamily: 'Cairo, sans-serif' }}>
			{t('تعذر تحميل التطبيق. راجع أخطاء التشغيل في الطرفية ثم أعد تحميل الصفحة.')}
		</main>);
	});
}

registerPwa();
