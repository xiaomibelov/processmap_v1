// T3: чистая derivation подложки из session-record — подложка возможна только
// для to_be-сессии с непустым derived_from_session_id (API.md, UI.md).
// Списочная проекция SessionItem содержит process_layer, но НЕ содержит
// derived_from_session_id — поэтому источник здесь session-record
// (apiGetSession), а не список сессий.
export function deriveUnderlayAsisSid(sessionMeta) {
  if (!sessionMeta || typeof sessionMeta !== "object") return null;
  if (String(sessionMeta.process_layer || "") !== "to_be") return null;
  const link = String(sessionMeta.derived_from_session_id || "").trim();
  return link || null;
}
