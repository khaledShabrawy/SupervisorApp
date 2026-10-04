import type { Supervisor } from './types';

export type AuthStatus = 'loading' | 'signed_out' | 'authenticated' | 'blocked';
export type AuthIssueCode =
  | 'configuration' | 'session' | 'profile' | 'rls'
  | 'missing_profile' | 'inactive' | 'unknown_role' | 'invalid_profile';

export interface AuthIssue {
  code: AuthIssueCode;
  message: string;
}

export interface AuthState {
  status: AuthStatus;
  supervisor: Supervisor | null;
  issue: AuthIssue | null;
}

export type ProfileResult =
  | { supervisor: Supervisor; issue: null }
  | { supervisor: null; issue: AuthIssue };

export const SUPERVISOR_COLUMNS = 'id,full_name,phone,branch,role,is_active,created_at';

export function profileIssue(error?: { code?: string } | null): AuthIssue {
  return error?.code === '42P17'
    ? { code: 'rls', message: 'تعذر تحميل حساب المشرف بسبب تعارض في سياسات الوصول بقاعدة البيانات. يلزم مراجعتها في Supabase.' }
    : { code: 'profile', message: 'تعذر تحميل حساب المشرف أو التحقق من صلاحياته. تحقق من الاتصال ثم أعد المحاولة.' };
}

export function evaluateSupervisor(data: unknown, userId: string): ProfileResult {
  if (data == null) {
    return { supervisor: null, issue: { code: 'missing_profile', message: 'تم تسجيل الدخول، لكن لا يوجد ملف مشرف مرتبط بالحساب. تواصل مع المدير.' } };
  }
  const row = data as Partial<Supervisor>;
  if (
    typeof data !== 'object' || Array.isArray(data) ||
    row.id !== userId || typeof row.full_name !== 'string' || !row.full_name.trim() ||
    typeof row.created_at !== 'string' ||
    (row.phone != null && typeof row.phone !== 'string') ||
    (row.branch != null && typeof row.branch !== 'string')
  ) {
    return { supervisor: null, issue: { code: 'invalid_profile', message: 'بيانات ملف المشرف غير مكتملة أو غير مرتبطة بالجلسة الحالية. تواصل مع المدير.' } };
  }
  if (row.is_active !== true) {
    return { supervisor: null, issue: { code: 'inactive', message: 'الحساب غير مفعّل. تواصل مع المدير لتفعيل حسابك.' } };
  }
  if (row.role !== 'admin' && row.role !== 'supervisor') {
    return { supervisor: null, issue: { code: 'unknown_role', message: 'تعذر التحقق من دور الحساب. تم منع الوصول لحين مراجعة الصلاحيات.' } };
  }
  return {
    supervisor: { ...row, phone: row.phone ?? null, branch: row.branch ?? null } as Supervisor,
    issue: null,
  };
}

export async function loadSupervisorProfile(
  userId: string,
  query: () => PromiseLike<{ data: unknown; error: { code?: string } | null }>,
): Promise<ProfileResult> {
  try {
    const { data, error } = await query();
    return error ? { supervisor: null, issue: profileIssue(error) } : evaluateSupervisor(data, userId);
  } catch {
    return { supervisor: null, issue: profileIssue() };
  }
}

export function canAccessRoute(
  status: AuthStatus,
  supervisor: Supervisor | null,
  area: 'field' | 'admin',
): boolean {
  if (status !== 'authenticated' || supervisor?.is_active !== true) return false;
  if (supervisor.role !== 'admin' && supervisor.role !== 'supervisor') return false;
  return area !== 'admin' || supervisor.role === 'admin';
}

export function shouldIgnoreAuthEvent(
  event: string,
  signingIn: boolean,
  state: AuthState,
  identity: string | null,
  nextIdentity: string | null,
): boolean {
  if (signingIn && ['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].includes(event)) return true;
  // A failed credential attempt can emit SIGNED_OUT before returning its error.
  // Explicit local logout invalidates the coordinator directly, independently.
  if (signingIn && event === 'SIGNED_OUT' && identity === null) return true;
  return ['TOKEN_REFRESHED', 'SIGNED_IN'].includes(event) &&
    state.status === 'authenticated' && identity === nextIdentity;
}

export function signInErrorMessage(error: { code?: string; message?: string }): string {
  if (
    error.code === 'invalid_credentials' || error.code === 'invalid_grant' ||
    error.message?.includes('Invalid login credentials')
  ) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }
  if (error.code === 'email_not_confirmed') return 'البريد الإلكتروني غير مؤكّد. تواصل مع المدير.';
  if (error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit') {
    return 'محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.';
  }
  return 'تعذر تسجيل الدخول. تحقق من الاتصال وبيانات الحساب ثم حاول مرة أخرى.';
}