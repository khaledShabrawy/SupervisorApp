export type ScreenPermission = { screen_key: string; is_enabled: boolean };

/** Screen access requires an explicit grant, including legacy accounts. */
export function isScreenAllowed(rows: ScreenPermission[], key: string): boolean {
  return Array.isArray(rows) && rows.find((r) => r?.screen_key === key)?.is_enabled === true;
}

/** Match the server's field-survey role boundary; a legacy manager alias cannot use it. */
export function isScreenRoleSupported(role: string | null | undefined, key: string): boolean {
  if (!role) return false;
  return (key === 'field_survey'
    ? ['admin', 'super_admin', 'supervisor', 'senior_supervisor', 'branch_manager']
    : ['admin', 'super_admin', 'supervisor', 'senior_supervisor', 'branch_manager', 'manager']).includes(role);
}

/** Office admins bypass grants; branch managers still need an explicit field-survey grant. */
export function canBypassScreenGrant(role: string | null | undefined, key: string): boolean {
  return !!role && (['admin', 'super_admin'].includes(role)
    || (key !== 'field_survey' && ['branch_manager', 'manager'].includes(role)));
}

export function isScreenAvailable(rows: ScreenPermission[] | undefined, role: string | null | undefined,
  key: string, confirmed = true): boolean {
  if (!isScreenRoleSupported(role, key)) return false;
  if (canBypassScreenGrant(role, key)) return true;
  return confirmed && Array.isArray(rows) && isScreenAllowed(rows, key);
}
