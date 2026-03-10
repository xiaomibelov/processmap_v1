function asText(value) {
  return String(value || "");
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTags(tags) {
  const uniq = new Set();
  asArray(tags).forEach((item) => {
    const tag = asText(item).trim().toLowerCase();
    if (!tag) return;
    uniq.add(tag);
  });
  return Array.from(uniq);
}

function normalizeNode(raw, idx = 0) {
  const item = raw && typeof raw === "object" ? raw : {};
  const di = item.di && typeof item.di === "object" ? item.di : {};
  return {
    id: asText(item.id || `node_${idx + 1}`),
    type: asText(item.type || "bpmn:Task"),
    name: asText(item.name || ""),
    laneHint: asText(item.laneHint || ""),
    propsMinimal: item.propsMinimal && typeof item.propsMinimal === "object" ? { ...item.propsMinimal } : {},
    di: {
      x: asNumber(di.x, 0),
      y: asNumber(di.y, 0),
      w: asNumber(di.w, 120),
      h: asNumber(di.h, 80),
    },
  };
}

function normalizeEdge(raw, idx = 0) {
  const item = raw && typeof raw === "object" ? raw : {};
  return {
    id: asText(item.id || `edge_${idx + 1}`),
    sourceId: asText(item.sourceId || ""),
    targetId: asText(item.targetId || ""),
    when: asText(item.when || ""),
  };
}

function normalizeFragment(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  const nodes = asArray(item.nodes)
    .map((node, idx) => normalizeNode(node, idx))
    .filter((node) => node.id);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = asArray(item.edges)
    .map((edge, idx) => normalizeEdge(edge, idx))
    .filter((edge) => edge.id && edge.sourceId && edge.targetId && nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId));
  const annotations = asArray(item.annotations)
    .map((ann, idx) => ({
      id: asText(ann?.id || `ann_${idx + 1}`),
      text: asText(ann?.text || ""),
      targetId: asText(ann?.targetId || ""),
    }))
    .filter((ann) => ann.id && ann.text);
  return { nodes, edges, annotations };
}

function sanitizePackId(rawId, createdAt) {
  const clean = asText(rawId).trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  if (clean) return clean;
  return `pack_${createdAt}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePack(raw, defaults = {}) {
  const item = raw && typeof raw === "object" ? raw : {};
  const createdAt = asNumber(item.createdAt, Date.now());
  const scope = asText(item.scope || defaults.scope || "global").trim() || "global";
  const fragment = normalizeFragment(item.fragment);
  const nodeIds = new Set(fragment.nodes.map((node) => node.id));
  const entryNodeId = nodeIds.has(asText(item.entryNodeId)) ? asText(item.entryNodeId) : asText(fragment.nodes[0]?.id || "");
  const exitNodeId = nodeIds.has(asText(item.exitNodeId))
    ? asText(item.exitNodeId)
    : asText(fragment.nodes[fragment.nodes.length - 1]?.id || "");
  const hintsRaw = item.hints && typeof item.hints === "object" ? item.hints : {};

  return {
    packId: sanitizePackId(item.packId || item.id, createdAt),
    scope,
    title: asText(item.title || "Template").trim() || "Template",
    createdAt,
    tags: normalizeTags(item.tags),
    fragment,
    entryNodeId,
    exitNodeId,
    hints: {
      defaultLaneName: asText(hintsRaw.defaultLaneName || ""),
      defaultActor: asText(hintsRaw.defaultActor || ""),
      suggestedInsertMode: asText(hintsRaw.suggestedInsertMode || "after") === "between" ? "between" : "after",
    },
  };
}

const PACK_DB_NAME = "fpc_bpmn_packs_db";
const PACK_DB_STORE = "packs";
const PACK_DB_VERSION = 1;
const PACK_LOCAL_PREFIX = "fpc_bpmn_packs:";

let dbPromise = null;

function shouldLogPackTrace() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem("fpc_debug_packs") || "").trim() === "1";
  } catch {
    return false;
  }
}

function logPackTrace(tag, payload = {}) {
  if (!shouldLogPackTrace()) return;
  const suffix = Object.entries(payload)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[PACKS] ${String(tag || "trace")} ${suffix}`.trim());
}

export function buildPackStorageKey({ scope } = {}) {
  const normalizedScope = asText(scope || "global").trim() || "global";
  return `packs:${normalizedScope}`;
}

