// mockIdb — in-memory подмножество IndexedDB для unit-тестов persistence-модуля
// (contour feature/async-save-pipeline-step2, TESTS §1.1: mock без новых депов).
// Поддерживает ровно то API, что использует idb.js: open(name, version) с
// onupgradeneeded (oldVersion-ветвление), objectStoreNames.contains,
// createObjectStore(keyPath) + createIndex(name, keyPath), transaction(store,
// mode) → store.get/put/delete/index(name).getAll(query). Записи клонируются
// (structuredClone), чтобы тесты не мутировали хранимое.

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function keyOfRecord(keyPath, record) {
  if (Array.isArray(keyPath)) return keyPath.map((part) => record?.[part]);
  return record?.[keyPath];
}

function keysEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function makeStore(name, keyPath) {
  const records = new Map(); // serialized key -> record
  const indexes = new Map(); // index name -> keyPath
  const serializeKey = (key) => JSON.stringify(key);
  const store = {
    name,
    keyPath,
    createIndex(indexName, indexKeyPath) {
      indexes.set(indexName, indexKeyPath);
    },
    put(record) {
      const key = keyOfRecord(keyPath, record);
      if (key === undefined || key === null) {
        throw new Error(`mockIdb: record for store "${name}" lacks keyPath "${keyPath}"`);
      }
      records.set(serializeKey(key), clone(record));
      return makeRequest(clone(record));
    },
    get(key) {
      return makeRequest(records.has(serializeKey(key)) ? clone(records.get(serializeKey(key))) : undefined);
    },
    delete(key) {
      records.delete(serializeKey(key));
      return makeRequest(undefined);
    },
    getAll() {
      return makeRequest([...records.values()].map((record) => clone(record)));
    },
    index(indexName) {
      if (!indexes.has(indexName)) {
        throw new Error(`mockIdb: store "${name}" has no index "${indexName}"`);
      }
      const indexKeyPath = indexes.get(indexName);
      return {
        getAll(query) {
          const out = [...records.values()].filter((record) => {
            const indexKey = keyOfRecord(indexKeyPath, record);
            return query === undefined || query === null || keysEqual(indexKey, query);
          });
          return makeRequest(out.map((record) => clone(record)));
        },
      };
    },
    __dump() {
      return [...records.values()].map((record) => clone(record));
    },
  };
  return store;
}

function makeRequest(result) {
  const req = { result, error: null, onsuccess: null, onerror: null };
  queueMicrotask(() => {
    try {
      req.onsuccess?.({ target: req });
    } catch (err) {
      req.error = err;
      req.onerror?.({ target: req });
    }
  });
  return req;
}

function makeDb(name) {
  const stores = new Map();
  const storeNames = new Set();
  return {
    name,
    version: 0,
    get objectStoreNames() {
      return {
        contains: (storeName) => storeNames.has(storeName),
      };
    },
    createObjectStore(storeName, options = {}) {
      if (storeNames.has(storeName)) {
        throw new Error(`mockIdb: object store "${storeName}" already exists`);
      }
      const store = makeStore(storeName, options.keyPath);
      stores.set(storeName, store);
      storeNames.add(storeName);
      return store;
    },
    transaction(storeName) {
      if (!stores.has(storeName)) {
        throw new Error(`mockIdb: unknown object store "${storeName}"`);
      }
      return {
        objectStore: (name) => {
          if (!stores.has(name)) throw new Error(`mockIdb: unknown object store "${name}"`);
          return stores.get(name);
        },
      };
    },
    __store(storeName) {
      return stores.get(storeName);
    },
  };
}

/**
 * @returns {{open: Function, __databases: Map}}
 */
export function createMockIdb() {
  const databases = new Map();
  return {
    __databases: databases,
    open(name, version) {
      const req = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        try {
          let db = databases.get(name);
          if (!db) {
            db = makeDb(name);
            databases.set(name, db);
            req.result = db;
            req.onupgradeneeded?.({ target: req, oldVersion: 0, newVersion: version });
            db.version = version;
          } else if (db.version < version) {
            req.result = db;
            const oldVersion = db.version;
            req.onupgradeneeded?.({ target: req, oldVersion, newVersion: version });
            db.version = version;
          } else {
            req.result = db;
          }
          req.onsuccess?.({ target: req });
        } catch (err) {
          req.error = err;
          req.onerror?.({ target: req });
        }
      });
      return req;
    },
  };
}
