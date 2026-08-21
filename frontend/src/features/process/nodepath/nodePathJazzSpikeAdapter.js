import { buildNodePathComparableSnapshot } from "../../../components/sidebar/nodePathSyncState.js";

const JAZZ_PACKAGE = "jazz-tools";
const JAZZ_BROWSER_PACKAGE = "jazz-tools/browser";
const DOC_IDS_STORAGE_KEY = "fpc:nodepath-jazz-docids";
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

function isCorruptPersistedAuthError(error) {
  const message = toText(error?.message || error).toLowerCase();
  return (
    message.includes("unexpected token")
    || message.includes("not valid json")
    || message.includes("unterminated string")
    || message.includes("expected property name")
  );
}

function snapshotFromJazzRecord(record) {
  return buildNodePathComparableSnapshot({
    paths: [
      record?.p0 ? "P0" : "",
      record?.p1 ? "P1" : "",
      record?.p2 ? "P2" : "",
    ].filter(Boolean),
    sequence_key: record?.sequence_key || "",
  });
}

function jazzRecordFromSnapshot(nodeId, snapshotRaw) {
  const snapshot = buildNodePathComparableSnapshot(snapshotRaw);
  return {
    nodeId: toText(nodeId),
    p0: snapshot.paths.includes("P0"),
    p1: snapshot.paths.includes("P1"),
    p2: snapshot.paths.includes("P2"),
    sequence_key: snapshot.sequence_key || "",
  };
}

async function importJazzModule(specifier) {
  const importDynamic = new Function("s", "return import(s);");
  if (specifier === JAZZ_PACKAGE) {
    const runtimeUrl = readLocalStorage("fpc:nodepath-jazz-tools-url")
      || readEnv("VITE_NODEPATH_JAZZ_TOOLS_URL")
      || DEFAULT_JAZZ_TOOLS_URL;
    return importDynamic(runtimeUrl);
  }
  if (specifier === JAZZ_BROWSER_PACKAGE) {
    const runtimeUrl = readLocalStorage("fpc:nodepath-jazz-tools-browser-url")
      || readEnv("VITE_NODEPATH_JAZZ_TOOLS_BROWSER_URL")
      || DEFAULT_JAZZ_BROWSER_URL;
    return importDynamic(runtimeUrl);
  }
  throw new Error(`unsupported_jazz_module:${specifier}`);
}

function readAuthSecretRaw() {
  return readLocalStorage("jazz-logged-in-secret");
}

function clearAuthSecretRaw() {
  removeLocalStorage("jazz-logged-in-secret");
}

async function waitForRecordSync(record) {
  const waitForSync = record?.$jazz?.waitForSync;
  if (typeof waitForSync !== "function") return;
  await waitForSync.call(record.$jazz, { timeout: 15000 });
}

