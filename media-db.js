/* media-db.js: keeps imported photos, videos and files in IndexedDB (localStorage is far too small).
   Board positions live in localStorage; each media item's bytes live here under the item's id. */
'use strict';
const MDB = (() => {
  let dbp = null;
  const urls = new Map(); // id -> object URL (cached so we don't create one per render)
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('gpb-media', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('media');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function run(mode, fn) {
    return open().then(db => new Promise((res, rej) => {
      const tx = db.transaction('media', mode), req = fn(tx.objectStore('media'));
      tx.oncomplete = () => res(req ? req.result : undefined);
      tx.onerror = tx.onabort = () => rej(tx.error || new Error('IndexedDB error'));
    }));
  }
  const get = id => run('readonly', s => s.get(id));
  const put = (id, blob) => run('readwrite', s => s.put(blob, id)).then(() => { forget(id); });
  const del = id => run('readwrite', s => s.delete(id)).then(() => { forget(id); });
  const keys = () => run('readonly', s => s.getAllKeys());
  function forget(id) { const u = urls.get(id); if (u) { URL.revokeObjectURL(u); urls.delete(id); } }
  async function url(id) {
    if (urls.has(id)) return urls.get(id);
    try {
      const b = await get(id); if (!b) return null;
      const u = URL.createObjectURL(b); urls.set(id, u); return u;
    } catch (e) { return null; }
  }
  // Remove blobs no longer used by the board (runs once, shortly after start).
  async function cleanup(liveIds) {
    try { const live = new Set(liveIds); for (const k of await keys()) if (!live.has(k)) await del(k); } catch (e) {}
  }
  // Ask the browser not to evict our storage when the phone is low on space.
  function keep() { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {} }
  return { get, put, del, keys, url, forget, cleanup, keep };
})();
