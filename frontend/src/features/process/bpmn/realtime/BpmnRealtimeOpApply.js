import { roundRealtimeCoord } from "./BpmnRealtimeOpCapture.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

export function normalizeRealtimeIncomingOp(raw) {
  const row = asObject(raw);
  const payload = asObject(row.payload);
  return {
    kind: toText(row.kind || row.type).toLowerCase(),
    payload,
    client_ts: Number(row.client_ts || row.clientTs || Date.now()) || Date.now(),
  };
}

export async function applyBpmnRealtimeOpBatch({
  sessionId,
  payload = {},
  modeler,
  ensureModeler,
  isShapeElement,
  isConnectionElement,
  withSuppressedCommandStack,
  suppressRealtimeOpsEmitRef,
  refreshRealtimeElementsSnapshot,
} = {}) {
  const sid = toText(sessionId);
  if (!sid) return { ok: false, error: "missing_session_id", applied: 0, failed: 0 };
  const inst = modeler || await ensureModeler?.();
  if (!inst) return { ok: false, error: "modeler_not_ready", applied: 0, failed: 0 };

  const registry = inst.get("elementRegistry");
  const modeling = inst.get("modeling");
  if (!registry || !modeling) return { ok: false, error: "modeling_api_unavailable", applied: 0, failed: 0 };

  const ops = asArray(payload?.ops).map(normalizeRealtimeIncomingOp).filter((row) => row.kind);
  if (!ops.length) return { ok: true, applied: 0, failed: 0, skipped: true, changedIds: [], modeler: inst };

  suppressRealtimeOpsEmitRef.current += 1;
  let applied = 0;
  let failed = 0;
  const changedIds = [];

  try {
    await withSuppressedCommandStack(async () => {
      for (let i = 0; i < ops.length; i += 1) {
        const op = ops[i];
        const kind = String(op.kind || "");
        const opPayload = asObject(op.payload);
        const elementId = toText(opPayload.element_id || opPayload.elementId || opPayload.id);
        if (!elementId) {
          failed += 1;
          continue;
        }
        const element = registry.get(elementId);
        if (!element) {
          failed += 1;
          continue;
        }
        try {
          if (kind === "element_geometry_set") {
            if (!isShapeElement?.(element) || typeof modeling.resizeShape !== "function") {
              failed += 1;
              continue;
            }
            const width = roundRealtimeCoord(opPayload.width || element.width);
            const height = roundRealtimeCoord(opPayload.height || element.height);
            modeling.resizeShape(element, {
              x: roundRealtimeCoord(opPayload.x),
              y: roundRealtimeCoord(opPayload.y),
              width: width > 1 ? width : roundRealtimeCoord(element.width),
              height: height > 1 ? height : roundRealtimeCoord(element.height),
            });
            applied += 1;
            changedIds.push(elementId);
          } else if (kind === "connection_waypoints_set") {
            if (!isConnectionElement?.(element) || typeof modeling.updateWaypoints !== "function") {
              failed += 1;
              continue;
            }
            const waypoints = asArray(opPayload.waypoints)
              .map((point) => ({
                x: roundRealtimeCoord(point?.x),
                y: roundRealtimeCoord(point?.y),
              }))
              .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
            if (waypoints.length < 2) {
              failed += 1;
              continue;
            }
            modeling.updateWaypoints(element, waypoints);
            applied += 1;
            changedIds.push(elementId);
          } else if (kind === "element_label_set") {
            if (typeof modeling.updateLabel !== "function") {
              failed += 1;
              continue;
            }
            modeling.updateLabel(element, String(opPayload.label || ""));
            applied += 1;
            changedIds.push(elementId);
          } else {
            failed += 1;
          }
        } catch {
          failed += 1;
        }
      }
    });
  } finally {
    suppressRealtimeOpsEmitRef.current = Math.max(0, Number(suppressRealtimeOpsEmitRef.current || 0) - 1);
  }

  refreshRealtimeElementsSnapshot?.(inst);

  return {
    ok: true,
    applied,
    failed,
    changedIds,
    skipped: applied <= 0,
    modeler: inst,
  };
}
