import { Globe } from '@/components/Icons';
import { LANG, setLanguage, t } from '@/i18n';

/** Shows the language you can switch TO; switching reloads the app in that language. */
export function LanguageToggle({ className = 'icon-btn', verbose = false }: { className?: string; verbose?: boolean }) {
  const next = LANG === 'ar' ? 'en' : 'ar';
  const label = verbose ? (next === 'en' ? 'English' : 'العربية') : (next === 'en' ? 'EN' : 'ع');
  return <button type="button" className={`${className} lang-toggle`} lang={next}
    aria-label={next === 'en' ? t('تغيير اللغة إلى الإنجليزية') : t('تغيير اللغة إلى العربية')}
    onClick={() => setLanguage(next)} data-testid="button-language">
    {verbose ? <><Globe size={15} /><span>{label}</span></> : label}
  </button>;
}
export default LanguageToggle;
