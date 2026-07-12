/**
 * Offline queue — persists Supabase insert operations to AsyncStorage
 * and replays them in order when connectivity is restored.
 *
 * Visit records must sync before their children (orders, shelf_audit,
 * competitor_products) because children reference visit_id.
 * A LOCAL_<uuid> prefix marks IDs generated offline.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const QUEUE_KEY = '@mydan/offline_queue';
const ID_MAP_KEY = '@mydan/visit_id_map'; // localId → real Supabase id

export type QueuedTable = 'visits' | 'orders' | 'shelf_audit' | 'competitor_products';

export interface QueueItem {
  localId: string;
  table: QueuedTable;
  payload: Record<string, unknown>;
  /** For child records: the LOCAL_ visitId this record belongs to */
  pendingVisitLocalId?: string;
  status: 'pending' | 'failed';
  createdAt: number;
  retryCount: number;
  errorMsg?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLocalId(): string {
  return (
    'LOCAL_' +
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    })
  );
}

export function isLocalId(id: string): boolean {
  return id.startsWith('LOCAL_');
}

// ─── Queue CRUD ───────────────────────────────────────────────────────────────

export async function getQueue(): Promise<QueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

async function saveQueue(items: QueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function getPendingCount(): Promise<number> {
  const q = await getQueue();
  return q.filter((i) => i.status === 'pending').length;
}

/** Add an operation to the queue and return the local placeholder ID. */
export async function enqueue(
  table: QueuedTable,
  payload: Record<string, unknown>,
  pendingVisitLocalId?: string
): Promise<string> {
  const item: QueueItem = {
    localId: makeLocalId(),
    table,
    payload,
    pendingVisitLocalId,
    status: 'pending',
    createdAt: Date.now(),
    retryCount: 0,
  };
  const q = await getQueue();
  q.push(item);
  await saveQueue(q);
  return item.localId;
}

export async function clearFailedItems(): Promise<void> {
  const q = await getQueue();
  await saveQueue(q.filter((i) => i.status !== 'failed'));
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export async function processQueue(): Promise<{ synced: number; failed: number }> {
  const q = await getQueue();
  const pending = q.filter((i) => i.status === 'pending');
  if (!pending.length) return { synced: 0, failed: 0 };

  // Load (or create) the localId → real Supabase id map
  const mapRaw = await AsyncStorage.getItem(ID_MAP_KEY);
  const idMap: Record<string, string> = mapRaw ? JSON.parse(mapRaw) : {};

  let synced = 0;
  let failed = 0;

  // Visits first so children can resolve their visit_id
  const sorted = [
    ...pending.filter((i) => i.table === 'visits'),
    ...pending.filter((i) => i.table !== 'visits'),
  ];

  for (const item of sorted) {
    try {
      const payload = { ...item.payload };

      // Resolve pending visit_id for child records
      if (item.pendingVisitLocalId) {
        const realId = idMap[item.pendingVisitLocalId];
        if (!realId) {
          // Parent visit hasn't synced yet — leave for next cycle
          continue;
        }
        payload.visit_id = realId;
      }

      const { data, error } = await supabase
        .from(item.table)
        .insert(payload)
        .select('id')
        .single();

      if (error) throw error;

      // Map the local visit ID to its new Supabase ID
      if (item.table === 'visits' && data?.id) {
        idMap[item.localId] = data.id as string;
        await AsyncStorage.setItem(ID_MAP_KEY, JSON.stringify(idMap));
      }

      item.status = 'done' as QueueItem['status'];
      synced++;
    } catch (err) {
      item.retryCount += 1;
      if (item.retryCount >= 3) item.status = 'failed';
      item.errorMsg = err instanceof Error ? err.message : String(err);
      failed++;
    }
  }

  // Persist — drop items marked 'done'
  const updated = q.filter((i) => (i.status as string) !== 'done');
  // Merge status changes back into the queue snapshot
  for (const item of sorted) {
    const match = updated.find((u) => u.localId === item.localId);
    if (match) {
      match.status = item.status;
      match.retryCount = item.retryCount;
      match.errorMsg = item.errorMsg;
    }
  }
  await saveQueue(updated);

  return { synced, failed };
}
