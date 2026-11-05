const KEY = 'mydan_device_uuid';
/** Installation identifier, not hardware attestation. Server session registration is still required. */
export function getDeviceId(): string {
  const previous = localStorage.getItem(KEY);
  if (previous) return previous;
  const id = crypto.randomUUID();
  localStorage.setItem(KEY, id);
  return id;
}
