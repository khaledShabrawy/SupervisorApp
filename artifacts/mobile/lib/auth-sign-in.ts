import type { createAuthCoordinator } from './auth-coordinator';
import { signInErrorMessage } from './auth-policy.ts';

type Controller = ReturnType<typeof createAuthCoordinator>;
interface CredentialResponse {
  data: { user: { id: string } | null; session: object | null };
  error: { code?: string; message?: string } | null;
}

const CHANGED_SESSION = 'تغيّرت جلسة الدخول. حاول مرة أخرى.';

// Keep domain failures outside the transport catch: fail() advances the version
// itself and must not be mistaken for a concurrent logout.
export async function authenticateSupervisor(
  controller: Controller,
  authenticate: () => Promise<CredentialResponse>,
): Promise<void> {
  void controller.accept(null);
  const ticket = controller.getVersion();
  let response: CredentialResponse;
  try {
    response = await authenticate();
  } catch {
    if (!controller.isActive() || controller.getVersion() !== ticket) throw new Error(CHANGED_SESSION);
    const message = signInErrorMessage({});
    controller.fail({ code: 'session', message });
    throw new Error(message);
  }
  if (!controller.isActive() || controller.getVersion() !== ticket) throw new Error(CHANGED_SESSION);
  if (response.error) {
    const message = signInErrorMessage(response.error);
    controller.fail({ code: 'session', message });
    throw new Error(message);
  }
  if (!response.data.user || !response.data.session) {
    const message = 'تعذر التحقق من جلسة الدخول. حاول مرة أخرى.';
    controller.fail({ code: 'session', message });
    throw new Error(message);
  }
  const pending = controller.accept(response.data.user.id);
  const profileTicket = controller.getVersion();
  await pending;
  if (!controller.isActive() || controller.getVersion() !== profileTicket) throw new Error(CHANGED_SESSION);
  const state = controller.getState();
  if (state.status !== 'authenticated') throw new Error(state.issue?.message ?? CHANGED_SESSION);
}