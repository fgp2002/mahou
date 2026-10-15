// Almacén local (IndexedDB) para trabajar sin conexión: cola de cambios pendientes, fotos y datos de consulta.
const DB = "mahou-offline";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const idb = {
  get: <T>(store: string, key: IDBValidKey) => tx<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>),
  put: (store: string, value: unknown, key?: IDBValidKey) => tx(store, "readwrite", (s) => s.put(value, key)),
  add: (store: string, value: unknown) => tx(store, "readwrite", (s) => s.add(value)),
  del: (store: string, key: IDBValidKey) => tx(store, "readwrite", (s) => s.delete(key)),
  all: <T>(store: string) => tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>),
  count: (store: string) => tx<number>(store, "readonly", (s) => s.count()),
  clear: (store: string) => tx(store, "readwrite", (s) => s.clear()),
};

export const kv = {
  get: <T>(key: string) => idb.get<T>("kv", key).catch(() => undefined),
  set: (key: string, value: unknown) => idb.put("kv", value, key).catch(() => undefined),
};

/** Borra todo lo guardado en el dispositivo (al cerrar sesión). */
export async function clearOfflineData() {
  try {
    await Promise.all(["outbox", "blobs", "kv"].map((s) => idb.clear(s)));
  } catch { /* sin IndexedDB */ }
  try {
    if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
  } catch { /* sin caché */ }
}