export function createNodePathJazzSpikeAdapter({
  peer = "",
  scopeId = "",
} = {}) {
  const normalizedPeer = toText(peer);
  const normalizedScopeId = toText(scopeId);
  const snapshotByNodeId = new Map();
  const recordByNodeId = new Map();
  const unsubscribeByNodeId = new Map();
  const listenersByNodeId = new Map();
  const pendingDeliveryByNodeId = new Map();
  const lifecycleIssueByNodeId = new Map();
  let runtimePromise = null;
  let schemaPromise = null;
  let runtimeAuthMode = "unknown";

  function buildScopedNodeKey(nodeId) {
    const normalizedNodeId = toText(nodeId);
    return normalizedScopeId ? `${normalizedScopeId}::${normalizedNodeId}` : normalizedNodeId;
  }

  function emitSnapshot(nodeId, snapshot) {
    snapshotByNodeId.set(nodeId, snapshot);
    const listeners = listenersByNodeId.get(nodeId);
    if (!listeners) return;
    listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch {
      }
    });
  }

  function buildLifecycleIssueSnapshot(issue) {
    return {
      ...buildNodePathComparableSnapshot(null),
      _lifecycle_code: toText(issue?.code),
      _lifecycle_error: toText(issue?.message),
    };
  }

  function setLifecycleIssue(nodeId, issue) {
    const normalizedNodeId = toText(nodeId);
    if (!normalizedNodeId || !issue) return;
    lifecycleIssueByNodeId.set(normalizedNodeId, issue);
    emitSnapshot(normalizedNodeId, buildLifecycleIssueSnapshot(issue));
  }

  function clearLifecycleIssue(nodeId) {
    const normalizedNodeId = toText(nodeId);
    if (!normalizedNodeId) return;
    lifecycleIssueByNodeId.delete(normalizedNodeId);
  }

  function scheduleSnapshotDelivery(nodeId, record) {
    const normalizedNodeId = toText(nodeId);
    if (!normalizedNodeId) return;
    recordByNodeId.set(normalizedNodeId, record);
    if (pendingDeliveryByNodeId.has(normalizedNodeId)) return;
    pendingDeliveryByNodeId.set(normalizedNodeId, true);
    queueMicrotask(() => {
      pendingDeliveryByNodeId.delete(normalizedNodeId);
      const latestRecord = recordByNodeId.get(normalizedNodeId);
      if (!latestRecord || latestRecord.$isLoaded === false) return;
      emitSnapshot(normalizedNodeId, snapshotFromJazzRecord(latestRecord));
    });
  }

  async function ensureRuntime() {
    if (!normalizedPeer) {
      throw new Error("Jazz spike не настроен: укажите VITE_NODEPATH_JAZZ_PEER или localStorage fpc:nodepath-jazz-peer.");
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
            defaultProfileName: "NodePath Spike",
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
          throw new Error("Jazz spike не сохранил bootstrap credentials.");
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
          nodeId: z.string(),
          p0: z.boolean(),
          p1: z.boolean(),
          p2: z.boolean(),
          sequence_key: z.string(),
        });
      })();
    }
    return schemaPromise;
  }

  function resolveDocId(nodeId) {
    const map = readDocIdsMap();
    return toText(map[buildScopedNodeKey(nodeId)]);
  }

  function persistDocId(nodeId, docId) {
    const map = readDocIdsMap();
    map[buildScopedNodeKey(nodeId)] = toText(docId);
    writeDocIdsMap(map);
  }

  function clearPersistedDocId(nodeId) {
    const map = readDocIdsMap();
    const scopedNodeKey = buildScopedNodeKey(nodeId);
    if (!Object.prototype.hasOwnProperty.call(map, scopedNodeKey)) return;
    delete map[scopedNodeKey];
    writeDocIdsMap(map);
  }

  async function ensureRecord(nodeId, options = {}) {
    const normalizedNodeId = toText(nodeId);
    const forceReload = options?.forceReload === true;
    if (!normalizedNodeId) throw new Error("missing_node_id");
    const cached = recordByNodeId.get(normalizedNodeId);
    if (cached && !forceReload) return cached;
    await ensureRuntime();
    const NodePathJazzDoc = await ensureSchema();
    const docId = resolveDocId(normalizedNodeId);
    if (!docId) return null;
    let loaded = null;
    try {
      loaded = await NodePathJazzDoc.load(docId);
    } catch (error) {
      if (runtimeAuthMode !== "persisted") {
        setLifecycleIssue(normalizedNodeId, {
          code: "auth_drift",
          message: "Jazz bootstrap state изменилась, и сохранённый shared doc больше нельзя безопасно открыть. Нужна повторная привязка Jazz state.",
        });
        return null;
      }
      clearPersistedDocId(normalizedNodeId);
      recordByNodeId.delete(normalizedNodeId);
      clearLifecycleIssue(normalizedNodeId);
      snapshotByNodeId.delete(normalizedNodeId);
      emitSnapshot(normalizedNodeId, buildNodePathComparableSnapshot(null));
      return null;
    }
    if (!loaded || loaded.$isLoaded === false) {
      if (runtimeAuthMode !== "persisted") {
        setLifecycleIssue(normalizedNodeId, {
          code: "auth_drift",
          message: "Jazz bootstrap state изменилась, и сохранённый shared doc больше нельзя безопасно открыть. Нужна повторная привязка Jazz state.",
        });
        return null;
      }
      clearPersistedDocId(normalizedNodeId);
      recordByNodeId.delete(normalizedNodeId);
      clearLifecycleIssue(normalizedNodeId);
      snapshotByNodeId.delete(normalizedNodeId);
      emitSnapshot(normalizedNodeId, buildNodePathComparableSnapshot(null));
      return null;
    }
    clearLifecycleIssue(normalizedNodeId);
    recordByNodeId.set(normalizedNodeId, loaded);
    emitSnapshot(normalizedNodeId, snapshotFromJazzRecord(loaded));
    return loaded;
  }

  async function ensureSubscription(nodeId) {
    const normalizedNodeId = toText(nodeId);
    if (!normalizedNodeId || unsubscribeByNodeId.has(normalizedNodeId)) return;
    const docId = resolveDocId(normalizedNodeId);
    if (!docId) return;
    await ensureRuntime();
    const NodePathJazzDoc = await ensureSchema();
    const unsubscribe = NodePathJazzDoc.subscribe(docId, {}, (updated) => {
      if (!updated || updated.$isLoaded === false) return;
      scheduleSnapshotDelivery(normalizedNodeId, updated);
    });
    unsubscribeByNodeId.set(normalizedNodeId, typeof unsubscribe === "function" ? unsubscribe : () => {});
  }

  async function withJazz(action) {
    try {
      return await action();
    } catch (error) {
      const message = toText(error?.message || error);
      if (/cannot find package|failed to resolve module specifier|module not found|importing a module script failed|failed to fetch dynamically imported module/i.test(message)) {
        return { ok: false, error: "Jazz spike недоступен: runtime Jazz не загрузился. Проверьте VITE_NODEPATH_JAZZ_TOOLS_URL / VITE_NODEPATH_JAZZ_TOOLS_BROWSER_URL или network access.", blocked: "missing_dependency" };
      }
      return { ok: false, error: message || "Jazz spike недоступен.", blocked: "runtime_error" };
    }
  }

  return {
    mode: "jazz",

    readSharedSnapshot(nodeId) {
      const normalizedNodeId = toText(nodeId);
      const issue = lifecycleIssueByNodeId.get(normalizedNodeId);
      if (issue) return buildLifecycleIssueSnapshot(issue);
      return buildNodePathComparableSnapshot(snapshotByNodeId.get(normalizedNodeId) || null);
    },

    async applyDraft({ nodeId, draft }) {
      return withJazz(async () => {
        const normalizedNodeId = toText(nodeId);
        await ensureRuntime();
        const NodePathJazzDoc = await ensureSchema();
        const nextRecordShape = jazzRecordFromSnapshot(normalizedNodeId, draft);
        let record = await ensureRecord(normalizedNodeId);
        const lifecycleIssue = lifecycleIssueByNodeId.get(normalizedNodeId);
        if (!record && lifecycleIssue) {
          return {
            ok: false,
            error: lifecycleIssue.message,
            blocked: lifecycleIssue.code,
            snapshot: buildNodePathComparableSnapshot(null),
          };
        }
        if (!record) {
          record = NodePathJazzDoc.create(nextRecordShape);
          persistDocId(normalizedNodeId, toText(record?.$jazz?.id));
          recordByNodeId.set(normalizedNodeId, record);
          clearLifecycleIssue(normalizedNodeId);
          emitSnapshot(normalizedNodeId, snapshotFromJazzRecord(record));
          await waitForRecordSync(record);
          await ensureSubscription(normalizedNodeId);
          return { ok: true, snapshot: snapshotFromJazzRecord(record) };
        }
        record.$jazz.set("p0", nextRecordShape.p0);
        record.$jazz.set("p1", nextRecordShape.p1);
        record.$jazz.set("p2", nextRecordShape.p2);
        record.$jazz.set("sequence_key", nextRecordShape.sequence_key);
        emitSnapshot(normalizedNodeId, snapshotFromJazzRecord(record));
        await waitForRecordSync(record);
        await ensureSubscription(normalizedNodeId);
        return { ok: true, snapshot: snapshotFromJazzRecord(record) };
      });
    },

    async clearSharedSnapshot({ nodeId }) {
      return withJazz(async () => {
        const normalizedNodeId = toText(nodeId);
        let record = await ensureRecord(normalizedNodeId);
        const lifecycleIssue = lifecycleIssueByNodeId.get(normalizedNodeId);
        if (!record && lifecycleIssue) {
          return {
            ok: false,
            error: lifecycleIssue.message,
            blocked: lifecycleIssue.code,
            snapshot: buildNodePathComparableSnapshot(null),
          };
        }
        if (!record) {
          emitSnapshot(normalizedNodeId, buildNodePathComparableSnapshot(null));
          return { ok: true, snapshot: buildNodePathComparableSnapshot(null) };
        }
        record.$jazz.set("p0", false);
        record.$jazz.set("p1", false);
        record.$jazz.set("p2", false);
        record.$jazz.set("sequence_key", "");
        emitSnapshot(normalizedNodeId, snapshotFromJazzRecord(record));
        await waitForRecordSync(record);
        await ensureSubscription(normalizedNodeId);
        return { ok: true, snapshot: snapshotFromJazzRecord(record) };
      });
    },

    subscribe(nodeId, onSnapshotChange) {
      const normalizedNodeId = toText(nodeId);
      if (!normalizedNodeId || typeof onSnapshotChange !== "function") return () => {};
      const listeners = listenersByNodeId.get(normalizedNodeId) || new Set();
      listeners.add(onSnapshotChange);
      listenersByNodeId.set(normalizedNodeId, listeners);
      const current = snapshotByNodeId.get(normalizedNodeId);
      if (current) onSnapshotChange(current);
      void ensureRecord(normalizedNodeId, { forceReload: true }).then((record) => {
        if (record) {
          emitSnapshot(normalizedNodeId, snapshotFromJazzRecord(record));
        }
      }).catch(() => {});
      void ensureSubscription(normalizedNodeId);
      return () => {
        const next = listenersByNodeId.get(normalizedNodeId);
        if (!next) return;
        next.delete(onSnapshotChange);
        if (!next.size) {
          listenersByNodeId.delete(normalizedNodeId);
        }
      };
    },
  };
}
