/*
 * Stockage local de l'application (IndexedDB, repli localStorage) :
 *  - queue : saisies terrain en attente d'envoi vers farmOS
 *  - ref   : listes de référence (parcelles, cultures, unités) et dernier tableau de bord
 */
let DB = null;
let opening = null;

function open() {
  if (DB || !window.indexedDB) return Promise.resolve(DB);
  if (!opening) {
    opening = new Promise((ok) => {
      const r = indexedDB.open('ndjeke-app', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('queue', { keyPath: 'id' });
        r.result.createObjectStore('ref');
      };
      r.onsuccess = () => { DB = r.result; ok(DB); };
      r.onerror = () => ok(null);
    });
  }
  return opening;
}

async function tx(store, mode, fn) {
  await open();
  if (!DB) {
    const k = 'ndjeke.app.' + store;
    let data = {};
    try { data = JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { data = {}; }
    const res = fn({
      put: (v, key) => { data[key || v.id] = v; },
      delete: (key) => { delete data[key]; },
      get: (key) => data[key],
      all: () => Object.values(data),
    });
    localStorage.setItem(k, JSON.stringify(data));
    return res;
  }
  return new Promise((ok, ko) => {
    const t = DB.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    fn({
      put: (v, key) => { if (key) s.put(v, key); else s.put(v); },
      delete: (key) => { s.delete(key); },
      get: (key) => { const r = s.get(key); r.onsuccess = () => { out = r.result; }; },
      all: () => { const r = s.getAll(); r.onsuccess = () => { out = r.result; }; },
    });
    t.oncomplete = () => ok(out);
    t.onerror = () => ko(t.error);
  });
}

export const queue = {
  all: async () => (await tx('queue', 'readonly', (s) => s.all())) || [],
  put: (v) => tx('queue', 'readwrite', (s) => { s.put(v); }),
  del: (id) => tx('queue', 'readwrite', (s) => { s.delete(id); }),
};

export const ref = {
  get: (k) => tx('ref', 'readonly', (s) => s.get(k)),
  put: (k, v) => tx('ref', 'readwrite', (s) => { s.put(v, k); }),
  del: (k) => tx('ref', 'readwrite', (s) => { s.delete(k); }),
};
