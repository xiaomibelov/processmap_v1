import {
  buildDrawioJazzSnapshot,
  hasDrawioPayload,
  normalizeDrawioMeta,
  readDrawioLifecycleIssue,
  serializeDrawioMeta,
} from "./drawioMeta.js";

const JAZZ_PACKAGE = "jazz-tools";
const JAZZ_BROWSER_PACKAGE = "jazz-tools/browser";
const DOC_IDS_STORAGE_KEY = "fpc:drawio-jazz-docids";
const AUTH_SECRET_STORAGE_KEY = "jazz-logged-in-secret";
const DEFAULT_JAZZ_TOOLS_URL = new URL("./jazzTools.runtime.js", import.meta.url).href;
const DEFAULT_JAZZ_BROWSER_URL = new URL("./jazzToolsBrowser.runtime.js", import.meta.url).href;

function toText(value) {
  return String(value || "").trim();
}

function readLocalStorage(key) {
  if (typeof window === "undefined") return "";
  try {
    return toText(window.localStorage?.getItem(key));
  } catch {
    return "";
  }
}

function writeLocalStorage(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(key, String(value || ""));
  } catch {
  }
}

function removeLocalStorage(key) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.removeItem(key);
  } catch {
  }
}

function readEnv(key) {
  if (typeof import.meta === "undefined" || !import.meta.env) return "";
  return toText(import.meta.env[key]);
}