function localStorageKey(scope) {
  return `${PACK_LOCAL_PREFIX}${buildPackStorageKey({ scope })}`;
}

async function openPacksDb() {
  if (typeof window === "undefined" || typeof window.indexedDB === "undefined") return null;
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(PACK_DB_NAME, PACK_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PACK_DB_STORE)) {
          db.createObjectStore(PACK_DB_STORE, { keyPath: "packId" });
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

async function listIdbPacks(scope) {
  const db = await openPacksDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    try {
      const tx = db.transaction(PACK_DB_STORE, "readonly");
      const store = tx.objectStore(PACK_DB_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = asArray(req.result).map((item) => normalizePack(item, { scope: asText(item?.scope || scope) }));
        resolve(all.filter((pack) => pack.scope === scope));
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function putIdbPack(pack) {
  const db = await openPacksDb();
  if (!db) return false;
  return await new Promise((resolve) => {
    try {
      const tx = db.transaction(PACK_DB_STORE, "readwrite");
      tx.objectStore(PACK_DB_STORE).put(pack);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function deleteIdbPack(packId) {
  const db = await openPacksDb();
  if (!db) return false;
  return await new Promise((resolve) => {
    try {
      const tx = db.transaction(PACK_DB_STORE, "readwrite");
      tx.objectStore(PACK_DB_STORE).delete(packId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function readLocalPacks(scope) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage?.getItem(localStorageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return asArray(parsed).map((item) => normalizePack(item, { scope })).filter((pack) => pack.scope === scope);
  } catch {
    return [];
  }
}

function writeLocalPacks(scope, packs) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage?.setItem(localStorageKey(scope), JSON.stringify(asArray(packs)));
    return true;
  } catch {
    return false;
  }
}

function sortByNewest(packs) {
  return asArray(packs).slice().sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
}

export async function listBpmnPacks({ scope = "global" } = {}) {
  const normalizedScope = asText(scope).trim() || "global";
  const idbPacks = await listIdbPacks(normalizedScope);
  const localPacks = readLocalPacks(normalizedScope);
  const list = idbPacks && idbPacks.length ? idbPacks : localPacks;
  const sorted = sortByNewest(list);
  logPackTrace("list", { scope: normalizedScope, count: sorted.length, backend: idbPacks ? "indexeddb" : "localStorage" });
  return sorted;
}

export async function getBpmnPackById({ scope = "global", packId } = {}) {
  const targetId = asText(packId).trim();
  if (!targetId) return null;
  const list = await listBpmnPacks({ scope });
  return list.find((pack) => asText(pack.packId) === targetId) || null;
}

export async function saveBpmnPack(payload = {}) {
  const scope = asText(payload.scope || "global").trim() || "global";
  const normalized = normalizePack({ ...payload, scope }, { scope });
  if (!normalized.fragment.nodes.length) {
    return {
      ok: false,
      error: "empty_fragment",
      pack: null,
    };
  }

  const existing = await listBpmnPacks({ scope });
  const idx = existing.findIndex((pack) => asText(pack.packId) === asText(normalized.packId));
  const nextList = existing.slice();
  if (idx >= 0) {
    nextList[idx] = normalized;
  } else {
    nextList.unshift(normalized);
  }

  const idbOk = await putIdbPack(normalized);
  const lsOk = writeLocalPacks(scope, sortByNewest(nextList));
  const ok = idbOk || lsOk;
  logPackTrace("save", {
    scope,
    packId: normalized.packId,
    title: normalized.title,
    nodes: normalized.fragment.nodes.length,
    edges: normalized.fragment.edges.length,
    ok: ok ? 1 : 0,
    backend: idbOk ? "indexeddb" : (lsOk ? "localStorage" : "none"),
  });
  return {
    ok,
    pack: ok ? normalized : null,
    error: ok ? "" : "pack_save_failed",
  };
}

export async function deleteBpmnPack({ scope = "global", packId } = {}) {
  const normalizedScope = asText(scope).trim() || "global";
  const targetId = asText(packId).trim();
  if (!targetId) return { ok: false };

  const existing = await listBpmnPacks({ scope: normalizedScope });
  const nextList = existing.filter((pack) => asText(pack.packId) !== targetId);
  const idbOk = await deleteIdbPack(targetId);
  const lsOk = writeLocalPacks(normalizedScope, nextList);
  const ok = idbOk || lsOk;

  logPackTrace("delete", {
    scope: normalizedScope,
    packId: targetId,
    ok: ok ? 1 : 0,
    remaining: nextList.length,
  });
  return { ok };
}

export async function clearBpmnPacks({ scope = "global" } = {}) {
  const normalizedScope = asText(scope).trim() || "global";
  const existing = await listBpmnPacks({ scope: normalizedScope });
  let idbDeleted = 0;
  for (const pack of existing) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await deleteIdbPack(asText(pack?.packId));
    if (ok) idbDeleted += 1;
  }
  const lsOk = writeLocalPacks(normalizedScope, []);
  const ok = idbDeleted > 0 || lsOk;
  logPackTrace("clear", {
    scope: normalizedScope,
    ok: ok ? 1 : 0,
    removed: existing.length,
  });
  return { ok };
}

function tokenSet(value) {
  return new Set(
    asText(value)
      .toLowerCase()
      .split(/[^a-zA-Zа-яА-Я0-9_]+/)
      .map((t) => t.trim())
      .filter(Boolean),
  );
}

function intersectionCount(a, b) {
  let count = 0;
  for (const item of a) {
    if (b.has(item)) count += 1;
  }
  return count;
}

export function suggestBpmnPacks(packs, context = {}, options = {}) {
  const max = Math.max(1, asNumber(options.max, 3));
  const selectedType = asText(context.type).toLowerCase();
  const selectedNameTokens = tokenSet(context.name || "");
  const selectedLaneTokens = tokenSet(context.laneName || context.actor || "");

  const ranked = asArray(packs)
    .map((pack) => {
      const tags = normalizeTags(pack?.tags);
      const tagTokens = new Set(tags);
      const titleTokens = tokenSet(pack?.title || "");
      const laneTokens = tokenSet(pack?.hints?.defaultLaneName || pack?.hints?.defaultActor || "");
      const hasTask = asArray(pack?.fragment?.nodes).some((node) => asText(node?.type).toLowerCase().includes("task"));

      let score = 0;
      if (selectedType.includes("task") && hasTask) score += 0.34;
      if (intersectionCount(selectedNameTokens, titleTokens) > 0) score += 0.25;
      if (intersectionCount(selectedLaneTokens, laneTokens) > 0) score += 0.3;
      if (intersectionCount(selectedNameTokens, tagTokens) > 0) score += 0.2;
      if (score <= 0 && hasTask) score += 0.12;

      return {
        pack,
        score: Number(score.toFixed(3)),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(b?.pack?.createdAt || 0) - Number(a?.pack?.createdAt || 0));

  const threshold = asNumber(options.threshold, 0.2);
  return ranked
    .filter((item) => item.score >= threshold)
    .slice(0, max)
    .map((item) => ({ ...item.pack, score: item.score }));
}

export function buildDeterministicIdRemap(fragment = {}, options = {}) {
  const prefixRaw = asText(options.prefix || "pack").trim().replace(/[^a-zA-Z0-9_]/g, "_");
  const prefix = prefixRaw || "pack";
  const nodes = asArray(fragment?.nodes).map((node) => asText(node?.id)).filter(Boolean).sort();
  const edges = asArray(fragment?.edges).map((edge) => asText(edge?.id)).filter(Boolean).sort();
  const map = {};
  nodes.forEach((id, idx) => {
    map[id] = `${prefix}_n${idx + 1}`;
  });
  edges.forEach((id, idx) => {
    map[id] = `${prefix}_e${idx + 1}`;
  });
  return map;
}

export function remapFragmentIds(fragment = {}, remap = {}) {
  const nodes = asArray(fragment?.nodes).map((node) => ({
    ...node,
    id: asText(remap[asText(node?.id)] || node?.id),
  }));
  const nodeIdSet = new Set(nodes.map((node) => asText(node.id)));
  const edges = asArray(fragment?.edges)
    .map((edge) => ({
      ...edge,
      id: asText(remap[asText(edge?.id)] || edge?.id),
      sourceId: asText(remap[asText(edge?.sourceId)] || edge?.sourceId),
      targetId: asText(remap[asText(edge?.targetId)] || edge?.targetId),
    }))
    .filter((edge) => edge.id && nodeIdSet.has(edge.sourceId) && nodeIdSet.has(edge.targetId));
  return {
    ...fragment,
    nodes,
    edges,
  };
}
