// opsBatchSerializer — сборка тела POST /operations и coalesce drag-штормов
// (contour feature/async-save-pipeline-step1, UI.md §1).
//
// Coalesce-контракт (PLAN §6, TESTS §1.1): keep-last по (elementId, type) для
// shape.move / shape.resize внутри окна coalesceMs (300–500, дефолт 400),
// окно якорится на первой op burst'а; mouseup (commitDrag) замораживает op —
// следующий drag не сливается с замороженной.

const COALESCIBLE_TYPES = new Set(["shape.move", "shape.resize"]);

export function isCoalescibleOp(op) {
  return COALESCIBLE_TYPES.has(String(op?.type || ""));
}

export function coalesceKeyOf(op) {
  return `${String(op?.type || "")}::${String(op?.elementId || "")}`;
}

/**
 * Попытка слить incoming op в существующую буферную (keep-last).
 * @returns {boolean} true — слив выполнен (буферная op обновлена keep-last).
 */
export function tryCoalesceIntoBuffer(buffer, incoming, { coalesceMs, now }) {
  if (!isCoalescibleOp(incoming)) return false;
  for (let i = buffer.length - 1; i >= 0; i -= 1) {
    const existing = buffer[i];
    if (existing.__committed === true) continue;
    if (!isCoalescibleOp(existing)) continue;
    if (coalesceKeyOf(existing) !== coalesceKeyOf(incoming)) continue;
    if (Number(now) - Number(existing.__ts) > coalesceMs) continue;
    // keep-last: opId и __ts якоря первой команды burst'а сохраняются
    // (окно НЕ скользящее — контракт TESTS §1.1), payload — последний.
    // __coalesceCount — сколько команд слито в op: undo такой op не может
    // восстановить промежуточные delta — зона ответственности outbox
    // (консервативный needsFullSave, UI.md §5 / REVIEW MAJOR-1).
    existing.delta = incoming.delta;
    existing.bounds = incoming.bounds;
    existing.__coalesceCount = (Number(existing.__coalesceCount) || 1) + 1;
    return true;
  }
  return false;
}

/**
 * Сборка тела запроса. Бюджет тела ≤ ~10 kB (TESTS §6); размер считаем в
 * байтах UTF-8 — тот же счётчик используется для keepalive-лимита (~64 kB).
 */
export function buildBatchBody({ baseVersion, operations }) {
  const body = {
    baseVersion: Number.isFinite(Number(baseVersion)) ? Math.round(Number(baseVersion)) : null,
    operations: Array.isArray(operations) ? operations : [],
  };
  const json = JSON.stringify(body);
  const bytes = typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(json).length
    : json.length;
  return { body, json, bytes };
}

export function isWithinKeepaliveBudget(bytes, limitBytes) {
  return Number(bytes) <= Number(limitBytes);
}

/**
 * Подготовка op к отправке: служебные поля буфера (__ts/__committed) не
 * уходят на сервер.
 */
export function toWireOp(op) {
  const wire = {};
  for (const [key, value] of Object.entries(op || {})) {
    if (key.startsWith("__")) continue;
    wire[key] = value;
  }
  return wire;
}