function readDocIdsMap() {
  const raw = readLocalStorage(DOC_IDS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDocIdsMap(value) {
  writeLocalStorage(DOC_IDS_STORAGE_KEY, JSON.stringify(value && typeof value === "object" ? value : {}));
}

function readAuthSecretRaw() {
  return readLocalStorage(AUTH_SECRET_STORAGE_KEY);
}

function clearAuthSecretRaw() {
  removeLocalStorage(AUTH_SECRET_STORAGE_KEY);
}

function isCorruptPersistedAuthError(error) {
  const message = toText(error?.message || error).toLowerCase();
  return (
    message.includes("unexpected token")
    || message.includes("not valid json")
    || message.includes("unterminated string")
    || message.includes("expected property name")
  );
}

function buildEmptySnapshot(issue = null) {
  const out = buildDrawioJazzSnapshot({});
  if (issue?.code) out._lifecycle_code = toText(issue.code);
  if (issue?.message) out._lifecycle_error = toText(issue.message);
  return normalizeDrawioMeta(out);
}

function normalizeSnapshot(snapshotRaw) {
  const snapshot = buildDrawioJazzSnapshot(snapshotRaw);
  if (!toText(snapshot.last_saved_at)) {
    snapshot.last_saved_at = new Date().toISOString();
  }
  return normalizeDrawioMeta(snapshot);
}

function snapshotFromJazzRecord(record) {
  const payloadJson = toText(record?.payload_json);
  if (!payloadJson) return buildEmptySnapshot();
  try {
    return normalizeSnapshot(JSON.parse(payloadJson));
  } catch {
    return buildEmptySnapshot({
      code: "corrupt_payload",
      message: "Jazz draw.io payload повреждён и не может быть прочитан.",
    });
  }
}

function jazzRecordFromSnapshot(scopeId, snapshotRaw) {
  const snapshot = normalizeSnapshot(snapshotRaw);
  return {
    scopeId: toText(scopeId),
    payload_json: JSON.stringify(snapshot),
    payload_hash: serializeDrawioMeta(snapshot),
    updated_at: toText(snapshot.last_saved_at) || new Date().toISOString(),
  };
}

async function importJazzModule(specifier) {
  const importDynamic = new Function("s", "return import(s);");
  if (specifier === JAZZ_PACKAGE) {
    const runtimeUrl = readLocalStorage("fpc:drawio-jazz-tools-url")
      || readEnv("VITE_DRAWIO_JAZZ_TOOLS_URL")
      || DEFAULT_JAZZ_TOOLS_URL;
    return importDynamic(runtimeUrl);
  }
  if (specifier === JAZZ_BROWSER_PACKAGE) {
    const runtimeUrl = readLocalStorage("fpc:drawio-jazz-tools-browser-url")
      || readEnv("VITE_DRAWIO_JAZZ_TOOLS_BROWSER_URL")
      || DEFAULT_JAZZ_BROWSER_URL;
    return importDynamic(runtimeUrl);
  }
  throw new Error(`unsupported_jazz_module:${specifier}`);
}

async function waitForRecordSync(record) {
  const waitForSync = record?.$jazz?.waitForSync;
  if (typeof waitForSync !== "function") return;
  await waitForSync.call(record.$jazz, { timeout: 15000 });
}

export function createDrawioJazzSpikeAdapter({
  peer = "",
  scopeId = "",
} = {}) {
  const normalizedPeer = toText(peer);
  const normalizedScopeId = toText(scopeId);
  const listeners = new Set();
  let snapshot = buildEmptySnapshot();
  let record = null;
  let unsubscribe = null;
  let runtimePromise = null;
  let schemaPromise = null;
  let pendingDelivery = false;
  let lifecycleIssue = null;
  let runtimeAuthMode = "unknown";
  let pollTimer = 0;

  function emitSnapshot(nextSnapshot) {
    snapshot = normalizeDrawioMeta(nextSnapshot);
    listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch {
      }
    });
  }

  function scopedKey() {
    return normalizedScopeId;
  }

  function resolveDocId() {
    const map = readDocIdsMap();
    return toText(map[scopedKey()]);
  }

  function persistDocId(docId) {
    const key = scopedKey();
    if (!key) return;
    const map = readDocIdsMap();
    map[key] = toText(docId);
    writeDocIdsMap(map);
  }

  function clearPersistedDocId() {
    const key = scopedKey();
    if (!key) return;
    const map = readDocIdsMap();
    delete map[key];
    writeDocIdsMap(map);
  }

  function setLifecycleIssue(issue) {
    lifecycleIssue = issue || null;
    emitSnapshot(buildEmptySnapshot(issue));
  }

  function clearLifecycleIssue() {
    lifecycleIssue = null;
  }

  function scheduleSnapshotDelivery(nextRecord) {
    record = nextRecord;
    if (pendingDelivery) return;
    pendingDelivery = true;
    queueMicrotask(() => {
      pendingDelivery = false;
      if (!record || record.$isLoaded === false) return;
      clearLifecycleIssue();
      emitSnapshot(snapshotFromJazzRecord(record));
    });
  }

  async function ensureRuntime() {
    if (!normalizedPeer) {
      throw new Error("Jazz draw.io pilot не настроен: укажите VITE_DRAWIO_JAZZ_PEER или localStorage fpc:drawio-jazz-peer.");
    }
    if (!runtimePromise) {
      runtimePromise = (async () => {
        const [{ JazzBrowserContextManager }] = await Promise.all([
          importJazzModule(JAZZ_BROWSER_PACKAGE),
        ]);
        const hasPersistedAuth = Boolean(readAuthSecretRaw());
        const createContext = async () => {
          const manager = new JazzBrowserContextManager();
          await manager.createContext({
            sync: {
              peer: normalizedPeer,
              when: "always",
            },
            defaultProfileName: "Drawio Overlay Spike",
          });
          return manager;
        };
        let manager;
        try {
          manager = await createContext();
          runtimeAuthMode = hasPersistedAuth ? "persisted" : "fresh_bootstrap";
        } catch (error) {
          if (!hasPersistedAuth || !isCorruptPersistedAuthError(error)) {
            throw error;
          }
          clearAuthSecretRaw();
          manager = await createContext();
          runtimeAuthMode = "recovered_from_corrupt";
        }
        if (!readAuthSecretRaw()) {
          throw new Error("Jazz draw.io pilot не сохранил bootstrap credentials.");
        }
        return manager;
      })().catch((error) => {
        runtimePromise = null;
        throw error;
      });
    }
    return runtimePromise;
  }

  async function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        const jazz = await importJazzModule(JAZZ_PACKAGE);
        const { co, z } = jazz;
        return co.map({
          scopeId: z.string(),
          payload_json: z.string(),
          payload_hash: z.string(),
          updated_at: z.string(),
        });
      })();
    }
    return schemaPromise;
  }

  async function ensureRecord({ forceReload = false } = {}) {
    if (record && !forceReload) return record;
    const docId = resolveDocId();
    if (docId) {
      const runtime = await ensureRuntime();
      const schema = await ensureSchema();
      let loaded = null;
      try {
        loaded = await schema.load(docId, runtime, {});
      } catch (error) {
        if (runtimeAuthMode !== "persisted") {
          setLifecycleIssue({
            code: "auth_drift",
            message: "Jazz bootstrap state изменилась, и сохранённый draw.io overlay doc больше нельзя безопасно открыть. Нужна повторная привязка Jazz state.",
          });
          throw error;
        }
      }
      if (loaded && loaded.$isLoaded === false) {
        try {
          await waitForRecordSync(loaded);
        } catch {
        }
      }
      if (!loaded || loaded.$isLoaded === false) {
        if (runtimeAuthMode !== "persisted") {
          setLifecycleIssue({
            code: "auth_drift",
            message: "Jazz bootstrap state изменилась, и сохранённый draw.io overlay doc больше нельзя безопасно открыть. Нужна повторная привязка Jazz state.",
          });
          return null;
        }
        if (record || hasDrawioPayload(snapshot)) {
          return record;
        }
        clearPersistedDocId();
        record = null;
        clearLifecycleIssue();
        emitSnapshot(buildEmptySnapshot());
        return null;
      }
      record = loaded;
      clearLifecycleIssue();
      scheduleSnapshotDelivery(loaded);
      return loaded;
    }
    return null;
  }

  async function ensureSubscription() {
    if (unsubscribe || !normalizedScopeId) return;
    const docId = resolveDocId();
    if (!docId) return;
    await ensureRuntime();
    const schema = await ensureSchema();
    const stop = schema.subscribe(docId, {}, (updated) => {
      if (!updated || updated.$isLoaded === false) return;
      scheduleSnapshotDelivery(updated);
    });
    unsubscribe = typeof stop === "function" ? stop : null;
    if (typeof window !== "undefined" && !pollTimer) {
      pollTimer = window.setInterval(() => {
        void ensureRecord({ forceReload: true }).catch((error) => {
          setLifecycleIssue({
            code: "runtime_error",
            message: toText(error?.message || error) || "drawio_jazz_poll_failed",
          });
        });
      }, 1000);
    }
    await ensureRecord({ forceReload: true });
  }

  async function createFreshRecord(nextSnapshot) {
    const runtime = await ensureRuntime();
    const schema = await ensureSchema();
    const created = schema.create(
      jazzRecordFromSnapshot(normalizedScopeId, nextSnapshot),
      runtime,
      {
        owner: runtime?.account?.me,
      },
    );
    await waitForRecordSync(created);
    persistDocId(toText(created?.$jazz?.id || created?.id));
    record = created;
    clearLifecycleIssue();
    emitSnapshot(snapshotFromJazzRecord(created));
    await ensureSubscription();
    return created;
  }

  async function syncLatestRecordSnapshot() {
    const latest = await ensureRecord({ forceReload: true });
    if (!latest || latest.$isLoaded === false) {
      return buildEmptySnapshot(lifecycleIssue);
    }
    scheduleSnapshotDelivery(latest);
    return snapshotFromJazzRecord(latest);
  }

  return {
    mode: "jazz",
    readSharedSnapshot() {
      if (lifecycleIssue) {
        return buildEmptySnapshot(lifecycleIssue);
      }
      return snapshot;
    },
    async applySnapshot({ snapshot: nextSnapshotRaw } = {}) {
      const nextSnapshot = normalizeSnapshot(nextSnapshotRaw);
      try {
        if (lifecycleIssue) {
          return {
            ok: false,
            blocked: toText(lifecycleIssue?.code) || "lifecycle_issue",
            error: toText(lifecycleIssue?.message) || "drawio_jazz_lifecycle_issue",
          };
        }
        const loaded = await ensureRecord();
        if (!loaded) {
          const created = await createFreshRecord(nextSnapshot);
          return { ok: true, snapshot: snapshotFromJazzRecord(created) };
        }
        const comparable = snapshotFromJazzRecord(loaded);
        if (serializeDrawioMeta(comparable) === serializeDrawioMeta(nextSnapshot)) {
          await ensureSubscription();
          return { ok: true, snapshot: comparable, skipped: true };
        }
        loaded.$jazz.set("payload_json", JSON.stringify(nextSnapshot));
        loaded.$jazz.set("payload_hash", serializeDrawioMeta(nextSnapshot));
        loaded.$jazz.set("updated_at", toText(nextSnapshot.last_saved_at) || new Date().toISOString());
        scheduleSnapshotDelivery(loaded);
        await waitForRecordSync(loaded);
        await ensureSubscription();
        const syncedSnapshot = await syncLatestRecordSnapshot();
        return { ok: true, snapshot: syncedSnapshot };
      } catch (error) {
        const lifecycle = readDrawioLifecycleIssue(snapshot);
        return {
          ok: false,
          blocked: lifecycle?.code || "runtime_error",
          error: toText(error?.message || error) || "drawio_jazz_apply_failed",
        };
      }
    },
    async clearSharedSnapshot() {
      return this.applySnapshot({ snapshot: buildEmptySnapshot() });
    },
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      try {
        listener(this.readSharedSnapshot());
      } catch {
      }
      void ensureSubscription().catch((error) => {
        const message = toText(error?.message || error) || "drawio_jazz_runtime_failed";
        setLifecycleIssue({
          code: message.includes("unsupported_jazz_module") ? "missing_dependency" : "runtime_error",
          message,
        });
      });
      return () => {
        listeners.delete(listener);
        if (!listeners.size && unsubscribe) {
          try {
            unsubscribe();
          } catch {
          }
          unsubscribe = null;
        }
        if (!listeners.size && typeof window !== "undefined" && pollTimer) {
          window.clearInterval(pollTimer);
          pollTimer = 0;
        }
      };
    },
    clearLifecycleStorage() {
      clearPersistedDocId();
      clearAuthSecretRaw();
      removeLocalStorage("fpc:drawio-jazz-tools-url");
      removeLocalStorage("fpc:drawio-jazz-tools-browser-url");
    },
    hasPersistedDoc() {
      return !!resolveDocId();
    },
    hasPayload() {
      return hasDrawioPayload(snapshot);
    },
  };
}
