/**
 * P1 [А]: персистентность свернутости дерева explorer через Preferences API.
 *
 * Контракт (PHASE2_USER_PREFERENCES_CONTRACT.md): ключ `explorer.tree.collapsed`,
 * значение Record<workspaceId, string[]>. УТОЧНЕНИЕ семантики: дефолт дерева в UI —
 * «всё свёрнуто», поэтому массив хранит ID ЯВНО РАСКРЫТЫХ пользователем узлов
 * (collapsed-ids при дефолте «свёрнуто» были бы избыточны).
 *
 * Модуль чистый (без React): маппинг + saver с debounce, base_version и
 * 409 → last-write-wins. Сеть/401 — graceful degradation (in-memory).
 */

import { apiRequest } from "../../lib/api.js";

export const USER_PREFERENCES_QUERY_KEY = ["user-preferences"];
export const EXPLORER_TREE_COLLAPSED_KEY = "explorer.tree.collapsed";
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

/** Явно раскрытые узлы workspace из preferences-документа. */
export function expandedIdsFromPreferences(preferences, workspaceId) {
  const ws = String(workspaceId || "").trim();
  if (!ws) return [];
  const collapsed = preferences?.[EXPLORER_TREE_COLLAPSED_KEY];
  const ids = collapsed?.[ws];
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

/** Новый collapsed-map с заменённым списком раскрытых ids для workspace. */
export function treeCollapsedWithExpandedIds(collapsedValue, workspaceId, expandedIds) {
  const ws = String(workspaceId || "").trim();
  const next = { ...(collapsedValue && typeof collapsedValue === "object" ? collapsedValue : {}) };
  const ids = [...new Set((expandedIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (ids.length) next[ws] = ids;
  else delete next[ws];
  return next;
}

/** Из merged expanded-map {fid: bool} — список раскрытых ids для сохранения. */
export function expandedIdsFromMap(expandedMap) {
  return Object.keys(expandedMap || {}).filter((fid) => expandedMap[fid] === true);
}

/**
 * Debounced saver с optimistic concurrency.
 * - attach(doc): инициализация version/currentValue из GET-снапшота.
 * - schedule(workspaceId, expandedIds): debounce PATCH set{explorer.tree.collapsed}.
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
    const stored = doc.preferences?.[EXPLORER_TREE_COLLAPSED_KEY];
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
        set: { [EXPLORER_TREE_COLLAPSED_KEY]: sendValue },
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

  function schedule(workspaceId, expandedIds) {
    if (version === null) return false;
    desiredValue = treeCollapsedWithExpandedIds(desiredValue, workspaceId, expandedIds);
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
