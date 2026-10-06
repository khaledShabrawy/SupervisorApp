// Language is chosen once per page load. Switching persists the choice and
// reloads, so module-level labels, Intl formatters and dir all flip together.
export type Lang = 'ar' | 'en';
const KEY = 'mydan-lang';

function stored(): Lang {
  try { return globalThis.localStorage?.getItem(KEY) === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
}
export const LANG: Lang = stored();
export const LOCALE = LANG === 'en' ? 'en-US' : 'ar-EG';
export const DIR = LANG === 'en' ? 'ltr' : 'rtl';

export function applyDocumentLanguage(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = LANG;
  document.documentElement.dir = DIR;
}
export function setLanguage(next: Lang): void {
  if (next === LANG) return;
  try { globalThis.localStorage?.setItem(KEY, next); } catch { /* private mode: stays for this session only */ }
  globalThis.location?.reload();
}
