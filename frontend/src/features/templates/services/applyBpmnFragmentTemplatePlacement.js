function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function toFinite(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readNodeBounds(nodeRaw) {
  const node = asObject(nodeRaw);
  const di = asObject(node.di);
  const x = toFinite(di.x, Number.NaN);
  const y = toFinite(di.y, Number.NaN);
  const w = Math.max(24, toFinite(di.w ?? di.width, 140));
  const h = Math.max(24, toFinite(di.h ?? di.height, 80));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, w, h };
}

export function normalizeTemplatePack(packRaw) {
  const pack = asObject(packRaw);
  const fragment = asObject(pack.fragment);
  const nodes = asArray(fragment.nodes).map((row) => asObject(row)).filter((row) => readNodeBounds(row));
  const edges = asArray(fragment.edges).map((row) => asObject(row));
  if (!nodes.length) return null;
  return {
    ...pack,
    fragment: {
      ...fragment,
      nodes,
      edges,
    },
    entryNodeId: toText(pack.entryNodeId),
    exitNodeId: toText(pack.exitNodeId),
  };
}

export function readTemplatePackFromTemplate(templateRaw) {
  const template = asObject(templateRaw);
  const payload = asObject(template.payload);
  const pack = normalizeTemplatePack(template.pack || payload.pack);
  if (pack) return pack;
  const fallbackPack = normalizeTemplatePack({
    title: toText(template.title || "BPMN fragment"),
    fragment: payload.fragment,
    entryNodeId: toText(payload.entry_node_id || payload.entryNodeId),
    exitNodeId: toText(payload.exit_node_id || payload.exitNodeId),
    hints: asObject(payload.hints),
  });
  return fallbackPack;
}

export function readTemplatePackBBox(packRaw) {
  const pack = normalizeTemplatePack(packRaw);
  if (!pack) return { w: 220, h: 120 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  asArray(pack.fragment?.nodes).forEach((nodeRaw) => {
    const box = readNodeBounds(nodeRaw);
    if (!box) return;
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { w: 220, h: 120 };
  }
  return {
    w: Math.max(80, Math.round(maxX - minX)),
    h: Math.max(48, Math.round(maxY - minY)),
  };
}

export function createBpmnFragmentPlacementDraft(templateRaw, options = {}) {
  const template = asObject(templateRaw);
  const pack = readTemplatePackFromTemplate(template);
  if (!pack) {
    return { ok: false, error: "invalid_pack", draft: null };
  }
  const bbox = readTemplatePackBBox(pack);
  const startedAt = toFinite(options.startedAt, Date.now());
  return {
    ok: true,
    error: "",
    draft: {
      templateId: toText(template.id),
      title: toText(template.title || "BPMN fragment"),
      pack,
      bbox,
      startedAt,
      ignoreClickUntil: startedAt + toFinite(options.ignoreClickMs, 180),
      pointer: null,
    },
  };
}

export function updateBpmnFragmentPlacementPointer(draftRaw, clientXRaw, clientYRaw) {
  const draft = asObject(draftRaw);
  const x = toFinite(clientXRaw, Number.NaN);
  const y = toFinite(clientYRaw, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return draft;
  return {
    ...draft,
    pointer: { x, y },
  };
}

export function buildBpmnFragmentGhost(draftRaw, containerRectRaw) {
  const draft = asObject(draftRaw);
  const pointer = asObject(draft.pointer);
  const containerRect = asObject(containerRectRaw);
  const pointerX = toFinite(pointer.x, Number.NaN);
  const pointerY = toFinite(pointer.y, Number.NaN);
  const fallbackWidth = typeof window !== "undefined" ? Number(window.innerWidth || 1280) : 1280;
  const fallbackHeight = typeof window !== "undefined" ? Number(window.innerHeight || 800) : 800;
  const rectLeft = toFinite(containerRect.left, 0);
  const rectTop = toFinite(containerRect.top, 0);
  const rectW = Math.max(1, toFinite(containerRect.width, fallbackWidth));
  const rectH = Math.max(1, toFinite(containerRect.height, fallbackHeight));
  if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
    return null;
  }
  const rawW = toFinite(asObject(draft.bbox).w, 220);
  const rawH = toFinite(asObject(draft.bbox).h, 120);
  const w = clamp(Math.round(rawW), 80, Math.max(80, Math.round(rectW || 640)));
  const h = clamp(Math.round(rawH), 48, Math.max(48, Math.round(rectH || 400)));
  const left = clamp(Math.round(pointerX - rectLeft - (w / 2)), 0, Math.max(0, Math.round(rectW - w)));
  const top = clamp(Math.round(pointerY - rectTop - (h / 2)), 0, Math.max(0, Math.round(rectH - h)));
  return {
    left,
    top,
    width: w,
    height: h,
    title: toText(draft.title || "BPMN fragment"),
  };
}

export function buildBpmnFragmentInsertPayload(draftRaw, options = {}) {
  const draft = asObject(draftRaw);
  const pack = normalizeTemplatePack(draft.pack);
  if (!pack) return null;
  const clientPoint = asObject(options.clientPoint);
  const diagramPoint = asObject(options.diagramPoint);
  return {
    pack,
    mode: toText(options.mode || "after") || "after",
    preferPointAnchor: options.preferPointAnchor === true,
    anchor: {
      client: {
        x: toFinite(clientPoint.x, 0),
        y: toFinite(clientPoint.y, 0),
      },
      point: {
        x: toFinite(diagramPoint.x, 0),
        y: toFinite(diagramPoint.y, 0),
      },
    },
  };
}
