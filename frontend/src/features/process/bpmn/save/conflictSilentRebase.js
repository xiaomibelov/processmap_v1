// Silent self-rebase (fix/self-conflict-silent-rebase): overlap-детектор
// keyspace для 409-conflict слоя.
//
// Инвариант: silent rebase ТОЛЬКО при полной определённости — серверные
// changed_keys присутствуют, НЕПУСТЫ, все ключи известной таксономии и НЕ
// пересекаются с локальными dirty-ключами записи. Любое сомнение → "unknown"
// → честный модал, НЕ retry. Сомнение всегда в сторону модала.
//
// Контракт для C3 (mutation gateway): модуль чистый (без coordinator/modeler),
// ключи таксономии зеркалят backend `_DIAGRAM_TRUTH_PATCH_KEYS`
// (backend/app/_legacy_main.py) и фактические changed_keys всех writer-путей
// `_mark_diagram_truth_write`.

export const DIAGRAM_TRUTH_KEYS = ["bpmn_xml", "bpmn_meta", "interview", "nodes", "edges", "questions"];

const DIAGRAM_TRUTH_KEY_SET = new Set(DIAGRAM_TRUTH_KEYS);

// Что реально перезаписывает PUT /api/sessions/{id}/bpmn (все call sites
// `_mark_diagram_truth_write` этого пути пишут changed_keys
// ["bpmn_xml", "bpmn_meta"]).
export const RAW_XML_WRITE_KEYS = ["bpmn_xml", "bpmn_meta"];

function asNonEmptyStringArray(value) {
  if (!Array.isArray(value)) return null;
  const items = value.map((item) => String(item || "").trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

/**
 * Ключи diagram-truth, реально затронутые session-PATCH (зеркало
 * `_DIAGRAM_TRUTH_PATCH_KEYS` на backend). Не-truth ключи (title, roles, …)
 * версию диаграммы не бампают и не участвуют в overlap.
 */
export function diagramTruthKeysFromPatch(patchBody = null) {
  const body = patchBody && typeof patchBody === "object" ? patchBody : {};
  const keys = Object.keys(body).filter((key) => DIAGRAM_TRUTH_KEY_SET.has(key));
  return keys.sort();
}

/**
 * Извлекает нормализованный conflict-detail из 409-ответа (wire-форматы
 * detail.server_current_version / server_last_write + camelCase-алиасы).
 * server_current_version обязателен — без него rebase небезопасен (null).
 */
export function extractConflictDetail(response = null) {
  const raw = response && typeof response === "object" ? response : {};
  const data = raw.data && typeof raw.data === "object" ? raw.data : {};
  const detail = (data.detail && typeof data.detail === "object" ? data.detail : data) || {};
  const serverVersionRaw = detail.server_current_version ?? detail.serverCurrentVersion
    ?? raw.server_current_version ?? raw.serverCurrentVersion;
  const serverVersion = Number(serverVersionRaw);
  if (!Number.isFinite(serverVersion) || serverVersion < 0) return null;
  const lastWrite = detail.server_last_write || detail.serverLastWrite || raw.server_last_write || {};
  const write = lastWrite && typeof lastWrite === "object" ? lastWrite : {};
  const changedKeys = Array.isArray(write.changed_keys)
    ? write.changed_keys
    : (Array.isArray(write.changedKeys) ? write.changedKeys : null);
  return {
    serverVersion: Math.round(serverVersion),
    changedKeys: changedKeys || [],
    clientId: String(write.client_id || write.clientId || "").trim(),
    actorUserId: String(write.actor_user_id || write.actorUserId || "").trim(),
    actorLabel: String(write.actor_label || write.actorLabel || write.actor_user_id || "").trim(),
    at: Number(write.at) || 0,
  };
}

/**
 * Классифицирует безопасность silent rebase.
 * @returns {"disjoint"|"overlap"|"unknown"} — "disjoint" только при полной
 * определённости; всё прочее → честный модал.
 */
export function classifyRebaseSafety({ serverChangedKeys = null, localDirtyKeys = null } = {}) {
  const server = asNonEmptyStringArray(serverChangedKeys);
  const local = asNonEmptyStringArray(localDirtyKeys);
  if (!server || !local) return "unknown";
  for (const key of server) {
    if (!DIAGRAM_TRUTH_KEY_SET.has(key)) return "unknown";
  }
  for (const key of local) {
    if (!DIAGRAM_TRUTH_KEY_SET.has(key)) return "unknown";
  }
  const localSet = new Set(local);
  for (const key of server) {
    if (localSet.has(key)) return "overlap";
  }
  return "disjoint";
}
