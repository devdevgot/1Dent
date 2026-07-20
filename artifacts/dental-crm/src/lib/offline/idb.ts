const DB_NAME = "1dent-offline";
const DB_VERSION = 1;

export const STORE_OUTBOX = "outbox";
export const STORE_PATIENTS = "patients_cache";
export const STORE_TEETH = "teeth_cache";
export const STORE_META = "meta";

type StoreName =
  | typeof STORE_OUTBOX
  | typeof STORE_PATIENTS
  | typeof STORE_TEETH
  | typeof STORE_META;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          const outbox = db.createObjectStore(STORE_OUTBOX, { keyPath: "id" });
          outbox.createIndex("by_status", "status", { unique: false });
          outbox.createIndex("by_clinic", "clinicId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_PATIENTS)) {
          db.createObjectStore(STORE_PATIENTS, { keyPath: "clinicId" });
        }
        if (!db.objectStoreNames.contains(STORE_TEETH)) {
          db.createObjectStore(STORE_TEETH, { keyPath: ["clinicId", "patientId"] });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    });
  }
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB tx aborted"));
  });
}

export async function idbPut<T>(store: StoreName, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await txDone(tx);
}

export async function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(store, "readonly");
  const req = tx.objectStore(store).get(key);
  const result = await new Promise<T | undefined>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB get failed"));
  });
  await txDone(tx);
  return result;
}

export async function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(store, "readonly");
  const req = tx.objectStore(store).getAll();
  const result = await new Promise<T[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB getAll failed"));
  });
  await txDone(tx);
  return result;
}

export async function idbClear(store: StoreName): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).clear();
  await txDone(tx);
}

export async function clearOfflineData(): Promise<void> {
  try {
    await Promise.all([
      idbClear(STORE_OUTBOX),
      idbClear(STORE_PATIENTS),
      idbClear(STORE_TEETH),
      idbClear(STORE_META),
    ]);
  } catch {
    // Private mode / unavailable — ignore
  }
}
