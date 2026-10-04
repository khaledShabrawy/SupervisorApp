import type { AppSettings, Supervisor } from '../types/database';

export function isAuthorizedSupervisor(value: unknown, userId: string): value is Supervisor {
  const p = value as Partial<Supervisor> | null;
  return !!p && p.user_id === userId && typeof p.id === 'string' && !!p.id
    && typeof p.company_id === 'string' && !!p.company_id
    && p.is_active === true && ['admin', 'supervisor', 'super_admin'].includes(p.role ?? '');
}
export function canAdmin(profile: Supervisor | null): boolean {
  return !!profile?.is_active && ['admin', 'super_admin'].includes(profile.role);
}
export function validateSettings(value: AppSettings, companyId: string): AppSettings {
  if (value.company_id !== companyId || !value.app_name?.trim()) {
    throw new Error('إعدادات الشركة غير صالحة أو لا تخص حسابك.');
  }
  for (const color of [value.primary_color, value.success_color, value.danger_color, value.background_color]) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('ألوان الشركة يجب أن تكون بصيغة #RRGGBB.');
  }
  if (value.logo_url && !/^https:\/\/[^\s]+$/.test(value.logo_url)) throw new Error('رابط شعار الشركة غير صالح.');
  if (!Number.isFinite(value.geofence_radius_m) || value.geofence_radius_m < 0) {
    throw new Error('نطاق الزيارة في إعدادات الشركة غير صالح.');
  }
  return value;
}
export function readableForeground(hex: string): '#FFFFFF' | '#000000' {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return r * .2126 + g * .7152 + b * .0722 > .179 ? '#000000' : '#FFFFFF';
}
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (v: number) => v * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function requireExactCount(value: number | null): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('تعذر قراءة العدد الدقيق من الخادم. أعد المحاولة.');
  }
  return value;
}