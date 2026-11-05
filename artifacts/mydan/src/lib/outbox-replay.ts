import type { OfflineAction } from './outbox-store.ts';

export async function replayActions(input: {
  actions: OfflineAction[];
  userId: string;
  companyId: string;
  supervisorId: string;
  assertIdentity(): Promise<void>;
  execute(action: OfflineAction): Promise<void>;
  acknowledge(action: OfflineAction): Promise<void>;
}): Promise<{ syncedCount: number; failedCount: number; total: number }> {
  let syncedCount = 0, failedCount = 0;
  for (const action of input.actions) {
    // Identity errors stop the entire drain. They must not become per-item retries under another session.
    await input.assertIdentity();
    if (action.userId !== input.userId || action.companyId !== input.companyId || action.supervisorId !== input.supervisorId) {
      throw new Error('تغيرت هوية الحساب. أوقفت المزامنة مع الاحتفاظ بالعمل المحلي.');
    }
    try {
      await input.execute(action);
      await input.assertIdentity();
      await input.acknowledge(action);
      syncedCount++;
    } catch { failedCount++; }
  }
  return { syncedCount, failedCount, total: input.actions.length };
}
