/**
 * P-1 «Мёртвые сессии»: единый реестр терминального 404/410 по сессиям.
 *
 * Терминальный 404/410 (сессия удалена / не существует) — НЕ сетевая ошибка:
 * - любой подсистемный вызов (presence heartbeat, GET meta, note-aggregate,
 *   remote-poll, save, первичная загрузка) помечает сессию мёртвой через
 *   noteSessionApiResult();
 * - поллеры обязаны проверять isSessionNotFound() на каждом тике и
 *   прекращать опрос (никаких суточных 404-каскадов, frequency_map.md P-1);
 * - на сетевых сбоях (status=0) и 5xx сессия НЕ помечается — поллинг
 *   продолжается по существующим backoff-правилам.
 *
 * UI (ProcessStage) подписывается через subscribeSessionNotFound() и
 * показывает экран мёртвой сессии (deadSessionModel.js) вместо
 * конфликт-модала FIX-SAVE (409 — отдельный, живой контракт).
 */

export const SESSION_NOT_FOUND_HTTP_STATUS = 404;
export const SESSION_GONE_HTTP_STATUS = 410;

const deadSessions = new Map();
const listeners = new Set();

function toText(value) {
  return String(value || "").trim();
}

/**
 * 404 саб-ресурса (node/edge/version/snapshot) НЕ означает смерть сессии.
 * okOrError инференсит 404 из текста ошибки, поэтому отсекаем по маркерам.
 */
function isSubresourceNotFound(errorTextRaw) {
  const text = toText(errorTextRaw).toLowerCase();
  if (!text) return false;
  return (
    text.includes("node not found")
    || text.includes("edge not found")
    || text.includes("version not found")
    || text.includes("snapshot not found")
    || text.includes("thread not found")
    || text.includes("comment not found")
  );
}

/**
 * Классифицировать результат API-вызова как терминальный 404 сессии.
 * @param {unknown} result — ответ lib/api ({ ok, status, error, ... })
 * @returns {boolean}
 */
export function isSessionNotFoundResult(result) {
  if (!result || typeof result !== "object") return false;
  if (result.ok !== false) return false;
  const status = Number(result.status);
  if (status !== SESSION_NOT_FOUND_HTTP_STATUS && status !== SESSION_GONE_HTTP_STATUS) return false;
  if (isSubresourceNotFound(result.error)) return false;
  return true;
}

/**
 * Пометить сессию мёртвой. Идемпотентно: повторная пометка возвращает
 * первую запись (первый источник 404 сохраняется для диагностики).
 */
export function markSessionNotFound(sessionId, details = {}) {
  const sid = toText(sessionId);
  if (!sid) return null;
  const existing = deadSessions.get(sid);
  if (existing) return existing;
  const info = {
    sessionId: sid,
    source: toText(details.source) || "unknown",
    error: toText(details.error),
    at: Date.now(),
  };
  deadSessions.set(sid, info);
  for (const listener of Array.from(listeners)) {
    try {
      listener(sid, info);
    } catch {
      // Ошибка подписчика не должна ломать вызывающую подсистему.
    }
  }
  return info;
}

export function isSessionNotFound(sessionId) {
  const sid = toText(sessionId);
  return !!sid && deadSessions.has(sid);
}

export function getSessionNotFoundInfo(sessionId) {
  const sid = toText(sessionId);
  return sid ? deadSessions.get(sid) || null : null;
}

/**
 * Снять пометку (тесты; в продакшене удаление терминально — id не
 * переиспользуется). Без аргумента очищает весь реестр.
 */
export function clearSessionNotFound(sessionId = "") {
  const sid = toText(sessionId);
  if (!sid) {
    deadSessions.clear();
    return true;
  }
  return deadSessions.delete(sid);
}

/**
 * Подписаться на пометки. listener(sessionId, info).
 * @returns {() => void} unsubscribe
 */
export function subscribeSessionNotFound(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Единая точка для подсистем: если результат — терминальный 404,
 * пометить сессию мёртвой и вернуть info; иначе null.
 */
export function noteSessionApiResult(sessionId, result, source = "") {
  if (!isSessionNotFoundResult(result)) return null;
  return markSessionNotFound(sessionId, {
    source,
    error: result?.error,
  });
}
