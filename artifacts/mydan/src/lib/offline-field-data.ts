export interface OfflineCompetitorObservation {
  id: string;
  company_id: string;
  supervisor_id: string;
  visit_id: string | null;
  customer_id: string | null;
  outlet_name: string | null;
  competitor_name: string;
  brand_name: string;
  product_name: string | null;
  pack_size: string | null;
  price: number | null;
  currency_code: string;
  promotion: string | null;
  availability: 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';
  shelf_position: 'eye_level' | 'top' | 'bottom' | 'checkout' | 'end_cap' | 'unknown';
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  observed_at: string;
}

type StoredObservation = OfflineCompetitorObservation & { scope_key: string };
export interface OfflineCache<T> { key: string; data: T; savedAt: number }
const DB_NAME = 'mydan-offline-v1';
const DB_VERSION = 1;
const OBSERVATIONS = 'competitor-observations';
const PLANS = 'plan-cache';
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OBSERVATIONS)) {
        const store = db.createObjectStore(OBSERVATIONS, { keyPath: 'id' });
        store.createIndex('scope_key', 'scope_key', { unique: false });
      }
      if (!db.objectStoreNames.contains(PLANS)) db.createObjectStore(PLANS, { keyPath: 'key' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); dbPromise = null; };
      resolve(request.result);
    };
    request.onerror = () => { dbPromise = null; reject(request.error ?? new Error('Could not open offline storage.')); };
    request.onblocked = () => { dbPromise = null; reject(new Error('Offline storage is blocked by another app tab.')); };
  });
  return dbPromise;
}

function run<T>(storeName: string, mode: IDBTransactionMode,
  action: (store: IDBObjectStore, setResult: (value: T) => void) => void): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result: T;
    action(tx.objectStore(storeName), value => { result = value; });
    tx.oncomplete = () => resolve(result!);
    tx.onerror = () => reject(tx.error ?? new Error('Offline storage transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Offline storage transaction was cancelled.'));
  }));
}

export function saveOfflineObservation(record: OfflineCompetitorObservation): Promise<void> {
  const stored: StoredObservation = { ...record, scope_key: record.company_id + ':' + record.supervisor_id };
  return run<void>(OBSERVATIONS, 'readwrite', store => { store.put(stored); });
}

export function listOfflineObservations(companyId: string, supervisorId: string): Promise<OfflineCompetitorObservation[]> {
  const key = companyId + ':' + supervisorId;
  return run<OfflineCompetitorObservation[]>(OBSERVATIONS, 'readonly', (store, set) => {
    const request = store.index('scope_key').getAll(key);
    request.onsuccess = () => set((request.result as StoredObservation[]).map(({ scope_key: _scope, ...row }) => row));
  });
}

export function removeOfflineObservations(ids: string[]): Promise<void> {
  if (!ids.length) return Promise.resolve();
  return run<void>(OBSERVATIONS, 'readwrite', store => { for (const id of ids) store.delete(id); });
}

export function saveOfflineCache<T>(key: string, data: T): Promise<void> {
  return run<void>(PLANS, 'readwrite', store => { store.put({ key, data, savedAt: Date.now() }); });
}

export function readOfflineCache<T>(key: string): Promise<OfflineCache<T> | null> {
  return run<OfflineCache<T> | null>(PLANS, 'readonly', (store, set) => {
    const request = store.get(key);
    request.onsuccess = () => set((request.result as OfflineCache<T> | undefined) ?? null);
  });
}
