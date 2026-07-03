function asText(value) {
  return String(value || "");
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fnv1aHex(input) {
  const src = asText(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const SNAPSHOT_DB_NAME = "fpc_bpmn_snapshots_db";
const SNAPSHOT_DB_STORE = "session_snapshots";
const SNAPSHOT_DB_VERSION = 1;
const SNAPSHOT_LOCAL_PREFIX = "fpc_bpmn_snapshots:";
const SNAPSHOT_SCOPE_PREFIX = "snapshots:";
const SNAPSHOT_DEFAULT_LIMIT = 20;

let dbPromise = null;

function shouldLogSnapshotTrace() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem("fpc_debug_snapshots") || "").trim() === "1";
  } catch {
    return false;
  }
}

function logSnapshotTrace(tag, payload = {}) {
  if (!shouldLogSnapshotTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[SNAPSHOT] ${String(tag || "trace")} ${suffix}`.trim());
}

function scopeParts(projectId, sessionId) {
  const pid = asText(projectId).trim() || "no_project";
  const sid = asText(sessionId).trim();
  return { pid, sid };
}

function scopeKey(projectId, sessionId) {
  const { pid, sid } = scopeParts(projectId, sessionId);
  return `${SNAPSHOT_SCOPE_PREFIX}${pid}:${sid}`;
}

function legacyScopeKey(projectId, sessionId) {
  const { pid, sid } = scopeParts(projectId, sessionId);
  return `${pid}:${sid}`;
}

function scopedAliasKeys(projectId, sessionId) {
  const sid = asText(sessionId).trim();
  if (!sid) return [];
  const keys = new Set();
  const pushScope = (pidRaw) => {
    const pid = asText(pidRaw).trim();
    keys.add(scopeKey(pid, sid));
    keys.add(legacyScopeKey(pid, sid));
  };
  const { pid } = scopeParts(projectId, sid);
  pushScope(pid);
  if (pid !== "no_project") {
    // Backward-compat: older builds stored snapshots without a real project id.
    pushScope("no_project");
    pushScope("");
  }
  return Array.from(keys).filter(Boolean);
}

export function buildSnapshotStorageKey({ projectId, sessionId } = {}) {
  const sid = asText(sessionId).trim();
  if (!sid) return "";
  return scopeKey(projectId, sid);
}

function localStorageKey(key) {
  return `${SNAPSHOT_LOCAL_PREFIX}${key}`;
}

function normalizeReason(reason) {
  const raw = asText(reason).trim().toLowerCase();
  if (!raw) return "autosave";
  if (raw.includes("manual_restore")) return "manual_restore";
  if (raw.includes("manual_checkpoint")) return "manual_checkpoint";
  if (raw.includes("tab_switch")) return "tab_switch";
  if (raw.includes("interview")) return "interview_change";
  if (raw.includes("import")) return "import";
  if (raw.includes("seed")) return "seed";
  if (raw.includes("persist")) return "persist_ok";
  if (raw.includes("autosave")) return "autosave";
  return raw;
}

function snapshotMode(reason) {
  const raw = asText(reason).trim().toLowerCase();
  if (raw === "manual_checkpoint") return "manual";
  return "auto";
}

function snapshotBackendHint() {
  if (typeof window === "undefined") return "none";
  try {
    return typeof window.indexedDB === "undefined"
      ? "localStorage"
      : "indexedDB+localStorage";
  } catch {
    return "localStorage";
  }
}

function logSnapshotDecision(payload = {}) {
  // eslint-disable-next-line no-console
  console.debug(
    `SNAPSHOT_DECISION sid=${asText(payload?.sid || "-")} rev=${asNumber(payload?.rev, 0)} `
    + `hash=${asText(payload?.hash || "")} len=${asNumber(payload?.len, 0)} `
    + `existingCount=${asNumber(payload?.existingCount, 0)} lastSnapshotId=${asText(payload?.lastSnapshotId || "-")} `
    + `lastHash=${asText(payload?.lastHash || "-")} reason=${asText(payload?.reason || "read_fail")} `
    + `key="${asText(payload?.key || "")}" mode=${asText(payload?.mode || "auto")} force=${payload?.force ? 1 : 0}`,
  );
}

function normalizeSnapshot(raw) {
  const xml = asText(raw?.xml);
  const hash = asText(raw?.hash || fnv1aHex(xml));
  const id = asText(raw?.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const ts = asNumber(raw?.ts, Date.now());
  const rev = asNumber(raw?.rev, 0);
  const reason = normalizeReason(raw?.reason);
  const len = asNumber(raw?.len, xml.length);
  const label = asText(raw?.label).trim();
  const pinned = raw?.pinned === true;
  return {
    id,
    ts,
    reason,
    xml,
    hash,
    len,
    rev,
    pinned,
    ...(label ? { label } : {}),
  };
}

function normalizeRecord(raw) {
  const items = Array.isArray(raw?.items) ? raw.items.map(normalizeSnapshot) : [];
  const sorted = items
    .filter((item) => asText(item?.xml).trim())
    .sort((a, b) => {
      const pinnedDelta = (b?.pinned === true ? 1 : 0) - (a?.pinned === true ? 1 : 0);
      if (pinnedDelta !== 0) return pinnedDelta;
      const t = asNumber(b?.ts, 0) - asNumber(a?.ts, 0);
      if (t !== 0) return t;
      return asText(b?.id).localeCompare(asText(a?.id));
    });
  return {
    key: asText(raw?.key),
    updatedAt: asNumber(raw?.updatedAt, Date.now()),
    items: sorted,
  };
}

async function openSnapshotsDb() {
  if (typeof window === "undefined" || typeof window.indexedDB === "undefined") return null;
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(SNAPSHOT_DB_NAME, SNAPSHOT_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SNAPSHOT_DB_STORE)) {
          db.createObjectStore(SNAPSHOT_DB_STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function readRecordFromIdb(key) {
  const db = await openSnapshotsDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    try {
      const tx = db.transaction(SNAPSHOT_DB_STORE, "readonly");
      const store = tx.objectStore(SNAPSHOT_DB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeRecordToIdb(record) {
  const db = await openSnapshotsDb();
  if (!db) return false;
  return await new Promise((resolve) => {
    try {
      const tx = db.transaction(SNAPSHOT_DB_STORE, "readwrite");
      const store = tx.objectStore(SNAPSHOT_DB_STORE);
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function readRecordFromLocalStorageRaw(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage?.getItem(localStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeRecordToLocalStorage(record) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage?.setItem(localStorageKey(record.key), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

async function readRawRecord(key) {
  const fromDb = await readRecordFromIdb(key);
  if (fromDb && typeof fromDb === "object") return fromDb;
  const fromLs = readRecordFromLocalStorageRaw(key);
  if (fromLs && typeof fromLs === "object") return fromLs;
  return null;
}

async function readRecordWithFallback(primaryKey, fallbackKey = "") {
  const primaryRaw = await readRawRecord(primaryKey);
  if (primaryRaw && typeof primaryRaw === "object") {
    return {
      record: normalizeRecord(primaryRaw),
      fromLegacy: false,
      sourceKey: primaryKey,
    };
  }

  const fallback = asText(fallbackKey).trim();
  if (fallback && fallback !== primaryKey) {
    const legacyRaw = await readRawRecord(fallback);
    if (legacyRaw && typeof legacyRaw === "object") {
      return {
        record: normalizeRecord({ ...legacyRaw, key: primaryKey }),
        fromLegacy: true,
        sourceKey: fallback,
      };
    }
  }

  return {
    record: normalizeRecord({ key: primaryKey, items: [] }),
    fromLegacy: false,
    sourceKey: primaryKey,
  };
}

function mergeSnapshotItems(listsRaw = []) {
  const byIdentity = new Map();
  const lists = Array.isArray(listsRaw) ? listsRaw : [];
  lists.forEach((itemsRaw) => {
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    items.forEach((itemRaw) => {
      const item = normalizeSnapshot(itemRaw);
      const explicitId = asText(item?.id).trim();
      const identity = explicitId || `${asText(item?.hash)}:${asNumber(item?.rev, 0)}:${asNumber(item?.len, 0)}:${asNumber(item?.ts, 0)}`;
      if (!identity) return;
      const prev = byIdentity.get(identity);
      if (!prev) {
        byIdentity.set(identity, item);
        return;
      }
      const prevPinned = prev?.pinned === true ? 1 : 0;
      const nextPinned = item?.pinned === true ? 1 : 0;
      if (nextPinned !== prevPinned) {
        if (nextPinned > prevPinned) byIdentity.set(identity, item);
        return;
      }
      if (asNumber(item?.ts, 0) >= asNumber(prev?.ts, 0)) {
        byIdentity.set(identity, item);
      }
    });
  });
  return normalizeRecord({ key: "", items: Array.from(byIdentity.values()) }).items;
}

async function readMergedRecord(projectId, sessionId) {
  const sid = asText(sessionId).trim();
  const key = scopeKey(projectId, sid);
  const aliasKeys = scopedAliasKeys(projectId, sid);
  const sourceRecords = [];
  for (let i = 0; i < aliasKeys.length; i += 1) {
    const aliasKey = aliasKeys[i];
    const raw = await readRawRecord(aliasKey);
    if (!raw || typeof raw !== "object") continue;
    sourceRecords.push({
      key: aliasKey,
      record: normalizeRecord({ ...raw, key: aliasKey }),
    });
  }
  if (!sourceRecords.length) {
    return {
      key,
      aliasKeys,
      sourceKeys: [],
      record: normalizeRecord({ key, items: [] }),
    };
  }
  if (sourceRecords.length === 1 && sourceRecords[0]?.key === key) {
    return {
      key,
      aliasKeys,
      sourceKeys: [key],
      record: sourceRecords[0].record,
    };
  }
  return {
    key,
    aliasKeys,
    sourceKeys: sourceRecords.map((entry) => asText(entry?.key).trim()).filter(Boolean),
    record: normalizeRecord({
      key,
      items: mergeSnapshotItems(sourceRecords.map((entry) => entry.record?.items || [])),
    }),
  };
}

async function writeRecord(record) {
  const normalized = normalizeRecord(record);
  normalized.updatedAt = Date.now();
  if (!normalized.key) return false;
  const idbOk = await writeRecordToIdb(normalized);
  const lsOk = writeRecordToLocalStorage(normalized);
  return idbOk || lsOk;
}

function createSnapshotId(ts, rev, hash, existingIds = new Set()) {
  const stamp = asNumber(ts, Date.now());
  const short = asText(hash).slice(0, 8) || "00000000";
  const base = `${stamp}_${asNumber(rev, 0)}_${short}`;
  if (!existingIds.has(base)) return base;
  let idx = 1;
  while (existingIds.has(`${base}_${idx}`)) idx += 1;
  return `${base}_${idx}`;
}

function defaultCheckpointLabel(ts = Date.now()) {
  const stamp = asNumber(ts, Date.now());
  try {
    return `Checkpoint ${new Date(stamp).toLocaleString("ru-RU")}`;
  } catch {
    return `Checkpoint ${stamp}`;
  }
}

export async function listBpmnSnapshots({ projectId, sessionId }) {
  const sid = asText(sessionId).trim();
  if (!sid) return [];
  const merged = await readMergedRecord(projectId, sid);
  const key = merged.key;
  const record = merged.record;
  const sourceKeys = Array.isArray(merged?.sourceKeys) ? merged.sourceKeys : [];
  if (sourceKeys.length && (sourceKeys.length > 1 || sourceKeys[0] !== key)) {
    await writeRecord({ key, updatedAt: Date.now(), items: record.items });
    logSnapshotTrace("migrate_aliases", {
      sid,
      key,
      source_keys: sourceKeys.join(","),
      kept: record.items.length,
    });
  }
  logSnapshotTrace("list", {
    sid,
    key,
    count: Array.isArray(record?.items) ? record.items.length : 0,
    backend: snapshotBackendHint(),
  });
  return Array.isArray(record?.items) ? record.items : [];
}

export async function getLatestBpmnSnapshot({ projectId, sessionId }) {
  const list = await listBpmnSnapshots({ projectId, sessionId });
  return list.length ? list[0] : null;
}

export async function saveBpmnSnapshot(payload = {}) {
  const sid = asText(payload?.sessionId).trim();
  const xml = asText(payload?.xml);
  const forceRequested = payload?.force === true;
  const limit = Math.max(1, asNumber(payload?.limit, SNAPSHOT_DEFAULT_LIMIT));
  const reason = normalizeReason(payload?.reason || (forceRequested ? "manual_checkpoint" : "autosave"));
  const mode = snapshotMode(reason);
  const force = forceRequested || mode === "manual";
  const rev = asNumber(payload?.rev, 0);
  const hash = fnv1aHex(xml);
  const backend = snapshotBackendHint();

  if (!sid) {
    const response = {
      ok: false,
      saved: false,
      error: "missing_session_id",
      decisionReason: "wrong_key",
      key: "",
      existingCount: 0,
      lastSnapshotId: "",
      lastHash: "",
      hash,
      len: xml.length,
    };
    logSnapshotDecision({
      sid,
      rev,
      hash,
      len: xml.length,
      existingCount: 0,
      lastSnapshotId: "",
      lastHash: "",
      reason: response.decisionReason,
      key: "",
      mode,
      force,
    });
    return response;
  }
  if (!xml.trim()) {
    const response = {
      ok: false,
      saved: false,
      error: "empty_xml",
      decisionReason: "read_fail",
      key: scopeKey(payload?.projectId, sid),
      existingCount: 0,
      lastSnapshotId: "",
      lastHash: "",
      hash,
      len: xml.length,
    };
    logSnapshotDecision({
      sid,
      rev,
      hash,
      len: xml.length,
      existingCount: 0,
      lastSnapshotId: "",
      lastHash: "",
      reason: response.decisionReason,
      key: scopeKey(payload?.projectId, sid),
      mode,
      force,
    });
    return response;
  }

  const key = scopeKey(payload?.projectId, sid);
  if (!key) {
    const response = {
      ok: false,
      saved: false,
      error: "invalid_storage_key",
      decisionReason: "wrong_key",
      key,
      existingCount: 0,
      lastSnapshotId: "",
      lastHash: "",
      hash,
      len: xml.length,
    };
    logSnapshotDecision({
      sid,
      rev,
      hash,
      len: xml.length,
      existingCount: 0,
      lastSnapshotId: "",
      lastHash: "",
      reason: response.decisionReason,
      key,
      mode,
      force,
    });
    return response;
  }

  let readMeta;
  try {
    readMeta = await readMergedRecord(payload?.projectId, sid);
  } catch {
    const response = {
      ok: false,
      saved: false,
      error: "snapshot_read_failed",
      decisionReason: "read_fail",
      key,
      existingCount: 0,
      lastSnapshotId: "",
      lastHash: "",
      hash,
      len: xml.length,
    };
    logSnapshotDecision({
      sid,
      rev,
      hash,
      len: xml.length,
      existingCount: 0,
      lastSnapshotId: "",
      lastHash: "",
      reason: response.decisionReason,
      key,
      mode,
      force,
    });
    return response;
  }

  const current = Array.isArray(readMeta?.record?.items) ? readMeta.record.items : [];
  const existingCount = current.length;
  const latest = current[0] || null;
  const lastSnapshotId = asText(latest?.id || "");
  const lastHash = asText(latest?.hash || "");

  if (!force && latest && rev > 0 && asNumber(latest?.rev, 0) === rev && lastHash === hash) {
    logSnapshotTrace("save_skip_same_rev", { sid, key, rev, hash, len: xml.length, existing: existingCount });
    const response = {
      ok: true,
      saved: false,
      deduped: true,
      decisionReason: "skip_same_rev",
      key,
      existingCount,
      lastSnapshotId,
      lastHash,
      hash,
      len: xml.length,
      snapshot: latest,
    };
    logSnapshotDecision({
      sid,
      rev,
      hash,
      len: xml.length,
      existingCount,
      lastSnapshotId,
      lastHash,
      reason: response.decisionReason,
      key,
      mode,
      force,
    });
    return response;
  }

  if (!force && latest && lastHash === hash) {
    logSnapshotTrace("save_skip_same_hash", { sid, key, rev, hash, len: xml.length, existing: existingCount });
    const response = {
      ok: true,
      saved: false,
      deduped: true,
      decisionReason: "skip_same_hash",
      key,
      existingCount,
      lastSnapshotId,
      lastHash,
      hash,
      len: xml.length,
      snapshot: latest,
    };
    logSnapshotDecision({
      sid,
      rev,
      hash,
      len: xml.length,
      existingCount,
      lastSnapshotId,
      lastHash,
      reason: response.decisionReason,
      key,
      mode,
      force,
    });
    return response;
  }

  const now = Date.now();
  const existingIds = new Set(current.map((item) => asText(item?.id)));
  const nextItem = normalizeSnapshot({
    id: createSnapshotId(now, rev, hash, existingIds),
    ts: now,
    reason,
    xml,
    hash,
    len: xml.length,
    rev,
    label: asText(payload?.label).trim(),
  });

  const mergedRaw = [nextItem, ...current];
  const pruned = mergedRaw.length > limit;
  const merged = mergedRaw.slice(0, limit);
  const ok = await writeRecord({
    key,
    updatedAt: now,
    items: merged,
  });

  if (!ok) {
    const response = {
      ok: false,
      saved: false,
      error: "snapshot_write_failed",
      decisionReason: "read_fail",
      key,
      existingCount,
      lastSnapshotId,
      lastHash,
      hash,
      len: xml.length,
    };
    logSnapshotDecision({
      sid,
      rev,
      hash,
      len: xml.length,
      existingCount,
      lastSnapshotId,
      lastHash,
      reason: response.decisionReason,
      key,
      mode,
      force,
    });
    return response;
  }

  if (pruned) {
    // eslint-disable-next-line no-console
    console.debug(`SNAPSHOT_PRUNE before=${mergedRaw.length} after=${merged.length} key="${key}" sid=${sid}`);
  }

  const decisionReason = pruned ? "pruned" : "saved_new";
  logSnapshotTrace("save", {
    sid,
    key,
    reason,
    rev,
    len: xml.length,
    hash,
    kept: merged.length,
    from_alias: Array.isArray(readMeta?.sourceKeys) && readMeta.sourceKeys.length > 1 ? 1 : 0,
    mode,
    force: force ? 1 : 0,
    backend,
  });

  const response = {
    ok: true,
    saved: true,
    snapshot: nextItem,
    decisionReason,
    key,
    existingCount,
    lastSnapshotId,
    lastHash,
    hash,
    len: xml.length,
  };
  // eslint-disable-next-line no-console
  console.debug(
    `SNAPSHOT_SAVED sid=${sid} id=${nextItem.id} rev=${rev} hash=${hash} len=${xml.length} `
    + `reason=${reason} key="${key}" mode=${mode} force=${force ? 1 : 0} backend=${backend}`,
  );
  logSnapshotDecision({
    sid,
    rev,
    hash,
    len: xml.length,
    existingCount,
    lastSnapshotId,
    lastHash,
    reason: decisionReason,
    key,
    mode,
    force,
  });
  return response;
}

export async function clearBpmnSnapshots({ projectId, sessionId }) {
  const sid = asText(sessionId).trim();
  if (!sid) return { ok: false };
  const key = scopeKey(projectId, sid);
  const keys = scopedAliasKeys(projectId, sid);
  const writes = [];
  for (let i = 0; i < keys.length; i += 1) {
    writes.push(writeRecord({ key: keys[i], updatedAt: Date.now(), items: [] }));
  }
  const results = await Promise.all(writes);
  const ok = results.some(Boolean);
  logSnapshotTrace("clear", {
    sid,
    key,
    alias_keys: keys.join(","),
    ok: ok ? 1 : 0,
  });
  return { ok };
}

export async function getBpmnSnapshotById({ projectId, sessionId, snapshotId }) {
  const id = asText(snapshotId).trim();
  if (!id) return null;
  const list = await listBpmnSnapshots({ projectId, sessionId });
  return list.find((item) => asText(item?.id) === id) || null;
}

export async function updateBpmnSnapshotMeta(payload = {}) {
  const sid = asText(payload?.sessionId).trim();
  const snapshotId = asText(payload?.snapshotId).trim();
  if (!sid || !snapshotId) {
    return { ok: false, updated: false, error: "invalid_args" };
  }

  const key = scopeKey(payload?.projectId, sid);
  const legacyKey = legacyScopeKey(payload?.projectId, sid);
  let readMeta;
  try {
    readMeta = await readRecordWithFallback(key, legacyKey);
  } catch {
    return { ok: false, updated: false, error: "snapshot_read_failed" };
  }

  const items = Array.isArray(readMeta?.record?.items) ? [...readMeta.record.items] : [];
  const idx = items.findIndex((item) => asText(item?.id) === snapshotId);
  if (idx < 0) {
    return { ok: false, updated: false, error: "snapshot_not_found" };
  }

  const current = normalizeSnapshot(items[idx]);
  const next = { ...current };
  const hasPinned = Object.prototype.hasOwnProperty.call(payload || {}, "pinned");
  const hasLabel = Object.prototype.hasOwnProperty.call(payload || {}, "label");

  if (hasPinned) {
    next.pinned = payload?.pinned === true;
  }
  if (hasLabel) {
    const txt = asText(payload?.label).trim();
    if (txt) next.label = txt;
    else delete next.label;
  }
  if (next.pinned && !asText(next?.label).trim()) {
    next.label = defaultCheckpointLabel(next.ts || Date.now());
  }

  items[idx] = next;
  const ok = await writeRecord({
    key,
    updatedAt: Date.now(),
    items,
  });
  if (!ok) {
    return { ok: false, updated: false, error: "snapshot_write_failed" };
  }

  const normalized = normalizeRecord({
    key,
    updatedAt: Date.now(),
    items,
  });
  const updated = normalized.items.find((item) => asText(item?.id) === snapshotId) || next;
  logSnapshotTrace("meta_update", {
    sid,
    key,
    snapshot_id: snapshotId,
    pinned: updated?.pinned ? 1 : 0,
    label: asText(updated?.label || ""),
  });

  return {
    ok: true,
    updated: true,
    snapshot: updated,
    items: normalized.items,
  };
}

export function shouldAutoRestoreFromSnapshot({
  backendXml = "",
  snapshot = null,
} = {}) {
  const snapshotXml = asText(snapshot?.xml);
  if (!snapshotXml.trim()) {
    return { restore: false, reason: "snapshot_empty" };
  }
  const backend = asText(backendXml);
  if (!backend.trim()) {
    return { restore: true, reason: "backend_empty" };
  }
  return { restore: false, reason: "backend_present" };
}

export function shortSnapshotHash(xmlOrHash) {
  const raw = asText(xmlOrHash).trim();
  const hash = raw.length === 8 ? raw : fnv1aHex(raw);
  return hash.slice(0, 8);
}
