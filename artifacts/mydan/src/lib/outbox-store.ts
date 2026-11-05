export const ACTION_TYPES = ['create_visit', 'update_visit_status', 'set_visit_outcome', 'save_order', 'attendance_action', 'submit_survey'] as const;
export type OfflineActionType = typeof ACTION_TYPES[number];
export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: Record<string, unknown>;
  companyId: string;
  supervisorId: string;
  userId: string;
  createdAt: string;
}
type EncryptedAction = Omit<OfflineAction, 'payload'> & { scope: [string, string]; ciphertext: ArrayBuffer; iv: Uint8Array<ArrayBuffer> };
const DB_NAME = 'mydan-local-work-v2';

function request<T>(query: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { query.onsuccess = () => resolve(query.result); query.onerror = () => reject(query.error); });
}
function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('تعذر حفظ البيانات المحلية.'));
  });
}
async function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined' || !crypto.subtle) throw new Error('التخزين الآمن غير متاح على هذا الجهاز. اتصل بالإنترنت ولا تغلق الشاشة.');
  const opening = indexedDB.open(DB_NAME, 1);
  opening.onupgradeneeded = () => {
    const actions = opening.result.createObjectStore('actions', { keyPath: 'id' });
    actions.createIndex('scope', ['companyId', 'supervisorId']);
    opening.result.createObjectStore('keys');
  };
  return request(opening);
}
async function encryptionKey(db: IDBDatabase): Promise<CryptoKey> {
  const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const tx = db.transaction('keys', 'readwrite'), done = complete(tx), store = tx.objectStore('keys');
  const existing = await request(store.get('payload-key'));
  if (!existing) store.put(candidate, 'payload-key');
  await done;
  return existing ?? candidate;
}
const additionalData = (action: Omit<OfflineAction, 'payload'>) =>
  new TextEncoder().encode(JSON.stringify([action.id, action.companyId, action.supervisorId, action.userId, action.type, action.createdAt]));

export function validateAction(value: unknown): asserts value is OfflineAction {
  const a = value as Partial<OfflineAction> | null;
  if (!a || ![a.id, a.companyId, a.supervisorId, a.userId].every(v => typeof v === 'string' && v.length > 0)
    || !ACTION_TYPES.includes(a.type as OfflineActionType) || !a.payload || typeof a.payload !== 'object' || Array.isArray(a.payload)
    || typeof a.createdAt !== 'string' || !Number.isFinite(Date.parse(a.createdAt))) {
    throw new Error('عملية محلية غير صالحة؛ احتُفظ بالبيانات للمراجعة.');
  }
}

/** Each action is a separate IDB record: acknowledging a snapshot never erases newer work. */
export async function putAction(action: OfflineAction): Promise<void> {
  validateAction(action);
  const db = await database();
  try {
    const key = await encryptionKey(db), iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(action) }, key,
      new TextEncoder().encode(JSON.stringify(action.payload)));
    const { payload: _payload, ...metadata } = action;
    const tx = db.transaction('actions', 'readwrite'), done = complete(tx);
    // add, never put: an ID cannot silently replace another action's intent.
    tx.objectStore('actions').add({ ...metadata, scope: [action.companyId, action.supervisorId], iv, ciphertext } satisfies EncryptedAction);
    await done;
  } catch (error) {
    throw new Error('تعذر حفظ العملية على الجهاز. لم يُؤكد الحفظ؛ لا تغلق الشاشة وحاول مجدداً.', { cause: error });
  } finally { db.close(); }
}

export async function listActions(companyId: string, supervisorId: string): Promise<OfflineAction[]> {
  if (!companyId || !supervisorId) throw new Error('هوية الحساب مطلوبة لقراءة العمل المحلي.');
  const db = await database();
  try {
    const tx = db.transaction('actions'), done = complete(tx);
    const records = await request<EncryptedAction[]>(tx.objectStore('actions').index('scope').getAll([companyId, supervisorId]));
    await done;
    if (!records.length) return [];
    const key = await encryptionKey(db);
    const actions = await Promise.all(records.map(async record => {
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv, additionalData: additionalData(record) }, key, record.ciphertext);
      const action = { id: record.id, type: record.type, companyId: record.companyId, supervisorId: record.supervisorId,
        userId: record.userId, createdAt: record.createdAt, payload: JSON.parse(new TextDecoder().decode(plaintext)) };
      validateAction(action);
      return action;
    }));
    return actions.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  } finally { db.close(); }
}

export async function acknowledgeAction(id: string, companyId: string, supervisorId: string): Promise<void> {
  const db = await database();
  try {
    const tx = db.transaction('actions', 'readwrite'), done = complete(tx), store = tx.objectStore('actions');
    const record = await request<EncryptedAction | undefined>(store.get(id));
    if (record?.companyId === companyId && record.supervisorId === supervisorId) store.delete(id);
    await done;
  } finally { db.close(); }
}

/** Explicit, owner-filtered legacy conversion. Other accounts and malformed queues are never removed. */
export async function migrateLegacyQueue(companyId: string, supervisorId: string, userId: string, storage: Storage): Promise<number> {
  let migrated = 0;
  for (const key of [`mydan_offline_queue_${companyId}_${supervisorId}`, 'mydan_offline_queue_v1']) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    const items: unknown = JSON.parse(raw);
    if (!Array.isArray(items)) throw new Error('طابور قديم غير صالح؛ احتُفظ به دون تغيير.');
    const retained: unknown[] = [];
    for (const item of items) {
      if (!item || item.companyId !== companyId || item.supervisorId !== supervisorId || (item.userId && item.userId !== userId)) {
        retained.push(item); continue;
      }
      const action = { ...item, userId } as OfflineAction;
      validateAction(action);
      const existing = await listActions(companyId, supervisorId);
      if (!existing.some(a => a.id === action.id)) await putAction(action);
      migrated++;
    }
    // Never overwrite a legacy producer that changed the queue while conversion was running.
    if (storage.getItem(key) !== raw) throw new Error('تغير الطابور القديم أثناء نقله. أعد المحاولة؛ البيانات محفوظة.');
    if (retained.length) storage.setItem(key, JSON.stringify(retained));
    else storage.removeItem(key);
  }
  return migrated;
}
