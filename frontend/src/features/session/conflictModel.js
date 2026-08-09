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

/**
 * FIX-BPMN-IMPORT-SAVE: код guard'а бэкенда (_legacy_main.py:899-920) —
 * запись nodes/edges отклонена, т.к. сессия XML-truth (истина в bpmn_xml).
 * Это НЕ CAS-конфликт: запись отклонена ДО проверки/инкремента версии,
 * tracked-base остаётся валидной, conflict gate взводить нельзя.
 */
export const SAVE_XML_TRUTH_GUARD_CODE = "DRAFT_GRAPH_READ_ONLY_XML_TRUTH";

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

/**
 * Извлечь машинный код ошибки сохранения из ответа API
 * (FastAPI HTTPException(detail={code:...}) → body {"detail":{"code":...}}).
 * @param {unknown} responseRaw
 * @returns {string} SCREAMING_SNAKE код или ""
 */
export function extractSaveErrorCode(responseRaw) {
  const response = responseRaw && typeof responseRaw === "object" ? responseRaw : {};
  const data = response.data && typeof response.data === "object" ? response.data : {};
  const dataDetail = data.detail && typeof data.detail === "object" ? data.detail : {};
  const errorDetails = response.errorDetails && typeof response.errorDetails === "object" ? response.errorDetails : {};
  const errorDetailsDetail = errorDetails.detail && typeof errorDetails.detail === "object" ? errorDetails.detail : {};
  const details = response.details && typeof response.details === "object" ? response.details : {};
  const detailsDetail = details.detail && typeof details.detail === "object" ? details.detail : {};
  const candidates = [
    response.code,
    data.code,
    dataDetail.code,
    errorDetails.code,
    errorDetailsDetail.code,
    details.code,
    detailsDetail.code,
  ];
  for (const raw of candidates) {
    const code = String(raw || "").trim();
    if (code) return code.toUpperCase();
  }
  return "";
}

/**
 * 409 DRAFT_GRAPH_READ_ONLY_XML_TRUTH — отказ guard'а по ТИПУ сессии,
 * а не по версии. Такой ответ НЕЛЬЗЯ трактовать как CAS-конфликт:
 * conflict gate + rollback tracked-base ломают все последующие сохранения
 * (включая легитимные PUT /bpmn) после, например, импорта BPMN.
 * @param {unknown} responseRaw
 * @returns {boolean}
 */
export function isSaveXmlTruthGuardResponse(responseRaw) {
  const response = responseRaw && typeof responseRaw === "object" ? responseRaw : {};
  if (!isSaveConflictStatus(response.status)) return false;
  return extractSaveErrorCode(response) === SAVE_XML_TRUTH_GUARD_CODE;
}
