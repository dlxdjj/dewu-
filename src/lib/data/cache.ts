const DB_NAME = "dewu-pms-cache";
const DB_VERSION = 2;
const STORE_NAME = "snapshots";
const MEMORY_TTL_MS = 60_000;
const DISK_TTL_MS = 5 * 60_000;

interface Entry<T> {
  value: T;
  storedAt: number;
}

const memory = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function openCache(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      } else {
        // Version 1 could reuse the first signed-in user's namespace after an
        // account switch. Discard those potentially cross-account snapshots.
        request.transaction?.objectStore(STORE_NAME).clear();
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function diskGet<T>(key: string): Promise<Entry<T> | null> {
  const db = await openCache();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as Entry<T> | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}

async function diskSet<T>(key: string, entry: Entry<T>): Promise<void> {
  const db = await openCache();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(entry, key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

async function fetchFresh<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const request = loader().then((value) => {
    const entry = { value, storedAt: Date.now() };
    memory.set(key, entry);
    void diskSet(key, entry);
    return value;
  }).finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

/** Fast read-through cache. It stores JSON rows only; product photos stay remote. */
export async function cachedRead<T>(
  namespace: string,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const fullKey = `${namespace}:${key}`;
  const inMemory = memory.get(fullKey) as Entry<T> | undefined;
  if (inMemory && Date.now() - inMemory.storedAt < MEMORY_TTL_MS) {
    return inMemory.value;
  }
  const onDisk = inMemory ?? await diskGet<T>(fullKey);
  if (onDisk && Date.now() - onDisk.storedAt < DISK_TTL_MS) {
    memory.set(fullKey, onDisk);
    // Refresh quietly so navigation stays instant while remote edits converge.
    void fetchFresh(fullKey, loader).catch(() => undefined);
    return onDisk.value;
  }
  return fetchFresh(fullKey, loader);
}

export async function invalidateDataCache(namespace: string): Promise<void> {
  for (const key of memory.keys()) {
    if (key.startsWith(`${namespace}:`)) memory.delete(key);
  }
  const db = await openCache();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (String(cursor.key).startsWith(`${namespace}:`)) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("pms:data-mutated"));
  }
}
