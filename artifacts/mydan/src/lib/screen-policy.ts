export const SCREENS = [
  { key: 'new_visit', label: 'زيارة جديدة', path: '/visits/new', byDefault: true },
  { key: 'shelf_audit', label: 'مراجعة الرف AI', path: '/shelf-audit', byDefault: true },
  { key: 'competitor_products', label: 'منتجات المنافسين', path: '/competitors', byDefault: true },
  { key: 'my_reports', label: 'تقاريري والأهداف', path: '/targets', byDefault: true },
  { key: 'notifications', label: 'الإشعارات', path: '/notifications', byDefault: true },
  { key: 'beat_plan', label: 'خطة المسار', path: '/beat-plan', byDefault: true },
  { key: 'field_survey', label: 'مسح ميداني AI', path: '/field-survey', byDefault: false },
] as const;
export type ScreenKey = typeof SCREENS[number]['key'];
export function isScreenAllowed(rows: readonly { screen_key: string; is_enabled: boolean }[] | undefined, key: ScreenKey): boolean {
  return rows?.find(row => row.screen_key === key)?.is_enabled === true;
}
