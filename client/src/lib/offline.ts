// Offline order queue. When the till loses network, checkouts are stored in
// IndexedDB and replayed against POST /api/checkout once the connection returns.
// Keeps a fruit-cafe selling through wifi drops — the #1 reason a POS is unusable.
import { api } from "../api";

const DB_NAME = "cafepos";
const STORE = "order-queue";

export interface QueuedOrder {
  id?: number;
  /** The exact /checkout payload captured at sale time. */
  payload: unknown;
  /** Local reference shown on the provisional receipt until sync assigns a real #. */
  ref: string;
  createdAt: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(payload: unknown): Promise<QueuedOrder> {
  const ref = "OFF-" + Date.now().toString().slice(-6);
  const item: QueuedOrder = { payload, ref, createdAt: new Date().toISOString() };
  const id = await tx<number>("readwrite", (s) => s.add(item));
  item.id = id;
  emitChange();
  return item;
}

export async function getAll(): Promise<QueuedOrder[]> {
  return tx<QueuedOrder[]>("readonly", (s) => s.getAll());
}

async function remove(id: number): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
  emitChange();
}

export async function queueCount(): Promise<number> {
  return tx<number>("readonly", (s) => s.count());
}

let flushing = false;
/** Replay every queued order. Returns how many synced. Safe to call repeatedly. */
export async function flushQueue(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let synced = 0;
  try {
    const items = await getAll();
    for (const item of items) {
      try {
        await api.post("/checkout", item.payload);
        if (item.id != null) await remove(item.id);
        synced++;
      } catch {
        // Leave it queued and stop; retry on the next online event.
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return synced;
}

// ── Tiny change pub/sub so the header badge updates live ─────────────────────
const listeners = new Set<() => void>();
function emitChange() {
  listeners.forEach((l) => l());
}
export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
