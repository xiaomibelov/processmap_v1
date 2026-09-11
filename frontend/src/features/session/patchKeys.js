/**
 * Classification of session-PATCH payloads: diagram-truth keys vs metadata.
 *
 * Backend bumps diagram_state_version on writes with keys
 * bpmn_meta / interview / nodes / edges / questions; metadata keys
 * (title, notes, roles, status, assignees, notes_by_element) and the
 * presence heartbeat ({ client_id, surface }) do NOT touch the diagram CAS
 * base. Any write with diagram keys MUST go through the saveCoordinator
 * queue (enqueueSessionPatchCasWrite) so the CAS base is tracker-first at
 * send time and the ack re-syncs the tracker; metadata writes may stay direct.
 *
 * Контракт зафиксирован тестами features/session/saveVersion.test.mjs (13a-d).
 */

/**
 * Diagram-truth keys of PATCH /api/sessions/{id}.
 * @type {Set<string>}
 */
export const DIAGRAM_PATCH_KEYS = new Set([
  "bpmn_meta",
  "bpmnMeta",
  "bpmn_xml",
  "bpmnXml",
  "interview",
  "nodes",
  "edges",
  "questions",
]);

/**
 * Metadata keys: never gate, never dirty the diagram.
 * @type {Set<string>}
 */
export const METADATA_PATCH_KEYS = new Set([
  "title",
  "notes",
  "notes_by_element",
  "roles",
  "start_role",
  "status",
  "assignees",
]);

/**
 * Presence heartbeat body keys (POST /api/sessions/{id}/presence).
 * @type {Set<string>}
 */
export const PRESENCE_PATCH_KEYS = new Set([
  "client_id",
  "clientId",
  "surface",
]);

/**
 * @param {unknown} patch
 * @returns {boolean} true when the payload contains diagram-truth keys.
 */
export function hasDiagramPatchKeys(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;
  return Object.keys(patch).some((key) => DIAGRAM_PATCH_KEYS.has(key));
}

/**
 * @param {unknown} patch
 * @returns {boolean} true when the payload is a presence heartbeat body.
 */
export function isPresenceHeartbeatPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;
  const keys = Object.keys(patch);
  return keys.length > 0 && keys.every((key) => PRESENCE_PATCH_KEYS.has(key));
}

/**
 * @param {unknown} patch
 * @returns {{ isDiagramPatch: boolean, isPresencePatch: boolean, marksDiagramDirty: boolean }}
 */
export function classifySessionPatch(patch) {
  const isDiagramPatch = hasDiagramPatchKeys(patch);
  return {
    isDiagramPatch,
    isPresencePatch: isPresenceHeartbeatPatch(patch),
    // Any diagram-truth write bumps the server version and leaves the local
    // diagram state out of sync until saved — it must set the diagram dirty flag.
    marksDiagramDirty: isDiagramPatch,
  };
}
