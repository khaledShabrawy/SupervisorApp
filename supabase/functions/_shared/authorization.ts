export interface Actor {
  id: string; company_id: string; role: string; is_active: boolean; force_password_change?: boolean;
}
export function canProvision(caller: Actor | null): boolean {
  return !!caller?.is_active && !caller.force_password_change && ['admin','super_admin'].includes(caller.role);
}
export function canManageCredentials(caller: Actor | null, target: Pick<Actor,'id'|'company_id'|'role'>): boolean {
  return canProvision(caller) && caller!.id !== target.id && target.role !== 'super_admin'
    && (caller!.role === 'super_admin' || (target.company_id === caller!.company_id && !['admin','super_admin'].includes(target.role)));
}
export function requestedCompany(caller: Actor, requested: unknown): string | null {
  if (requested === undefined || requested === null || requested === '') return caller.company_id;
  if (typeof requested !== 'string') return null;
  return requested === caller.company_id || caller.role === 'super_admin' ? requested : null;
}
export function permittedPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url=new URL(value);
    return url.protocol==='https:' && !url.username && !url.password && !url.port && (
      url.hostname==='fcm.googleapis.com' || url.hostname==='web.push.apple.com'
      || url.hostname==='updates.push.services.mozilla.com' || url.hostname.endsWith('.notify.windows.com')
    );
  } catch { return false; }
}
