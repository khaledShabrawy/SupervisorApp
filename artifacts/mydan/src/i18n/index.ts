import { LANG } from './lang.ts';
import { EN } from './en.ts';

export { LANG, LOCALE, DIR, setLanguage, applyDocumentLanguage, type Lang } from './lang.ts';

/**
 * Arabic source text is the key; English comes from EN. A missing entry falls
 * back to the Arabic text rather than showing a key. `{name}` placeholders are
 * filled from vars in both languages.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  let out = LANG === 'en' ? EN[text] ?? loose(text) : text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
  return out;
}
// Server errors are often "<message> (<detail>)": translate the message part.
function loose(text: string): string {
  const m = /^([\s\S]*?) \(([\s\S]*)\)$/.exec(text);
  return m && EN[m[1]] ? `${EN[m[1]]} (${m[2]})` : text;
}
