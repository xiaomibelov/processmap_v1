function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function isConnectionElement(el) {
  return !!el && Array.isArray(el?.waypoints);
}

function isContainerElement(el) {
  if (!el) return false;
  const rawType = String(el?.businessObject?.$type || el?.type || "").trim().toLowerCase();
  if (!rawType) return false;
  const simpleType = String(rawType.split(":").pop() || rawType).trim();
  return (
    simpleType === "lane"
    || simpleType === "participant"
    || simpleType === "process"
    || simpleType === "collaboration"
    || simpleType === "laneset"
  );
}

function isSelectableElement(el) {
  if (!el) return false;
  if (String(el?.type || "").trim().toLowerCase() === "label") return false;
  if (isContainerElement(el)) return false;
  return true;
}

export function clearSelectionFocusDecor(inst, kind, focusMarkerStateRef) {
  if (!inst) return;
  try {
    const canvas = inst.get("canvas");
    asArray(focusMarkerStateRef.current[kind]).forEach((entry) => {
      const elementId = String(entry?.elementId || "").trim();
      const className = String(entry?.className || "").trim();
      if (!elementId || !className) return;
      canvas.removeMarker(elementId, className);
    });
  } catch {
    // intentionally ignore
  }
  focusMarkerStateRef.current[kind] = [];
}

export function markFocusDecor(canvas, kind, elementId, className) {
  const eid = String(elementId || "").trim();
  const cls = String(className || "").trim();
  if (!eid || !cls) return;
  try {
    canvas.addMarker(eid, cls);
  } catch {
    // intentionally ignore
  }
}

export function applySelectionFocusDecor(inst, kind, selectedEl, focusMarkerStateRef) {
  if (!inst || !selectedEl) return;
  clearSelectionFocusDecor(inst, kind, focusMarkerStateRef);
  try {
    const canvas = inst.get("canvas");
    const registry = inst.get("elementRegistry");
    const selectedId = String(selectedEl?.id || "").trim();
    if (!selectedId) return;

    const focusNodes = new Set();
    const primaryEdges = new Set();
    const allSelectableIds = new Set();
    const all = asArray(registry?.getAll?.());
    all.forEach((item) => {
      if (!isSelectableElement(item)) return;
      const id = String(item?.id || "").trim();
      if (!id) return;
      allSelectableIds.add(id);
    });

    const enqueueNeighborEdge = (connRaw) => {
      const conn = connRaw && isConnectionElement(connRaw) ? connRaw : null;
      if (!conn) return;
      const connId = String(conn.id || "").trim();
      if (connId) primaryEdges.add(connId);
      const srcId = String(conn?.source?.id || "").trim();
      const tgtId = String(conn?.target?.id || "").trim();
      if (srcId && srcId !== selectedId) focusNodes.add(srcId);
      if (tgtId && tgtId !== selectedId) focusNodes.add(tgtId);
    };

    if (isConnectionElement(selectedEl)) {
      const sourceId = String(selectedEl?.source?.id || "").trim();
      const targetId = String(selectedEl?.target?.id || "").trim();
      if (sourceId) focusNodes.add(sourceId);
      if (targetId) focusNodes.add(targetId);
      const selectedConnId = String(selectedEl.id || "").trim();
      if (selectedConnId) primaryEdges.add(selectedConnId);
    } else {
      asArray(selectedEl?.outgoing).forEach(enqueueNeighborEdge);
      asArray(selectedEl?.incoming).forEach(enqueueNeighborEdge);
    }

    focusNodes.forEach((nodeId) => {
      markFocusDecor(canvas, kind, nodeId, "fpcFocusNeighbor");
      focusMarkerStateRef.current[kind].push({ elementId: nodeId, className: "fpcFocusNeighbor" });
    });
    primaryEdges.forEach((edgeId) => {
      markFocusDecor(canvas, kind, edgeId, "fpcFocusEdgePrimary");
      focusMarkerStateRef.current[kind].push({ elementId: edgeId, className: "fpcFocusEdgePrimary" });
    });

    allSelectableIds.forEach((id) => {
      if (id === selectedId) return;
      if (focusNodes.has(id)) return;
      if (primaryEdges.has(id)) return;
      markFocusDecor(canvas, kind, id, "fpcFocusDim");
      focusMarkerStateRef.current[kind].push({ elementId: id, className: "fpcFocusDim" });
    });
  } catch {
    // intentionally ignore
  }
}

export function setSelectedDecor(inst, kind, elementId, { selectedMarkerStateRef, focusMarkerStateRef }) {
  if (!inst) return;

  // Clear previous selection focus and marker (behavior from original clearSelectedDecor)
  const prevId = String(selectedMarkerStateRef.current[kind] || "");
  clearSelectionFocusDecor(inst, kind, focusMarkerStateRef);
  if (prevId) {
    try {
      const canvas = inst.get("canvas");
      canvas.removeMarker(prevId, "fpcElementSelected");
    } catch {
      // intentionally ignore
    }
  }

  const eid = String(elementId || "").trim();
  if (!eid) {
    selectedMarkerStateRef.current[kind] = "";
    return;
  }

  try {
    const registry = inst.get("elementRegistry");
    const el = registry.get(eid);
    if (!isSelectableElement(el)) {
      selectedMarkerStateRef.current[kind] = "";
      return;
    }
    const canvas = inst.get("canvas");
    canvas.addMarker(eid, "fpcElementSelected");
    applySelectionFocusDecor(inst, kind, el, focusMarkerStateRef);
    selectedMarkerStateRef.current[kind] = eid;
  } catch {
    // intentionally ignore
  }
}
