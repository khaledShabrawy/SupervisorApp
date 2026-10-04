import type { AuthIssue, AuthState, ProfileResult } from './auth-policy';

interface AuthCoordinatorOptions {
  loadProfile: (userId: string) => Promise<ProfileResult>;
  onChange: (state: AuthState) => void;
  onIdentityChange: () => void;
}

// Versions prevent an old profile request from authorizing a newer session.
export function createAuthCoordinator(options: AuthCoordinatorOptions) {
  let version = 0;
  let disposed = false;
  let identity: string | null = null;
  let state: AuthState = { status: 'loading', supervisor: null, issue: null };

  const publish = (next: AuthState) => {
    state = next;
    if (!disposed) options.onChange(next);
  };
  const setIdentity = (next: string | null) => {
    if (identity !== next) options.onIdentityChange();
    identity = next;
  };

  return {
    isActive: () => !disposed,
    getVersion: () => version,
    getState: () => state,
    getIdentity: () => identity,
    async accept(userId: string | null) {
      if (disposed) return;
      const request = ++version;
      setIdentity(userId);
      if (!userId) {
        publish({ status: 'signed_out', supervisor: null, issue: null });
        return;
      }
      publish({ status: 'loading', supervisor: null, issue: null });
      // Never await Supabase work from inside its auth-state callback.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (disposed || request !== version) return;
      let result: ProfileResult;
      try {
        result = await options.loadProfile(userId);
      } catch {
        result = {
          supervisor: null,
          issue: { code: 'profile', message: 'تعذر تحميل حساب المشرف. أعد المحاولة.' },
        };
      }
      if (disposed || request !== version || identity !== userId) return;
      publish({
        status: result.supervisor ? 'authenticated' : 'blocked',
        supervisor: result.supervisor,
        issue: result.issue,
      });
    },
    fail(issue: AuthIssue) {
      if (disposed) return;
      ++version;
      setIdentity(null);
      publish({ status: 'blocked', supervisor: null, issue });
    },
    dispose() {
      disposed = true;
      ++version;
    },
  };
}