import { traceProcess } from "../lib/processDebugTrace.js";

function toText(value) {
  return String(value || "").trim();
}

export function runDurableSnapshotLane({
  sid,
  mutationPayload,
  scheduleDiagramAutosave,
} = {}) {
  const sessionId = toText(sid);
  if (!sessionId) {
    return { ok: false, skipped: true, reason: "missing_session_id" };
  }

  const payload = mutationPayload && typeof mutationPayload === "object"
    ? mutationPayload
    : { kind: toText(mutationPayload) || "diagram.change" };
  const mutationKind = toText(payload?.kind) || "diagram.change";

  traceProcess("diagram.queue_mutation", { sid: sessionId, mutation_kind: mutationKind });
  scheduleDiagramAutosave?.({
    mutation: payload,
    at: Date.now(),
  });

  return {
    ok: true,
    queued: true,
    mutationKind,
  };
}

export default runDurableSnapshotLane;
