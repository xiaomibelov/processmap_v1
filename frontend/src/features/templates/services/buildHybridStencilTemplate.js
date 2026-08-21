function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export function buildHybridStencilTemplate(selectedIdsRaw, hybridDocRaw, meta = {}) {
  const selectedIds = Array.from(
    new Set(asArray(selectedIdsRaw).map((row) => toText(row)).filter(Boolean)),
  );
  if (!selectedIds.length) {
    return { ok: false, error: "no_hybrid_selection", template: null };
  }
  const hybridDoc = asObject(hybridDocRaw);
  const elementsRaw = asArray(hybridDoc.elements);
  const edgesRaw = asArray(hybridDoc.edges);
  const selectedElements = elementsRaw
    .map((row) => asObject(row))
    .filter((row) => selectedIds.includes(toText(row.id)));
  if (!selectedElements.length) {
    return { ok: false, error: "no_hybrid_elements", template: null };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  selectedElements.forEach((row) => {
    const x = Number(row.x || 0);
    const y = Number(row.y || 0);
    const w = Number(row.w || 0);
    const h = Number(row.h || 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { ok: false, error: "invalid_hybrid_bbox", template: null };
  }

  const idToIndex = {};
  const payloadElements = selectedElements.map((row, index) => {
    const id = toText(row.id);
    idToIndex[id] = index;
    return {
      type: toText(row.type || "rect") || "rect",
      w: round1(row.w),
      h: round1(row.h),
      dx: round1(Number(row.x || 0) - minX),
      dy: round1(Number(row.y || 0) - minY),
      style: asObject(row.style),
      text: toText(row.text || ""),
      is_container: row.is_container === true,
      visible: row.visible !== false,
    };
  });

  const payloadEdges = edgesRaw
    .map((row) => asObject(row))
    .map((row) => {
      const fromId = toText(asObject(row.from).element_id);
      const toId = toText(asObject(row.to).element_id);
      if (!(fromId in idToIndex) || !(toId in idToIndex)) return null;
      return {
        from_index: Number(idToIndex[fromId]),
        to_index: Number(idToIndex[toId]),
        type: toText(row.type || "arrow") || "arrow",
        style: asObject(row.style),
      };
    })
    .filter(Boolean);

  const title = toText(meta.title) || `Hybrid stencil ${payloadElements.length}`;
  const scope = toText(meta.scope || "personal") || "personal";
  const template = {
    id: toText(meta.id),
    title,
    scope,
    template_type: "hybrid_stencil_v1",
    bpmn_element_ids: [],
    selection_count: payloadElements.length,
    source_session_id: toText(meta.sourceSessionId),
    payload: {
      elements: payloadElements,
      edges: payloadEdges,
      bbox: {
        w: round1(maxX - minX),
        h: round1(maxY - minY),
      },
      source: "hybrid_selection",
    },
  };
  return { ok: true, error: "", template };
}

