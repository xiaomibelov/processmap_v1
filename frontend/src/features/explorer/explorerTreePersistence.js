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
export const EXPLORER_TOBE_BANNER_DISMISSED_KEY = "explorer.tobe_banner.dismissed_at";
export const TREE_SAVE_DEBOUNCE_MS = 500;

// F2 (audit H1): единый version-tracker preferences-документа. Раньше версия
// жила в двух несинхронизированных трекерах (treeSaver.version и
// prefsQuery.data.version) — успех одного писателя обновлял только «свой»,
// и каждая следующая запись шла со stale base_version → гарантированный 409.
// Трекер держит самую свежую известную версию: его обновляют ЛЮБОЙ успешный
// PATCH, 409-снапшот и attach GET-снапшота, и он же синхронизирует оба
// трекера обратно (treeSaver через registeredSaver, query cache через bridge).
let latestKnownVersion = null; // null — версия неизвестна (гость / GET не удался)
let queryCacheBridge = null; // (doc) => void — setQueryData(["user-preferences"], doc)
let registeredSaver = null; // createExplorerTreeSaver — синхронизация его version

export function setPreferencesQueryCacheBridge(fn) {
  queryCacheBridge = typeof fn === "function" ? fn : null;
}

export function registerPreferencesVersionSaver(saver) {
  registeredSaver = saver && typeof saver.syncVersion === "function" ? saver : null;
}

/** Снять saver с регистрации (cleanup компонента; чужой saver не трогаем). */
export function unregisterPreferencesVersionSaver(saver) {
  if (!saver || registeredSaver === saver) registeredSaver = null;
}

/** Принять серверный снапшот (успех 200 или тело 409): версия + оба трекера. */
export function adoptPreferencesSnapshot(doc) {
  if (!doc || typeof doc !== "object") return;
  const version = Number(doc.version);
  if (!Number.isFinite(version)) return;
  latestKnownVersion = version;
  registeredSaver?.syncVersion(version);
  queryCacheBridge?.(doc);
}

/** Принять только версию (attach GET-снапшота — документ уже в query cache). */
export function adoptPreferencesVersion(version) {
  const v = Number(version);
  if (!Number.isFinite(v)) return;
  latestKnownVersion = v;
  registeredSaver?.syncVersion(v);
}

/** Самая свежая известная версия документа (null — неизвестна). */
export function getLatestKnownPreferencesVersion() {
  return latestKnownVersion;
}

export function __resetPreferencesVersionTrackerForTests() {
  latestKnownVersion = null;
  queryCacheBridge = null;
  registeredSaver = null;
}

export async function fetchUserPreferences() {
  const resp = await apiRequest("/api/users/me/preferences");
  if (!resp?.ok) return null; // 401/сеть — гость остаётся на in-memory
  return resp?.data || null;
}

export async function patchUserPreferences({ baseVersion, set, unset }) {
  const resp = await apiRequest("/api/users/me/preferences", {
    method: "PATCH",
    body: { base_version: baseVersion, set, unset },
    // F2 (audit H1): auth-retry в apiCore шлёт прежнее тело со stale
    // base_version → гарантированный 409, если версия ушла вперёд за время
    // refresh. Hook opt-in: перед replay подставляем самую свежую известную
    // версию из единого трекера. Дефолт apiCore без hook не меняется.
    onBeforeAuthRetry: () => {
      const latest = getLatestKnownPreferencesVersion();
      if (latest === null) return null;
      return { body: { base_version: latest, set, unset } };
    },
  });
  // Успех и 409-снапшот сразу adopt'ятся в единый трекер (оба трекера в
  // синхроне независимо от того, какой писатель инициировал запрос).
  if (resp?.ok) adoptPreferencesSnapshot(resp.data);
  else if (Number(resp?.status) === 409 && resp?.data) adoptPreferencesSnapshot(resp.data);
  return resp;
}

/**
 * PATCH с единой LWW-обработкой 409 (статус-фильтры, TO BE-баннер).
 * base_version — из единого трекера (самый свежий снапшот); при 409 снапшот
 * adopt'ится в оба трекера и попытка повторяется. Не-CAS ошибки (сеть/5xx)
 * не ретраятся — возвращается {ok:false, ...} для inline-состояния в UI.
 */
export async function patchUserPreferencesWithLww({
  baseVersion,
  set,
  unset,
  maxAttempts = 3,
  patchFn = patchUserPreferences,
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const tracked = getLatestKnownPreferencesVersion();
    const resp = await patchFn({
      baseVersion: Number.isFinite(tracked) ? tracked : Number(baseVersion || 0),
      set,
      unset,
    });
    if (resp?.ok) {
      adoptPreferencesSnapshot(resp.data);
      return { ok: true, data: resp.data, attempts: attempt };
    }
    if (Number(resp?.status) === 409 && resp?.data) {
      adoptPreferencesSnapshot(resp.data);
      continue;
    }
    return {
      ok: false,
      status: Number(resp?.status || 0),
      error: resp?.error || "request_failed",
      attempts: attempt,
    };
  }
  return { ok: false, status: 409, error: "preferences_conflict", attempts: maxAttempts };
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
    adoptPreferencesVersion(version);
    const stored = doc.preferences?.[EXPLORER_TREE_EXPANDED_KEY]
      || doc.preferences?.[EXPLORER_TREE_COLLAPSED_KEY];
    // F2: не затираем ожидающие flush локальные правки. Собственный успешный
    // flush adopt'ится в query cache → attach с отстающим серверным снапшотом;
    // сброс dirty/desiredValue здесь терял бы последние toggle'ы. Версию
    // синхронизируем всегда; desiredValue оставляем нашим (LWW: наша запись
    // перезапишет ключ целиком при следующем flush).
    if (!dirty) {
      desiredValue = stored && typeof stored === "object" ? { ...stored } : {};
    }
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
        // F2: успех treeSaver тоже обновляет query cache и трекер (иначе
        // другие писатели продолжали ходить со stale версией → системные 409).
        adoptPreferencesSnapshot(resp.data);
        if (dirty) scheduleFlush(); // за время полёта накопились новые правки
        return;
      }
      if (Number(resp?.status) === 409 && resp?.data) {
        // LWW: версию и UI синхронизируем со снапшотом, но пересылаем НАШЕ
        // последнее значение — последняя запись (эта вкладка) побеждает.
        const snapshot = resp.data;
        version = Number(snapshot.version || 0);
        adoptPreferencesSnapshot(snapshot);
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
    // F2: единый трекер синхронизирует версию saver'а после чужих успехов/409
    syncVersion: (v) => {
      const n = Number(v);
      if (Number.isFinite(n)) version = n;
    },
  };
}
