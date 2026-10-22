import { supabase } from '@/lib/supabase';

const LOCKOUT_COUNT_KEY = 'mydan_login_fail_count';
const LOCKOUT_UNTIL_KEY = 'mydan_login_lockout_until';
const MAX_FAIL_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 1000;

export const authService = {
  getLockoutStatus(): { failCount: number; lockoutUntil: number; isLocked: boolean; remainingSeconds: number } {
    try {
      const storedCount = localStorage.getItem(LOCKOUT_COUNT_KEY);
      const failCount = storedCount ? parseInt(storedCount, 10) || 0 : 0;
      const storedUntil = localStorage.getItem(LOCKOUT_UNTIL_KEY);
      const lockoutUntil = storedUntil ? parseInt(storedUntil, 10) || 0 : 0;
      const now = Date.now();
      const isLocked = lockoutUntil > now;
      const remainingSeconds = isLocked ? Math.ceil((lockoutUntil - now) / 1000) : 0;

      return { failCount, lockoutUntil, isLocked, remainingSeconds };
    } catch {
      return { failCount: 0, lockoutUntil: 0, isLocked: false, remainingSeconds: 0 };
    }
  },

  recordFailedAttempt(): { isLocked: boolean; remainingSeconds: number } {
    try {
      const { failCount } = this.getLockoutStatus();
      const newCount = failCount + 1;
      localStorage.setItem(LOCKOUT_COUNT_KEY, newCount.toString());

      if (newCount >= MAX_FAIL_ATTEMPTS) {
        const lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
        localStorage.setItem(LOCKOUT_UNTIL_KEY, lockoutUntil.toString());
        return { isLocked: true, remainingSeconds: 60 };
      }
      return { isLocked: false, remainingSeconds: 0 };
    } catch {
      return { isLocked: false, remainingSeconds: 0 };
    }
  },

  resetLockout(): void {
    try {
      localStorage.removeItem(LOCKOUT_COUNT_KEY);
      localStorage.removeItem(LOCKOUT_UNTIL_KEY);
    } catch {
      // ignore
    }
  },

  async updatePassword(password: string) {
    return await supabase.auth.updateUser({ password });
  },
};
