export interface CompanyBrand {
  id: string;
  name: string;
  primaryColor: string;
  accentColor?: string;
  /** Optional public logo for another buyer; never a secret or signed URL. */
  logoUri?: string;
}

const HEX = /^#[0-9a-f]{6}$/i;
function rgb(color: string): number[] {
  if (!HEX.test(color)) throw new Error('Company colors must use #RRGGBB.');
  return [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
}
function mix(color: string, target: string, amount: number): string {
  const destination = rgb(target);
  return '#' + rgb(color).map((value, index) =>
    Math.round(value + (destination[index] - value) * amount).toString(16).padStart(2, '0'),
  ).join('').toUpperCase();
}
function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
export function contrastRatio(first: string, second: string): number {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function onColor(color: string): string {
  return contrastRatio(color, '#FFFFFF') >= contrastRatio(color, '#000000') ? '#FFFFFF' : '#000000';
}

/** Pure presentation configuration; company branding grants no data access. */
export function createCompanyTheme(brand: CompanyBrand) {
  if (!brand.id.trim() || !brand.name.trim()) throw new Error('Company identity is required.');
  rgb(brand.primaryColor);
  rgb(brand.accentColor ?? brand.primaryColor);
  const palette = (dark: boolean) => {
    const base = brand.primaryColor.toUpperCase();
    const primary = dark ? mix(base, '#FFFFFF', 0.25) : base;
    const accentBase = (brand.accentColor ?? base).toUpperCase();
    const accent = dark ? mix(accentBase, '#FFFFFF', 0.2) : accentBase;
    const background = mix(base, dark ? '#000000' : '#FFFFFF', dark ? 0.86 : 0.97);
    const card = dark ? mix(base, '#000000', 0.67) : '#FFFFFF';
    const foreground = dark ? '#F8F5FC' : mix(base, '#000000', 0.68);
    const secondary = mix(base, dark ? '#000000' : '#FFFFFF', dark ? 0.48 : 0.91);
    const muted = mix(base, dark ? '#000000' : '#FFFFFF', dark ? 0.65 : 0.96);
    const mutedForeground = dark ? mix(base, '#FFFFFF', 0.7) : mix(base, '#000000', 0.2);
    const border = mix(base, dark ? '#000000' : '#FFFFFF', dark ? 0.3 : 0.8);
    const success = dark ? '#4ADE80' : '#15803D';
    const warning = dark ? '#FBBF24' : '#B45309';
    const destructive = dark ? '#FB7185' : '#B91C1C';
    const info = dark ? '#93C5FD' : '#1D4ED8';
    const semanticBackground = (color: string) => mix(color, dark ? card : '#FFFFFF', 0.91);
    return {
      text: foreground, tint: primary, background, foreground, card, cardForeground: foreground,
      primary, primaryForeground: onColor(primary),
      secondary, secondaryForeground: dark ? mix(base, '#FFFFFF', 0.78) : base,
      muted, mutedForeground, accent, accentForeground: onColor(accent),
      destructive, destructiveForeground: onColor(destructive),
      success, successForeground: onColor(success),
      warning, warningForeground: onColor(warning),
      info, infoForeground: onColor(info),
      successBackground: semanticBackground(success), warningBackground: semanticBackground(warning),
      dangerBackground: semanticBackground(destructive), infoBackground: semanticBackground(info),
      customerPrimary: primary, customerSuccess: success, customerDanger: destructive,
      customerBackground: background, border, input: border,
      overlay: 'rgba(0,0,0,0.55)', shadow: '#000000',
    };
  };
  return { light: palette(false), dark: palette(true), radius: 12 };
}

export type CompanyTheme = ReturnType<typeof createCompanyTheme>;