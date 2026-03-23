function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

export function roundRealtimeCoord(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function readRealtimeElementLabel(element) {
  return toText(element?.businessObject?.name || "");
}

function sameWaypoints(aRaw, bRaw) {
  const a = asArray(aRaw);
  const b = asArray(bRaw);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const ax = roundRealtimeCoord(a[i]?.x);
    const ay = roundRealtimeCoord(a[i]?.y);
    const bx = roundRealtimeCoord(b[i]?.x);
    const by = roundRealtimeCoord(b[i]?.y);
    if (ax !== bx || ay !== by) return false;
  }
  return true;
}

export function captureRealtimeElementsSnapshot(inst, {
  isConnectionElement,
  isShapeElement,
} = {}) {
  const out = new Map();
  if (!inst) return out;
  let registry = null;
  try {
    registry = inst.get("elementRegistry");
  } catch {
    registry = null;
  }
  const all = asArray(registry?.getAll?.());
  all.forEach((element) => {
    const id = toText(element?.id);
    if (!id) return;
    if (String(element?.type || "").toLowerCase() === "label") return;
    if (typeof isConnectionElement === "function" && isConnectionElement(element)) {
      const waypoints = asArray(element?.waypoints).map((point) => ({
        x: roundRealtimeCoord(point?.x),
        y: roundRealtimeCoord(point?.y),
      }));
      out.set(id, {
        kind: "connection",
        label: readRealtimeElementLabel(element),
        waypoints,
      });
      return;
    }
    if (typeof isShapeElement === "function" && !isShapeElement(element)) return;
    out.set(id, {
      kind: "shape",
      label: readRealtimeElementLabel(element),
      x: roundRealtimeCoord(element?.x),
      y: roundRealtimeCoord(element?.y),
      width: roundRealtimeCoord(element?.width),
      height: roundRealtimeCoord(element?.height),
    });
  });
  return out;
}

export function buildRealtimeOpsFromDiff(prevMapRaw, nextMapRaw, {
  now = () => Date.now(),
} = {}) {
  const prevMap = prevMapRaw instanceof Map ? prevMapRaw : new Map();
  const nextMap = nextMapRaw instanceof Map ? nextMapRaw : new Map();
  const ops = [];
  nextMap.forEach((nextEntryRaw, elementId) => {
    const nextEntry = asObject(nextEntryRaw);
    const prevEntry = asObject(prevMap.get(elementId));
    const kind = String(nextEntry.kind || "");
    if (!kind || !prevEntry.kind || prevEntry.kind !== kind) return;
    if (kind === "shape") {
      const geometryChanged =
        roundRealtimeCoord(nextEntry.x) !== roundRealtimeCoord(prevEntry.x)
        || roundRealtimeCoord(nextEntry.y) !== roundRealtimeCoord(prevEntry.y)
        || roundRealtimeCoord(nextEntry.width) !== roundRealtimeCoord(prevEntry.width)
        || roundRealtimeCoord(nextEntry.height) !== roundRealtimeCoord(prevEntry.height);
      if (geometryChanged) {
        ops.push({
          kind: "element_geometry_set",
          payload: {
            element_id: elementId,
            x: roundRealtimeCoord(nextEntry.x),
            y: roundRealtimeCoord(nextEntry.y),
            width: roundRealtimeCoord(nextEntry.width),
            height: roundRealtimeCoord(nextEntry.height),
          },
          client_ts: now(),
        });
      }
      const nextLabel = String(nextEntry.label || "");
      const prevLabel = String(prevEntry.label || "");
      if (nextLabel !== prevLabel) {
        ops.push({
          kind: "element_label_set",
          payload: {
            element_id: elementId,
            label: nextLabel,
          },
          client_ts: now(),
        });
      }
    } else if (kind === "connection") {
      if (!sameWaypoints(nextEntry.waypoints, prevEntry.waypoints)) {
        ops.push({
          kind: "connection_waypoints_set",
          payload: {
            element_id: elementId,
            waypoints: asArray(nextEntry.waypoints).map((point) => ({
              x: roundRealtimeCoord(point?.x),
              y: roundRealtimeCoord(point?.y),
            })),
          },
          client_ts: now(),
        });
      }
      const nextLabel = String(nextEntry.label || "");
      const prevLabel = String(prevEntry.label || "");
      if (nextLabel !== prevLabel) {
        ops.push({
          kind: "element_label_set",
          payload: {
            element_id: elementId,
            label: nextLabel,
          },
          client_ts: now(),
        });
      }
    }
  });
  return ops.slice(0, 80);
}

export function emitRealtimeOpsFromModeler({
  inst,
  source = "command_stack",
  suppressRealtimeOpsEmitRef,
  realtimeElementSnapshotRef,
  isConnectionElement,
  isShapeElement,
  emitDiagramMutation,
} = {}) {
  if (!inst) return { ok: false, skipped: true, reason: "modeler_unavailable" };
  if (Number(suppressRealtimeOpsEmitRef?.current || 0) > 0) {
    realtimeElementSnapshotRef.current = captureRealtimeElementsSnapshot(inst, { isConnectionElement, isShapeElement });
    return { ok: true, skipped: true, reason: "emit_suppressed" };
  }
  const nextSnapshot = captureRealtimeElementsSnapshot(inst, { isConnectionElement, isShapeElement });
  const prevSnapshot = realtimeElementSnapshotRef?.current instanceof Map
    ? realtimeElementSnapshotRef.current
    : new Map();
  if (!prevSnapshot.size) {
    realtimeElementSnapshotRef.current = nextSnapshot;
    return { ok: true, skipped: true, reason: "seed_snapshot" };
  }
  const ops = buildRealtimeOpsFromDiff(prevSnapshot, nextSnapshot);
  realtimeElementSnapshotRef.current = nextSnapshot;
  if (!ops.length) {
    return { ok: true, skipped: true, reason: "no_diff" };
  }
  if (typeof emitDiagramMutation === "function") {
    emitDiagramMutation("diagram.realtime_ops", {
      source: String(source || "command_stack"),
      ops,
      op_count: ops.length,
    });
  }
  return {
    ok: true,
    emitted: true,
    opCount: ops.length,
    ops,
  };
}
