import { LANG, setLanguage, t } from '@/i18n';

/** Shows the language you can switch TO; switching reloads the app in that language. */
export function LanguageToggle({ className = 'icon-btn' }: { className?: string }) {
  const next = LANG === 'ar' ? 'en' : 'ar';
  return <button type="button" className={`${className} lang-toggle`} lang={next}
    aria-label={next === 'en' ? t('تغيير اللغة إلى الإنجليزية') : t('تغيير اللغة إلى العربية')}
    onClick={() => setLanguage(next)} data-testid="button-language">
    {next === 'en' ? 'EN' : 'ع'}
  </button>;
}
export default LanguageToggle;
