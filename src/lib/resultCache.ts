/**
 * Small persistent cache for expensive computed results (IndexedDB, memory fallback). Callers key
 * entries by everything the result depends on, so a stale entry is simply never asked for again;
 * only the latest few entries per namespace are kept.
 */
const DB = "feedviewer-cache";
const STORE = "results";
const memory = new Map<string, unknown>();

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function readCached<T>(namespace: string, key: string): Promise<{ value: T; savedAt: number } | null> {
  const id = `${namespace}:${key}`;
  if (memory.has(id)) return memory.get(id) as { value: T; savedAt: number };
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
      req.onsuccess = () => {
        const v = req.result as { value: T; savedAt: number } | undefined;
        if (v) memory.set(id, v);
        resolve(v ?? null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeCached<T>(namespace: string, key: string, value: T): Promise<void> {
  const id = `${namespace}:${key}`;
  const entry = { value, savedAt: Date.now() };
  // Keep only the newest entry per namespace in memory.
  for (const k of memory.keys()) if (k.startsWith(`${namespace}:`)) memory.delete(k);
  memory.set(id, entry);
  const db = await open();
  if (!db) return;
  try {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      for (const k of keys.result) if (String(k).startsWith(`${namespace}:`) && k !== id) store.delete(k);
      store.put(entry, id);
    };
  } catch {
    /* storage full or blocked: the in-memory copy still serves this session */
  }
}
