/** Server registration is separate from browser notification permission. */
export type PushScope = { supervisorId: string; companyId: string };

export async function hasRegisteredPush(client: any, registration: ServiceWorkerRegistration | undefined, scope: PushScope): Promise<boolean> {
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  const { data, error } = await client.from('push_subscriptions').select('id')
    .eq('supervisor_id', scope.supervisorId).eq('company_id', scope.companyId)
    .eq('endpoint', subscription.endpoint).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** Reuse existing subscriptions, including when a prior server save failed. */
export async function registerPush(client: any, registration: ServiceWorkerRegistration, scope: PushScope, applicationServerKey: Uint8Array<ArrayBuffer>): Promise<void> {
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Incomplete browser push subscription');
  const { error } = await client.from('push_subscriptions').upsert({
    supervisor_id: scope.supervisorId, company_id: scope.companyId,
    endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
  }, { onConflict: 'supervisor_id,endpoint' });
  if (error) throw error;
}

/** Do not remove the browser subscription when the scoped server deletion fails. */
export async function unregisterPush(client: any, registration: ServiceWorkerRegistration | undefined, scope: PushScope): Promise<void> {
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const { error } = await client.from('push_subscriptions').delete()
    .eq('supervisor_id', scope.supervisorId).eq('company_id', scope.companyId).eq('endpoint', subscription.endpoint);
  if (error) throw error;
  if (!(await subscription.unsubscribe())) throw new Error('Browser push subscription could not be removed');
}
