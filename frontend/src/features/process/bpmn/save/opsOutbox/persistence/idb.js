// idb.js — тонкий helper над сырым IndexedDB для персистентного outbox
// (contour feature/async-save-pipeline-step2, UI.md §1, PLAN §4).
//
// Стиль — существующие raw-IDB потребители (bpmnSnapshots.js / bpmnPacks.js):
// никаких idb/Dexie, только стандартный API. БД `pm-save-outbox`:
//   v1: store `operations` (keyPath opId; indexes bySession, bySessionTs),
//       store `syncState` (keyPath sessionId);
//   v2: store `proposed` (keyPath proposedId; index bySession) — проигравшие
//       LWW-ops для панели «предложенные изменения».
// IDB unavailable/denied → openOutboxDb resolves null → потребители работают
// как noop-fallback (outbox как в step1, без durable-гарантии).

export const OUTBOX_DB_NAME = "pm-save-outbox";
export const OUTBOX_DB_VERSION = 2;

function defaultIdb() {
  try {
    if (typeof indexedDB !== "undefined" && indexedDB) return indexedDB;
    if (typeof window !== "undefined" && window?.indexedDB) return window.indexedDB;
  } catch {
    // no-op
  }
  return null;
}

function upgradeOutboxDb(db, oldVersion) {
  if (oldVersion < 1) {
    const operations = db.createObjectStore("operations", { keyPath: "opId" });
    operations.createIndex("bySession", "sessionId", { unique: false });
    operations.createIndex("bySessionTs", ["sessionId", "ts"], { unique: false });
    db.createObjectStore("syncState", { keyPath: "sessionId" });
  }
  if (oldVersion < 2 && !db.objectStoreNames.contains("proposed")) {
    const proposed = db.createObjectStore("proposed", { keyPath: "proposedId" });
    proposed.createIndex("bySession", "sessionId", { unique: false });
  }
}

function doOpen(idbRef) {
  return new Promise((resolve) => {
    let req;
    try {
      req = idbRef.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    if (!req) {
      resolve(null);
      return;
    }
    req.onupgradeneeded = (event) => {
      try {
        upgradeOutboxDb(req.result, Number(event?.oldVersion) || 0);
      } catch {
        // schema conflict — open falls through to onerror/success
      }
    };
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
    req.onblocked = () => {
      // other tab holds the db; treat as unavailable for this session
      resolve(null);
    };
  });
}

let cachedDefaultDbPromise = null;

/** @returns {Promise<IDBDatabase|null>} */
export function openOutboxDb({ idb } = {}) {
  const idbRef = idb || defaultIdb();
  if (!idbRef) return Promise.resolve(null);
  if (idb) return doOpen(idbRef); // explicit (mock/test) idb: fresh open every time
  if (!cachedDefaultDbPromise) cachedDefaultDbPromise = doOpen(idbRef);
  return cachedDefaultDbPromise;
}

export function __resetOutboxDbForTests() {
  cachedDefaultDbPromise = null;
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb_request_failed"));
  });
}

export async function idbGet(db, storeName, key) {
  try {
    const tx = db.transaction(storeName, "readonly");
    return await requestToPromise(tx.objectStore(storeName).get(key));
  } catch {
    return undefined;
  }
}

export async function idbPut(db, storeName, value) {
  try {
    const tx = db.transaction(storeName, "readwrite");
    await requestToPromise(tx.objectStore(storeName).put(value));
  } catch {
    // durable-запись best-effort: деградация ≠ потеря in-memory буфера
  }
}

export async function idbDelete(db, storeName, key) {
  try {
    const tx = db.transaction(storeName, "readwrite");
    await requestToPromise(tx.objectStore(storeName).delete(key));
  } catch {
    // no-op
  }
}

/** getAll по индексу с точным равенством ключа (query = ключ индекса). */
export async function idbGetAllByIndex(db, storeName, indexName, query) {
  try {
    const tx = db.transaction(storeName, "readonly");
    const values = await requestToPromise(tx.objectStore(storeName).index(indexName).getAll(query));
    return Array.isArray(values) ? values : [];
  } catch {
    return [];
  }
}

/**
 * Микро-очередь записей: последовательные readwrite-tx не перепрыгивают друг
 * друга, порядок append/remove сохраняется (TESTS §1.1).
 */
export function createWriteQueue() {
  let tail = Promise.resolve();
  return {
    enqueue(task) {
      const run = tail.then(() => task());
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}
