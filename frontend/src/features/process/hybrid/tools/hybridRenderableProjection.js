import { matrixToScreen } from "../../stage/utils/hybridCoords.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function isVisibleWithAncestors(sourceById, idRaw, visibilityCache, seen = new Set()) {
  const id = toText(idRaw);
  if (!id) return false;
  if (Object.prototype.hasOwnProperty.call(visibilityCache, id)) return !!visibilityCache[id];
  if (seen.has(id)) return false;
  seen.add(id);
  const row = asObject(sourceById[id]);
  if (!row.id || row.visible === false || row.layer?.visible === false) {
    visibilityCache[id] = false;
    return false;
  }
  const parentId = toText(row.parent_id);
  if (!parentId) {
    visibilityCache[id] = true;
    return true;
  }
  const parent = asObject(sourceById[parentId]);
  if (!parent.id || !isVisibleWithAncestors(sourceById, parentId, visibilityCache, seen)) {
    visibilityCache[id] = false;
    return false;
  }
  visibilityCache[id] = true;
  return true;
}

function depthOf(sourceById, idRaw, seen = new Set()) {
  const id = toText(idRaw);
  if (!id || seen.has(id)) return 0;
  seen.add(id);
  const parentId = toText(asObject(sourceById[id]).parent_id);
  if (!parentId || !sourceById[parentId]) return 0;
  return 1 + depthOf(sourceById, parentId, seen);
}

function buildSourceById({ docLive, layerById, hybridVisible }) {
  const sourceById = {};
  asArray(docLive?.elements).forEach((elementRaw) => {
    const element = asObject(elementRaw);
    const id = toText(element.id);
    if (!id) return;
    const layer = asObject(layerById[toText(element.layer_id)]);
    if (!hybridVisible || layer.visible === false || element.visible === false) return;
    sourceById[id] = {
      ...element,
      id,
      layer,
    };
  });
  return sourceById;
}

function sortRenderableElements(aRaw, bRaw) {
  const a = asObject(aRaw);
  const b = asObject(bRaw);
  const depthDiff = Number(a.depth || 0) - Number(b.depth || 0);
  if (depthDiff !== 0) return depthDiff;
  const aContainer = a.is_container === true || toText(a.type) === "container";
  const bContainer = b.is_container === true || toText(b.type) === "container";
  if (aContainer !== bContainer) return aContainer ? -1 : 1;
  return toText(a.id).localeCompare(toText(b.id), "ru");
}

function buildRenderableElements({ sourceById, matrix }) {
  const elements = [];
  const elementsById = {};
  const visibilityCache = {};

  Object.keys(sourceById).forEach((id) => {
    if (!isVisibleWithAncestors(sourceById, id, visibilityCache)) return;
    const row = asObject(sourceById[id]);
    const x = Number(row.x || 0);
    const y = Number(row.y || 0);
    const w = Number(row.w || 0);
    const h = Number(row.h || 0);
    const p1 = matrixToScreen(matrix, x, y);
    const p2 = matrixToScreen(matrix, x + w, y + h);
    const center = matrixToScreen(matrix, x + (w / 2), y + (h / 2));
    const normalized = {
      ...row,
      id,
      left: Math.min(Number(p1.x || 0), Number(p2.x || 0)),
      top: Math.min(Number(p1.y || 0), Number(p2.y || 0)),
      width: Math.max(18, Math.abs(Number(p2.x || 0) - Number(p1.x || 0))),
      height: Math.max(14, Math.abs(Number(p2.y || 0) - Number(p1.y || 0))),
      centerX: Number(center.x || 0),
      centerY: Number(center.y || 0),
      layerOpacity: Math.max(0.1, Math.min(1, Number(asObject(row.layer).opacity || 1))),
      scaleX: Math.max(0.15, Math.hypot(Number(matrix.a || 1), Number(matrix.b || 0))),
      scaleY: Math.max(0.15, Math.hypot(Number(matrix.c || 0), Number(matrix.d || 1))),
      depth: depthOf(sourceById, id),
    };
    elements.push(normalized);
    elementsById[id] = normalized;
  });

  elements.sort(sortRenderableElements);
  return { elements, elementsById };
}

