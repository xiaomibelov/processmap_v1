import {
  isPrimaryTruthSource,
  isProjectionSource,
} from "./sessionWorkspaceTruthOwner.js";

function toText(value) {
  return String(value || "").trim();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toIsoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

export function buildWorkspaceTruthSnapshotFromSession(sessionLikeRaw, {
  fallbackSessionId = "",
  source = "session_sync",
} = {}) {
  const sessionLike = sessionLikeRaw && typeof sessionLikeRaw === "object" ? sessionLikeRaw : {};
  const sessionId = toText(
    sessionLike.sessionId
    || sessionLike.session_id
    || sessionLike.id
    || fallbackSessionId,
  );
  return {
    sessionId,
    bpmn_xml: String(sessionLike.bpmn_xml ?? sessionLike.xml ?? ""),
    bpmn_xml_version: Math.max(
      0,
      Math.round(
        toNumber(
          sessionLike.bpmn_xml_version
          ?? sessionLike.xmlVersion
          ?? sessionLike.version
          ?? sessionLike.storedRev
          ?? sessionLike.stored_rev,
          0,
        ),
      ),
    ),
    diagram_state_version: Math.max(
      0,
      Math.round(
        toNumber(
          sessionLike.diagram_state_version
          ?? sessionLike.diagramStateVersion,
          0,
        ),
      ),
    ),
    bpmn_graph_fingerprint: toText(
      sessionLike.bpmn_graph_fingerprint
      || sessionLike.graph_fingerprint
      || sessionLike.graphFingerprint,
    ),
    source: toText(source || sessionLike._sync_source || sessionLike._source || "session_sync"),
    capturedAt: toText(sessionLike.updated_at || sessionLike.updatedAt || toIsoNow()),
  };
}

export function classifyWorkspaceSyncSource(sourceRaw) {
  const source = toText(sourceRaw).toLowerCase();
  const projectionSource = isProjectionSource(source);
  const isPrimaryAcceptedSource = (
    !projectionSource && (
    source === "manual_save"
    || source === "autosave"
    || source.startsWith("manual_save")
    || source.startsWith("publish_manual_save")
    || source.startsWith("tab_switch")
    || source.startsWith("import_xml")
    )
  );
  const isDurableReloadSource = (
    source === "durable_reload"
    || source === "session_reload"
    || source === "save_conflict_refresh"
    || source === "get_session"
    || source.startsWith("reload")
  );
  return {
    source,
    isPrimaryAcceptedSource,
    isDurableReloadSource,
    isPrimaryTruthSource: isPrimaryTruthSource(source),
    isProjectionSource: projectionSource,
  };
}

export function resolveWorkspaceMutationCommand(mutationKindRaw) {
  const kind = toText(mutationKindRaw).toLowerCase();
  if (!kind) return "applyDiagramEdit";
  if (kind.includes("property")) return "applyPropertyChange";
  if (kind.includes("template")) return "applyTemplate";
  if (kind.includes("copy") || kind.includes("paste")) return "applyCopyPaste";
  return "applyDiagramEdit";
}
