const DB_NAME = "dewu-product-image-cache";
const DB_VERSION = 1;
const STORE_NAME = "images";
const MAX_ENTRIES = 120;
const MAX_BYTES = 80 * 1024 * 1024;
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;

interface CachedImage {
  key: string;
  blob: Blob;
  size: number;
  storedAt: number;
}

const objectUrls = new Map<string, string>();
const writes = new Map<string, Promise<void>>();

function openCache(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function readEntry(db: IDBDatabase, key: string): Promise<CachedImage | null> {
  return new Promise((resolve) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key);
    request.onsuccess = () =>
      resolve((request.result as CachedImage | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}

function deleteEntry(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve) => {
    const request = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

function writeEntry(db: IDBDatabase, entry: CachedImage): Promise<void> {
  return new Promise((resolve) => {
    const request = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

function listEntries(db: IDBDatabase): Promise<CachedImage[]> {
  return new Promise((resolve) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as CachedImage[]) ?? []);
    request.onerror = () => resolve([]);
  });
}

async function trimCache(db: IDBDatabase): Promise<void> {
  const entries = (await listEntries(db)).sort(
    (left, right) => right.storedAt - left.storedAt,
  );
  let bytes = 0;
  const expiredBefore = Date.now() - MAX_AGE_MS;
  await Promise.all(
    entries.map(async (entry, index) => {
      bytes += entry.size;
      if (
        entry.storedAt < expiredBefore ||
        index >= MAX_ENTRIES ||
        bytes > MAX_BYTES
      ) {
        const objectUrl = objectUrls.get(entry.key);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrls.delete(entry.key);
        await deleteEntry(db, entry.key);
      }
    }),
  );
}

export function productImageCacheKey(value: string): string | null {
  try {
    const pathname = new URL(value, "https://local.invalid").pathname;
    const marker = "/object/sign/attachments/";
    const index = pathname.indexOf(marker);
    if (index < 0) return null;
    const key = decodeURIComponent(pathname.slice(index + marker.length));
    return key || null;
  } catch {
    return null;
  }
}

export async function cachedProductImageUrl(
  storagePath: string,
): Promise<string | null> {
  const existing = objectUrls.get(storagePath);
  if (existing) return existing;
  const db = await openCache();
  if (!db) return null;
  const entry = await readEntry(db, storagePath);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > MAX_AGE_MS) {
    await deleteEntry(db, storagePath);
    return null;
  }
  const url = URL.createObjectURL(entry.blob);
  objectUrls.set(storagePath, url);
  return url;
}

/** Persist only images that the browser has actually displayed. */
export function rememberDisplayedProductImage(url: string): Promise<void> {
  const key = productImageCacheKey(url);
  if (!key || typeof indexedDB === "undefined") return Promise.resolve();
  const running = writes.get(key);
  if (running) return running;

  const task = (async () => {
    const db = await openCache();
    if (!db || (await readEntry(db, key))) return;
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return;
    await writeEntry(db, {
      key,
      blob,
      size: blob.size,
      storedAt: Date.now(),
    });
    await trimCache(db);
  })()
    .catch(() => undefined)
    .finally(() => writes.delete(key));
  writes.set(key, task);
  return task;
}
