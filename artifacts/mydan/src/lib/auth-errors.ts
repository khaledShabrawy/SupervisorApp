/** Supabase's older and newer API versions expose credential failures differently. */
export function signInErrorMessage(error: { code?: string; error_code?: string; message?: string }): string {
  const code = error.code ?? error.error_code;
  if (code === 'invalid_credentials' || /invalid (?:login )?credentials/i.test(error.message ?? '')) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }
  return 'تعذر تسجيل الدخول. تحقق من الاتصال وبيانات الحساب.';
}