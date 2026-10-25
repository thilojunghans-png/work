// Dünne Promise-Hülle um IndexedDB. Alle Daten bleiben lokal auf dem Gerät.

const DB_NAME = 'the44';
const DB_VERSION = 1;

export const STORES = ['meta', 'photos', 'transactions', 'files', 'blobs', 'payments', 'tasks', 'contacts', 'tenancies', 'loans'];

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const idb = req.result;
        for (const s of STORES) {
          if (!idb.objectStoreNames.contains(s)) idb.createObjectStore(s, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const idb = await open();
  return new Promise((resolve, reject) => {
    const t = idb.transaction(store, mode);
    const req = fn(t.objectStore(store));
    let result;
    if (req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const db = {
  all: (store) => run(store, 'readonly', (s) => s.getAll()),
  keys: (store) => run(store, 'readonly', (s) => s.getAllKeys()),
  get: (store, id) => run(store, 'readonly', (s) => s.get(id)),
  put: (store, obj) => run(store, 'readwrite', (s) => s.put(obj)),
  del: (store, id) => run(store, 'readwrite', (s) => s.delete(id)),
  clear: (store) => run(store, 'readwrite', (s) => s.clear()),
  async getMeta(key, fallback) {
    const r = await db.get('meta', key);
    return r ? r.value : fallback;
  },
  setMeta: (key, value) => db.put('meta', { id: key, value }),
};
