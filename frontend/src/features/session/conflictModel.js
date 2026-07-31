/**
 * Единая модель конфликта сохранения (P1 аудита save_pipeline, трек A).
 *
 * Контракт, общий для bpmn-пайплайна (saveCoordinator: xml/rawXml) и
 * hybrid-пайплайна (meta → persistRetryMachine):
 *
 * - HTTP 409 (CAS DIAGRAM_STATE_CONFLICT) — чужая запись уже на сервере.
 *   НИКОГДА не ретраить молча и НИКОГДА не подменять tracked-base серверной
 *   версией автоматически: любой save со свежей базой + stale локальным XML
 *   перезаписывает чужие правки. Требуется явное решение пользователя.
 * - HTTP 423 (lock busy) — временная блокировка записи другим запросом.
 *   Авто-ретрай БЕЗОПАСЕН (черновик не меняется, база не подменяется).
 *
 * Решения пользователя (conflict resolution):
 * - "refresh"   — загрузить серверную версию, локальные несохранённые
 *                 изменения заменяются (tracked-base выставляется из свежего
 *                 чтения сессии, не из конфликта).
 * - "overwrite" — осознанный force: tracked-base := server_version конфликта
 *                 и повторный save локального содержимого. Вызывается ТОЛЬКО
 *                 из обработчика кнопки, никогда автоматически.
 * - "cancel"    — закрыть диалог без действия; очередь сохранений остаётся
 *                 на паузе (saveCoordinator conflict gate).
 *
 * Документация: docs/fix-save/conflict_model.md
 */

export const SAVE_CONFLICT_HTTP_STATUS = 409;
export const SAVE_LOCK_BUSY_HTTP_STATUS = 423;

export const SAVE_FAILURE_KIND = Object.freeze({
  CONFLICT: "CONFLICT",
  LOCK_BUSY: "LOCK_BUSY",
});

export const SAVE_CONFLICT_RESOLUTION = Object.freeze({
  REFRESH: "refresh",
  OVERWRITE: "overwrite",
  CANCEL: "cancel",
});

function toStatus(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Классифицировать HTTP-статус сохранения.
 * @param {unknown} statusRaw
 * @returns {"CONFLICT"|"LOCK_BUSY"|null}
 */
export function classifySaveHttpStatus(statusRaw) {
  const status = toStatus(statusRaw);
  if (status === SAVE_CONFLICT_HTTP_STATUS) return SAVE_FAILURE_KIND.CONFLICT;
  if (status === SAVE_LOCK_BUSY_HTTP_STATUS) return SAVE_FAILURE_KIND.LOCK_BUSY;
  return null;
}

/** 409 = CAS-конфликт, требует решения пользователя (не ретраить). */
export function isSaveConflictStatus(statusRaw) {
  return classifySaveHttpStatus(statusRaw) === SAVE_FAILURE_KIND.CONFLICT;
}

/** 423 = временная блокировка, авто-ретрай безопасен. */
export function isSaveLockBusyStatus(statusRaw) {
  return classifySaveHttpStatus(statusRaw) === SAVE_FAILURE_KIND.LOCK_BUSY;
}