function buildRenderableEdges({ docLive, layerById, hybridVisible, elementsById, matrix }) {
  const edges = [];
  asArray(docLive?.edges).forEach((edgeRaw) => {
    const edge = asObject(edgeRaw);
    const id = toText(edge.id);
    if (!id) return;
    const layer = asObject(layerById[toText(edge.layer_id)]);
    if (!hybridVisible || layer.visible === false || edge.visible === false) return;
    const fromEl = asObject(elementsById[toText(asObject(edge.from).element_id)]);
    const toEl = asObject(elementsById[toText(asObject(edge.to).element_id)]);
    if (!fromEl.id || !toEl.id) return;
    const points = [{ x: Number(fromEl.centerX || 0), y: Number(fromEl.centerY || 0) }];
    asArray(edge.waypoints).forEach((pointRaw) => {
      const point = asObject(pointRaw);
      const screenPoint = matrixToScreen(matrix, Number(point.x || 0), Number(point.y || 0));
      points.push({ x: Number(screenPoint.x || 0), y: Number(screenPoint.y || 0) });
    });
    points.push({ x: Number(toEl.centerX || 0), y: Number(toEl.centerY || 0) });
    edges.push({
      ...edge,
      id,
      layer,
      layerOpacity: Math.max(0.1, Math.min(1, Number(layer.opacity || 1))),
      from: fromEl,
      to: toEl,
      points,
      d: points.map((point, index) => `${index === 0 ? "M" : "L"} ${Math.round(point.x * 10) / 10} ${Math.round(point.y * 10) / 10}`).join(" "),
    });
  });
  return edges;
}

function buildLayerById(docLiveRaw) {
  const docLive = asObject(docLiveRaw);
  const out = {};
  asArray(docLive.layers).forEach((layerRaw) => {
    const layer = asObject(layerRaw);
    const id = toText(layer.id);
    if (!id) return;
    out[id] = layer;
  });
  return out;
}

function buildBindingByHybridId(docLiveRaw) {
  const docLive = asObject(docLiveRaw);
  const out = {};
  asArray(docLive.bindings).forEach((bindingRaw) => {
    const binding = asObject(bindingRaw);
    const id = toText(binding.hybrid_id);
    if (!id) return;
    out[id] = binding;
  });
  return out;
}

function buildHybridRenderable({
  docLive,
  hybridViewportMatrix,
  hybridVisible,
  layerById,
}) {
  const matrix = asObject(hybridViewportMatrix);
  const sourceById = buildSourceById({
    docLive,
    layerById,
    hybridVisible,
  });
  const { elements, elementsById } = buildRenderableElements({
    sourceById,
    matrix,
  });
  const edges = buildRenderableEdges({
    docLive,
    layerById,
    hybridVisible,
    elementsById,
    matrix,
  });
  return {
    elements,
    edges,
    elementsById,
  };
}

function countHiddenHybridItems(docLiveRaw, layerByIdRaw) {
  const docLive = asObject(docLiveRaw);
  const layerById = asObject(layerByIdRaw);
  let hidden = 0;
  asArray(docLive.elements).forEach((rowRaw) => {
    const row = asObject(rowRaw);
    const layer = asObject(layerById[toText(row.layer_id)]);
    if (layer.visible === false || row.visible === false) hidden += 1;
  });
  asArray(docLive.edges).forEach((rowRaw) => {
    const row = asObject(rowRaw);
    const layer = asObject(layerById[toText(row.layer_id)]);
    if (layer.visible === false || row.visible === false) hidden += 1;
  });
  return hidden;
}

export {
  buildBindingByHybridId,
  buildHybridRenderable,
  buildLayerById,
  countHiddenHybridItems,
};
