/**
 * P1 [А]: персистентность свернутости дерева explorer через Preferences API.
 *
 * Контракт: ключ `explorer.tree.expanded`, значение
 * Record<orgId::workspaceId, string[]>. Legacy `explorer.tree.collapsed`
 * читается для обратной совместимости: исторически он тоже хранил expanded ids.
 *
 * Модуль чистый (без React): маппинг + saver с debounce, base_version и
 * 409 → last-write-wins. Сеть/401 — graceful degradation (in-memory).
 */

import { apiRequest } from "../../lib/api.js";

export const USER_PREFERENCES_QUERY_KEY = ["user-preferences"];
export const EXPLORER_TREE_COLLAPSED_KEY = "explorer.tree.collapsed";
export const EXPLORER_TREE_EXPANDED_KEY = "explorer.tree.expanded";
export const TREE_SAVE_DEBOUNCE_MS = 500;

export async function fetchUserPreferences() {
  const resp = await apiRequest("/api/users/me/preferences");
  if (!resp?.ok) return null; // 401/сеть — гость остаётся на in-memory
  return resp?.data || null;
}

export async function patchUserPreferences({ baseVersion, set, unset }) {
  return apiRequest("/api/users/me/preferences", {
    method: "PATCH",
    body: { base_version: baseVersion, set, unset },
  });
}

export function treeScopeKey(orgId, workspaceId) {
  const ws = String(workspaceId || "").trim();
  if (!ws) return "";
  const org = String(orgId || "").trim();
  return org ? `${org}::${ws}` : ws;
}

function normalizedExpandedIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

function treeStateValue(preferences, key) {
  const value = preferences?.[key];
  return value && typeof value === "object" ? value : {};
}

/** Явно раскрытые узлы workspace из preferences-документа. */
export function expandedIdsFromPreferences(preferences, workspaceId, orgId = "") {
  const ws = String(workspaceId || "").trim();
  if (!ws) return [];
  const scoped = treeScopeKey(orgId, ws);
  const expanded = treeStateValue(preferences, EXPLORER_TREE_EXPANDED_KEY);
  const legacyCollapsed = treeStateValue(preferences, EXPLORER_TREE_COLLAPSED_KEY);
  return normalizedExpandedIds(
    expanded[scoped]
      || expanded[ws]
      || legacyCollapsed[scoped]
      || legacyCollapsed[ws]
      || [],
  );
}

/** Новый expanded-map с заменённым списком раскрытых ids для org/workspace scope. */
export function treeExpandedWithExpandedIds(expandedValue, workspaceId, expandedIds, orgId = "") {
  const scope = treeScopeKey(orgId, workspaceId);
  const legacyScope = String(workspaceId || "").trim();
  const next = { ...(expandedValue && typeof expandedValue === "object" ? expandedValue : {}) };
  if (!scope) return next;
  const ids = normalizedExpandedIds(expandedIds);
  if (legacyScope && legacyScope !== scope) delete next[legacyScope];
  if (ids.length) next[scope] = ids;
  else delete next[scope];
  return next;
}

/** Legacy alias kept for older tests/callers. */
export function treeCollapsedWithExpandedIds(collapsedValue, workspaceId, expandedIds, orgId = "") {
  return treeExpandedWithExpandedIds(collapsedValue, workspaceId, expandedIds, orgId);
}

export function expandedMapFromPreferences(preferences, workspaceId, orgId = "") {
  return Object.fromEntries(expandedIdsFromPreferences(preferences, workspaceId, orgId).map((id) => [id, true]));
}

/** Из merged expanded-map {fid: bool} — список раскрытых ids для сохранения. */
export function expandedIdsFromMap(expandedMap) {
  return Object.keys(expandedMap || {}).filter((fid) => expandedMap[fid] === true);
}

/**
 * Debounced saver с optimistic concurrency.
 * - attach(doc): инициализация version/currentValue из GET-снапшота.
 * - schedule(workspaceId, expandedIds, orgId): debounce PATCH set{explorer.tree.expanded}.
 * - 409 → onSnapshot(снапшот из тела) + повтор с новой version (LWW).
 * - Ошибки сети → молча остаёмся на in-memory (возврат false).
 */
export function createExplorerTreeSaver({ patchFn = patchUserPreferences, debounceMs = TREE_SAVE_DEBOUNCE_MS, onSnapshot } = {}) {
  let version = null; // null — ещё не attach'нут (GET не удался), сохранять нельзя
  let desiredValue = {}; // наше последнее локальное значение (источник LWW)
  let dirty = false;
  let timer = null;
  let inFlight = false;

  function attach(doc) {
    if (!doc) return;
    version = Number(doc.version || 0);
    const stored = doc.preferences?.[EXPLORER_TREE_EXPANDED_KEY]
      || doc.preferences?.[EXPLORER_TREE_COLLAPSED_KEY];
    desiredValue = stored && typeof stored === "object" ? { ...stored } : {};
    dirty = false;
    onSnapshot?.(doc);
  }

  async function flush() {
    if (version === null || inFlight || !dirty) return;
    inFlight = true;
    dirty = false;
    const sendValue = desiredValue;
    const sendVersion = version;
    try {
      const resp = await patchFn({
        baseVersion: sendVersion,
        set: { [EXPLORER_TREE_EXPANDED_KEY]: sendValue },
      });
      if (resp?.ok) {
        version = Number(resp.data?.version ?? sendVersion + 1);
        if (dirty) scheduleFlush(); // за время полёта накопились новые правки
        return;
      }
      if (Number(resp?.status) === 409 && resp?.data) {
        // LWW: версию и UI синхронизируем со снапшотом, но пересылаем НАШЕ
        // последнее значение — последняя запись (эта вкладка) побеждает.
        const snapshot = resp.data;
        version = Number(snapshot.version || 0);
        onSnapshot?.(snapshot);
        dirty = true;
        scheduleFlush();
        return;
      }
      // 401/сеть/5xx — молча остаёмся на in-memory.
    } finally {
      inFlight = false;
    }
  }

  function scheduleFlush() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void flush(); }, debounceMs);
  }

  function schedule(workspaceId, expandedIds, orgId = "") {
    if (version === null) return false;
    desiredValue = treeExpandedWithExpandedIds(desiredValue, workspaceId, expandedIds, orgId);
    dirty = true;
    scheduleFlush();
    return true;
  }

  return {
    attach,
    schedule,
    // для тестов/диагностики
    getVersion: () => version,
    getCurrentValue: () => desiredValue,
  };
}
