import { asArray, asObject } from "../lib/processStageDomain.js";

function toText(value) {
  return String(value || "").trim();
}

export function runRealtimeOpsLane({
  sid,
  mutationPayload,
  onPublishRealtimeBpmnOps,
} = {}) {
  const sessionId = toText(sid);
  if (!sessionId) {
    return { ok: false, skipped: true, reason: "missing_session_id" };
  }
  if (typeof onPublishRealtimeBpmnOps !== "function") {
    return { ok: true, skipped: true, reason: "publisher_unavailable" };
  }

  const payload = mutationPayload && typeof mutationPayload === "object"
    ? mutationPayload
    : { kind: toText(mutationPayload) || "diagram.change" };
  const mutationKind = toText(payload?.kind).toLowerCase();
  if (mutationKind !== "diagram.realtime_ops") {
    return { ok: true, skipped: true, reason: "not_realtime_ops" };
  }

  const ops = asArray(payload?.ops)
    .map((row) => asObject(row))
    .filter((row) => toText(row.kind || row.type));

  if (!ops.length) {
    return { ok: true, skipped: true, reason: "empty_ops" };
  }

  void onPublishRealtimeBpmnOps({
    sessionId,
    source: toText(payload?.source) || "diagram",
    mutationKind,
    ops,
  });

  return {
    ok: true,
    published: true,
    mutationKind,
    opCount: ops.length,
  };
}

export default runRealtimeOpsLane;
