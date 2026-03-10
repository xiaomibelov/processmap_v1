import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  docToComparableJson,
  getHybridBindingsByBpmnId,
  makeHybridV2Id,
  normalizeHybridV2Doc,
} from "../hybridLayerV2.js";
import {
  exportHybridV2ToDrawioXml,
  importDrawioXmlToHybridV2,
} from "../drawioCodec.js";
import {
  collectHybridLayerIdsForIds,
  renameHybridText,
  setHybridIdsVisible,
  setHybridLayerLocked,
} from "./hybridActions.js";
import {
  applyDrag as applyHybridDragDelta,
  applyResize as applyHybridResizeHandleDelta,
  canResizeHybridElement,
  clampRectToBounds,
} from "../actions/hybridTransform.js";
import {
  buildHybridElementAt,
  buildHybridGhost,
  getDefaultHybridSize,
  instantiateHybridStencilAt,
  normalizeHybridStencilPayload,
} from "../actions/hybridPlace.js";
import { matrixToScreen } from "../../stage/utils/hybridCoords.js";
import { updateHybridElementRect } from "../actions/hybridUpdate.js";
import useHybridTransformController from "../controllers/useHybridTransformController.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function focusHybridOverlayFromEvent(event) {
  const currentTarget = event?.currentTarget instanceof Element ? event.currentTarget : null;
  const activeTarget = currentTarget?.closest?.("[data-testid='hybrid-layer-overlay']")
    || currentTarget?.ownerSVGElement?.closest?.("[data-testid='hybrid-layer-overlay']")
    || (typeof document !== "undefined" ? document.querySelector("[data-testid='hybrid-layer-overlay']") : null);
  if (activeTarget && typeof activeTarget.focus === "function") {
    activeTarget.focus();
  }
}

function tryCapturePointer(event) {
  const pointerId = Number(event?.pointerId);
  const target = event?.currentTarget;
  if (!Number.isFinite(pointerId)) return;
  if (!target || typeof target.setPointerCapture !== "function") return;
  try {
    target.setPointerCapture(pointerId);
  } catch {
  }
}

export function defaultGhostSize(typeRaw) {
  return getDefaultHybridSize(typeRaw);
}

export function buildDiagramGhostPreview(typeRaw, pointRaw) {
  return buildHybridGhost(typeRaw, pointRaw);
}

export function projectDiagramGhostPreview(ghostRaw, matrixRaw) {
  const ghost = asObject(ghostRaw);
  const x = Number(ghost.x || 0);
  const y = Number(ghost.y || 0);
  const w = Number(ghost.w || 0);
  const h = Number(ghost.h || 0);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  const p1 = matrixToScreen(matrixRaw, x, y);
  const p2 = matrixToScreen(matrixRaw, x + w, y + h);
  return {
    type: toText(ghost.type) || "rect",
    left: Math.min(Number(p1.x || 0), Number(p2.x || 0)),
    top: Math.min(Number(p1.y || 0), Number(p2.y || 0)),
    width: Math.max(0, Math.abs(Number(p2.x || 0) - Number(p1.x || 0))),
    height: Math.max(0, Math.abs(Number(p2.y || 0) - Number(p1.y || 0))),
  };
}

function buildStencilGhostPreview(stencilRaw, pointRaw, matrixRaw) {
  const stencil = asObject(stencilRaw);
  const point = asObject(pointRaw);
  const bbox = asObject(stencil.bbox);
  const bboxW = Number(bbox.w || 0);
  const bboxH = Number(bbox.h || 0);
  const anchorX = Number(point.x || 0);
  const anchorY = Number(point.y || 0);
  if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY) || bboxW <= 0 || bboxH <= 0) return null;
  const leftDiagram = anchorX - (bboxW / 2);
  const topDiagram = anchorY - (bboxH / 2);
  const p1 = matrixToScreen(matrixRaw, leftDiagram, topDiagram);
  const p2 = matrixToScreen(matrixRaw, leftDiagram + bboxW, topDiagram + bboxH);
  const left = Math.min(Number(p1.x || 0), Number(p2.x || 0));
  const top = Math.min(Number(p1.y || 0), Number(p2.y || 0));
  const width = Math.max(0, Math.abs(Number(p2.x || 0) - Number(p1.x || 0)));
  const height = Math.max(0, Math.abs(Number(p2.y || 0) - Number(p1.y || 0)));
  const items = asArray(stencil.elements).map((elementRaw, index) => {
    const element = asObject(elementRaw);
    const dx = Number(element.dx || 0);
    const dy = Number(element.dy || 0);
    const ew = Number(element.w || 0);
    const eh = Number(element.h || 0);
    const e1 = matrixToScreen(matrixRaw, leftDiagram + dx, topDiagram + dy);
    const e2 = matrixToScreen(matrixRaw, leftDiagram + dx + ew, topDiagram + dy + eh);
    return {
      id: `ghost_item_${index + 1}`,
      type: toText(element.type || "rect") || "rect",
      left: Math.min(Number(e1.x || 0), Number(e2.x || 0)),
      top: Math.min(Number(e1.y || 0), Number(e2.y || 0)),
      width: Math.max(0, Math.abs(Number(e2.x || 0) - Number(e1.x || 0))),
      height: Math.max(0, Math.abs(Number(e2.y || 0) - Number(e1.y || 0))),
      text: toText(element.text || ""),
    };
  });
  return {
    kind: "group",
    left,
    top,
    width,
    height,
    items,
  };
}

export default function useHybridToolsController({
  hybridDoc,
  setHybridDoc,
  hybridDocRef,
  hybridVisible,
  modeEffective,
  uiLocked,
  hybridViewportMatrix,
  clientToDiagram,
  overlayRect,
  persistHybridV2Doc,
  sid,
  markPlaybackOverlayInteraction,
  bpmnRef,
  setBindPickMode,
  setGenErr,
  setInfoMsg,
  downloadTextFile,
}) {
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const transformFrameRef = useRef(0);
  const pointerMoveFrameRef = useRef(0);
  const pendingPointerMoveRef = useRef(null);
  const pendingTransformRef = useRef(null);
  const toolRef = useRef("select");
  const arrowDraftRef = useRef(null);
  const stencilPlacementRef = useRef(null);
  const textEditorRef = useRef(null);
  const [toolState, setToolState] = useState("select");
  const [importNotice, setImportNotice] = useState("");
  const [ghostPreview, setGhostPreview] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [textEditor, setTextEditor] = useState(null);

  useEffect(() => {
    textEditorRef.current = textEditor;
  }, [textEditor]);

  const docLive = useMemo(
    () => normalizeHybridV2Doc(hybridDoc),
    [hybridDoc],
  );
  const layerById = useMemo(() => {
    const out = {};
    docLive.layers.forEach((layerRaw) => {
      const layer = asObject(layerRaw);
      const id = toText(layer.id);
      if (!id) return;
      out[id] = layer;
    });
    return out;
  }, [docLive]);
  const bindingByHybridId = useMemo(() => {
    const out = {};
    docLive.bindings.forEach((bindingRaw) => {
      const binding = asObject(bindingRaw);
      const id = toText(binding.hybrid_id);
      if (!id) return;
      out[id] = binding;
    });
    return out;
  }, [docLive]);
  const bindingByBpmnId = useMemo(
    () => getHybridBindingsByBpmnId(docLive),
    [docLive],
  );
  const renderable = useMemo(() => {
    const matrix = asObject(hybridViewportMatrix);
    const layersById = asObject(layerById);
    const scaleX = Math.max(0.15, Math.hypot(Number(matrix.a || 1), Number(matrix.b || 0)));
    const scaleY = Math.max(0.15, Math.hypot(Number(matrix.c || 0), Number(matrix.d || 1)));
    const sourceById = {};
    docLive.elements.forEach((elementRaw) => {
      const element = asObject(elementRaw);
      const id = toText(element.id);
      if (!id) return;
      const layer = asObject(layersById[toText(element.layer_id)]);
      if (!hybridVisible || layer.visible === false || element.visible === false) return;
      sourceById[id] = {
        ...element,
        id,
        layer,
      };
    });
    const visibilityCache = {};
    function isVisibleWithAncestors(idRaw, seen = new Set()) {
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
      if (!parent.id || !isVisibleWithAncestors(parentId, seen)) {
        visibilityCache[id] = false;
        return false;
      }
      visibilityCache[id] = true;
      return true;
    }
    function depthOf(idRaw, seen = new Set()) {
      const id = toText(idRaw);
      if (!id || seen.has(id)) return 0;
      seen.add(id);
      const parentId = toText(asObject(sourceById[id]).parent_id);
      if (!parentId || !sourceById[parentId]) return 0;
      return 1 + depthOf(parentId, seen);
    }
    const elements = [];
    const elementsById = {};
    Object.keys(sourceById).forEach((id) => {
      if (!isVisibleWithAncestors(id)) return;
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
        scaleX,
        scaleY,
        depth: depthOf(id),
      };
      elements.push(normalized);
      elementsById[id] = normalized;
    });
    elements.sort((aRaw, bRaw) => {
      const a = asObject(aRaw);
      const b = asObject(bRaw);
      const depthDiff = Number(a.depth || 0) - Number(b.depth || 0);
      if (depthDiff !== 0) return depthDiff;
      const aContainer = a.is_container === true || toText(a.type) === "container";
      const bContainer = b.is_container === true || toText(b.type) === "container";
      if (aContainer !== bContainer) return aContainer ? -1 : 1;
      return toText(a.id).localeCompare(toText(b.id), "ru");
    });
    const edges = [];
    docLive.edges.forEach((edgeRaw) => {
      const edge = asObject(edgeRaw);
      const id = toText(edge.id);
      if (!id) return;
      const layer = asObject(layersById[toText(edge.layer_id)]);
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
    return { elements, edges, elementsById };
  }, [docLive, hybridViewportMatrix, hybridVisible, layerById]);
  const hiddenCount = useMemo(() => {
    let hidden = 0;
    docLive.elements.forEach((rowRaw) => {
      const row = asObject(rowRaw);
      const layer = asObject(layerById[toText(row.layer_id)]);
      if (layer.visible === false || row.visible === false) hidden += 1;
    });
    docLive.edges.forEach((rowRaw) => {
      const row = asObject(rowRaw);
      const layer = asObject(layerById[toText(row.layer_id)]);
      if (layer.visible === false || row.visible === false) hidden += 1;
    });
    return hidden;
  }, [docLive, layerById]);
  const totalCount = Number(docLive.elements.length || 0) + Number(docLive.edges.length || 0);

  const arrowPreview = useMemo(() => {
    const pending = asObject(arrowDraftRef.current);
    const fromId = toText(pending.fromId);
    const pointer = asObject(pending.pointer);
    const fromEl = asObject(renderable.elementsById[fromId]);
    if (!fromEl.id || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return null;
    return {
      x1: Number(fromEl.centerX || 0),
      y1: Number(fromEl.centerY || 0),
      x2: Number(pointer.x || 0),
      y2: Number(pointer.y || 0),
    };
  }, [renderable, toolState]);
  const ghostPreviewScreen = useMemo(
    () => projectDiagramGhostPreview(ghostPreview, hybridViewportMatrix),
    [ghostPreview, hybridViewportMatrix],
  );

  const updateDoc = useCallback((mutator, source = "hybrid_v2_update") => {
    setHybridDoc((prevRaw) => {
      const prev = normalizeHybridV2Doc(prevRaw);
      const candidate = typeof mutator === "function" ? mutator(prev) : prev;
      const next = normalizeHybridV2Doc(candidate);
      if (docToComparableJson(prev) !== docToComparableJson(next)) {
        hybridDocRef.current = next;
        markPlaybackOverlayInteraction?.({ stage: source });
      }
      return next;
    });
  }, [hybridDocRef, markPlaybackOverlayInteraction, setHybridDoc]);

  const applyElementRect = useCallback((prevRaw, elementIdRaw, rectRaw) => {
    const elementId = toText(elementIdRaw);
    if (!elementId) return normalizeHybridV2Doc(prevRaw);
    return updateHybridElementRect(prevRaw, elementId, rectRaw);
  }, []);

  const flushPendingTransform = useCallback((fallbackSource = "hybrid_v2_transform_flush") => {
    if (typeof window !== "undefined" && transformFrameRef.current) {
      window.cancelAnimationFrame(transformFrameRef.current);
      transformFrameRef.current = 0;
    }
    const pending = asObject(pendingTransformRef.current);
    const elementId = toText(pending.id);
    if (!elementId) return false;
    pendingTransformRef.current = null;
    updateDoc((prev) => applyElementRect(prev, elementId, pending.rect), toText(pending.source) || fallbackSource);
    return true;
  }, [applyElementRect, updateDoc]);

  const queueElementTransform = useCallback((elementIdRaw, rectRaw, source = "hybrid_v2_transform_move") => {
    const elementId = toText(elementIdRaw);
    if (!elementId) return;
    pendingTransformRef.current = {
      id: elementId,
      rect: rectRaw,
      source,
    };
    if (typeof window === "undefined") {
      flushPendingTransform(source);
      return;
    }
    if (transformFrameRef.current) return;
    transformFrameRef.current = window.requestAnimationFrame(() => {
      transformFrameRef.current = 0;
      const pending = asObject(pendingTransformRef.current);
      const pendingId = toText(pending.id);
      if (!pendingId) return;
      pendingTransformRef.current = null;
      updateDoc((prev) => applyElementRect(prev, pendingId, pending.rect), toText(pending.source) || source);
    });
  }, [applyElementRect, flushPendingTransform, updateDoc]);

  const getDiagramViewportBounds = useCallback(() => {
    const rect = asObject(overlayRect);
    const width = Number(rect.width || 0);
    const height = Number(rect.height || 0);
    if (width <= 1 || height <= 1) return null;
    const left = Number(rect.left || 0);
    const top = Number(rect.top || 0);
    const p1 = clientToDiagram(left, top);
    const p2 = clientToDiagram(left + width, top + height);
    if (!p1 || !p2) return null;
    const minX = Math.min(Number(p1.x || 0), Number(p2.x || 0));
    const maxX = Math.max(Number(p1.x || 0), Number(p2.x || 0));
    const minY = Math.min(Number(p1.y || 0), Number(p2.y || 0));
    const maxY = Math.max(Number(p1.y || 0), Number(p2.y || 0));
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
    return { minX, minY, maxX, maxY };
  }, [clientToDiagram, overlayRect]);

  const clampRectToViewport = useCallback((rectRaw) => {
    const bounds = getDiagramViewportBounds();
    return clampRectToBounds(rectRaw, { bounds });
  }, [getDiagramViewportBounds]);

  const setTool = useCallback((toolRaw) => {
    const nextTool = toText(toolRaw).toLowerCase() || "select";
    toolRef.current = nextTool;
    setToolState(nextTool);
    updateDoc((prev) => ({
      ...prev,
      view: {
        ...asObject(prev.view),
        tool: nextTool,
      },
    }), "hybrid_v2_tool_change");
  }, [updateDoc]);

  useEffect(() => {
    const incomingTool = toText(asObject(docLive.view).tool || "select") || "select";
    toolRef.current = incomingTool;
    setToolState(incomingTool);
  }, [docLive.view]);

  const createElementAt = useCallback((pointRaw, typeRaw = "rect") => {
    const point = asObject(pointRaw);
    const x = Number(point.x || 0);
    const y = Number(point.y || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
    const createdId = makeHybridV2Id("E", hybridDocRef.current);
    updateDoc((prevRaw) => {
      const prev = normalizeHybridV2Doc(prevRaw);
      const view = asObject(prev.view);
      const layerId = toText(view.active_layer_id || prev.layers?.[0]?.id || "L1") || "L1";
      return {
        ...prev,
        elements: [
          ...asArray(prev.elements),
          buildHybridElementAt(typeRaw, { x, y }, {
            id: createdId,
            layer_id: layerId,
            parent_id: null,
          }),
        ],
      };
    }, "hybrid_v2_create_element");
    return createdId;
  }, [hybridDocRef, updateDoc]);

  const createEdge = useCallback((fromIdRaw, toIdRaw) => {
    const fromId = toText(fromIdRaw);
    const toId = toText(toIdRaw);
    if (!fromId || !toId || fromId === toId) return "";
    const createdId = makeHybridV2Id("A", hybridDocRef.current);
    updateDoc((prevRaw) => {
      const prev = normalizeHybridV2Doc(prevRaw);
      const elementIds = new Set(asArray(prev.elements).map((rowRaw) => toText(asObject(rowRaw).id)).filter(Boolean));
      if (!elementIds.has(fromId) || !elementIds.has(toId)) return prev;
      const layerId = toText(asObject(prev.view).active_layer_id || prev.layers?.[0]?.id || "L1") || "L1";
      return {
        ...prev,
        edges: [
          ...asArray(prev.edges),
          {
            id: createdId,
            layer_id: layerId,
            type: "arrow",
            visible: true,
            from: { element_id: fromId, anchor: "auto" },
            to: { element_id: toId, anchor: "auto" },
            waypoints: [],
            style: { stroke: "#2563eb", width: 2 },
          },
        ],
      };
    }, "hybrid_v2_create_edge");
    return createdId;
  }, [hybridDocRef, updateDoc]);

  const cancelStencilPlacement = useCallback(() => {
    stencilPlacementRef.current = null;
    setGhostPreview(null);
    if (toText(toolRef.current) === "template_stencil") {
      toolRef.current = "select";
      setToolState("select");
    }
  }, []);

  const startStencilPlacement = useCallback((templateRaw = {}) => {
    const template = asObject(templateRaw);
    const payload = normalizeHybridStencilPayload(template.payload);
    if (!asArray(payload.elements).length) {
      setGenErr?.("Шаблон stencil пустой: нет элементов для размещения.");
      return { ok: false, error: "stencil_empty" };
    }
    stencilPlacementRef.current = {
      templateId: toText(template.id),
      title: toText(template.title || "Stencil"),
      payload,
    };
    toolRef.current = "template_stencil";
    setToolState("template_stencil");
    setGhostPreview(null);
    setInfoMsg?.(`Placement mode: ${toText(template.title || "Stencil")}. Кликните по диаграмме для размещения.`);
    setGenErr?.("");
    return { ok: true };
  }, [setGenErr, setInfoMsg]);

  const placeStencilAt = useCallback((pointRaw) => {
    const placement = asObject(stencilPlacementRef.current);
    const payload = asObject(placement.payload);
    if (!asArray(payload.elements).length) return false;
    const point = asObject(pointRaw);
    const x = Number(point.x || 0);
    const y = Number(point.y || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    let nextDoc = hybridDocRef.current;
    updateDoc((prevRaw) => {
      const prev = normalizeHybridV2Doc(prevRaw);
      const activeLayerId = toText(asObject(prev.view).active_layer_id || prev.layers?.[0]?.id || "L1") || "L1";
      const usedIds = new Set([
        ...asArray(prev.elements).map((rowRaw) => toText(asObject(rowRaw).id)).filter(Boolean),
        ...asArray(prev.edges).map((rowRaw) => toText(asObject(rowRaw).id)).filter(Boolean),
      ]);
      const nextGeneratedId = (prefixRaw = "E") => {
        const prefix = toText(prefixRaw || "E") || "E";
        let guard = 0;
        while (guard < 10000) {
          guard += 1;
          const candidate = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
          if (usedIds.has(candidate)) continue;
          usedIds.add(candidate);
          return candidate;
        }
        return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
      };
      const created = instantiateHybridStencilAt(payload, { x, y }, {
        layerId: activeLayerId,
        makeElementId: () => nextGeneratedId("E"),
        makeEdgeId: () => nextGeneratedId("A"),
      });
      nextDoc = normalizeHybridV2Doc({
        ...prev,
        elements: [...asArray(prev.elements), ...asArray(created.elements)],
        edges: [...asArray(prev.edges), ...asArray(created.edges)],
      });
      return nextDoc;
    }, "hybrid_v2_stencil_place");
    void persistHybridV2Doc(nextDoc, { source: "hybrid_v2_stencil_place" });
    markPlaybackOverlayInteraction?.({
      stage: "hybrid_v2_stencil_place",
      elements: Number(asArray(payload.elements).length || 0),
      edges: Number(asArray(payload.edges).length || 0),
    });
    cancelStencilPlacement();
    return true;
  }, [asArray, cancelStencilPlacement, hybridDocRef, markPlaybackOverlayInteraction, persistHybridV2Doc, updateDoc]);

  const placeStencilAtClient = useCallback((clientXRaw, clientYRaw) => {
    const clientX = Number(clientXRaw);
    const clientY = Number(clientYRaw);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
    const point = clientToDiagram(clientX, clientY);
    if (!point) return false;
    return placeStencilAt(point);
  }, [clientToDiagram, placeStencilAt]);

  const bindHybridToBpmn = useCallback((targetBpmnIdRaw, hybridIdRaw = "") => {
    const activeId = toText(hybridIdRaw);
    const targetBpmnId = toText(targetBpmnIdRaw);
    if (!activeId || !targetBpmnId) return;
    updateDoc((prevRaw) => {
      const prev = normalizeHybridV2Doc(prevRaw);
      const edgeIds = new Set(asArray(prev.edges).map((rowRaw) => toText(asObject(rowRaw).id)).filter(Boolean));
      const keep = asArray(prev.bindings).filter((rowRaw) => toText(asObject(rowRaw).hybrid_id) !== activeId);
      return {
        ...prev,
        bindings: [...keep, { hybrid_id: activeId, bpmn_id: targetBpmnId, kind: edgeIds.has(activeId) ? "edge" : "node" }],
      };
    }, "hybrid_v2_bind");
    setBindPickMode?.(false);
  }, [setBindPickMode, updateDoc]);

  const goToHybridBinding = useCallback((hybridIdRaw = "") => {
    const activeId = toText(hybridIdRaw);
    if (!activeId) return;
    const binding = asObject(bindingByHybridId[activeId]);
    const bpmnId = toText(binding.bpmn_id);
    if (!bpmnId) return;
    bpmnRef.current?.focusNode?.(bpmnId, { keepPrevious: false, durationMs: 1000 });
  }, [bindingByHybridId, bpmnRef]);

  const renameHybridItem = useCallback((hybridIdRaw = "") => {
    const activeId = toText(hybridIdRaw);
    if (!activeId) return false;
    const row = asObject(docLive.elements.find((item) => toText(item.id) === activeId));
    if (!row.id) return false;
    const nextText = typeof window !== "undefined"
      ? window.prompt("Переименовать элемент Hybrid", String(row.text || ""))
      : null;
    if (nextText == null) return false;
    updateDoc((prev) => renameHybridText(prev, activeId, nextText), "hybrid_v2_context_rename");
    return true;
  }, [docLive.elements, updateDoc]);

  const openTextEditor = useCallback((hybridIdRaw = "") => {
    const hybridId = toText(hybridIdRaw);
    if (!hybridId || modeEffective !== "edit") return false;
    const docRow = asObject(docLive.elements.find((item) => toText(item.id) === hybridId));
    const renderRow = asObject(renderable.elementsById[hybridId]);
    const layer = asObject(layerById[toText(docRow.layer_id || renderRow.layer_id)]);
    if (!docRow.id || !renderRow.id) return false;
    if (layer.locked === true) {
      setInfoMsg?.("Элемент находится на заблокированном слое. Сначала снимите блокировку.");
      return false;
    }
    setTextEditor({
      id: hybridId,
      value: String(docRow.text || ""),
      left: Math.round(Number(renderRow.left || 0)),
      top: Math.round(Number(renderRow.top || 0)),
      width: Math.max(140, Math.round(Number(renderRow.width || 0))),
      height: Math.max(44, Math.round(Number(renderRow.height || 0))),
    });
    textEditorRef.current = {
      id: hybridId,
      value: String(docRow.text || ""),
      left: Math.round(Number(renderRow.left || 0)),
      top: Math.round(Number(renderRow.top || 0)),
      width: Math.max(140, Math.round(Number(renderRow.width || 0))),
      height: Math.max(44, Math.round(Number(renderRow.height || 0))),
    };
    return true;
  }, [docLive.elements, layerById, modeEffective, renderable.elementsById, setInfoMsg]);

  const updateTextEditorValue = useCallback((nextValueRaw) => {
    setTextEditor((prev) => {
      if (!prev) return prev;
      const next = { ...prev, value: String(nextValueRaw ?? "") };
      textEditorRef.current = next;
      return next;
    });
  }, []);

  const closeTextEditor = useCallback(() => {
    textEditorRef.current = null;
    setTextEditor(null);
  }, []);

  const commitTextEditor = useCallback((source = "hybrid_v2_text_commit") => {
    const editor = asObject(textEditorRef.current);
    const hybridId = toText(editor.id);
    if (!hybridId) return false;
    let nextDoc = hybridDocRef.current;
    updateDoc((prev) => {
      nextDoc = renameHybridText(prev, hybridId, String(editor.value ?? ""));
      return nextDoc;
    }, source);
    textEditorRef.current = null;
    setTextEditor(null);
    void persistHybridV2Doc(nextDoc, { source });
    return true;
  }, [hybridDocRef, persistHybridV2Doc, updateDoc]);

  const hideHybridIds = useCallback((idsRaw) => {
    const ids = asArray(idsRaw);
    if (!ids.length) return false;
    updateDoc((prev) => setHybridIdsVisible(prev, ids, false), "hybrid_v2_context_hide");
    return true;
  }, [updateDoc]);

  const lockLayersForHybridIds = useCallback((idsRaw) => {
    const layerIds = collectHybridLayerIdsForIds(docLive, idsRaw);
    if (!layerIds.length) return false;
    updateDoc((prev) => setHybridLayerLocked(prev, layerIds, true), "hybrid_v2_context_lock");
    return true;
  }, [docLive, updateDoc]);

  const exportDrawio = useCallback(() => {
    const xml = exportHybridV2ToDrawioXml(hybridDocRef.current);
    const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14) || Date.now();
    const ok = downloadTextFile(`hybrid_${sid || "session"}_${stamp}.drawio`, xml, "application/xml;charset=utf-8");
    if (ok) {
      setInfoMsg?.("Hybrid экспортирован (.drawio).");
      setGenErr?.("");
    } else {
      setGenErr?.("Не удалось экспортировать Hybrid.");
    }
  }, [downloadTextFile, hybridDocRef, setGenErr, setInfoMsg, sid]);

  const importFile = useCallback(async (fileRaw) => {
    const file = fileRaw instanceof File ? fileRaw : null;
    if (!file) return;
    const text = await file.text().catch(() => "");
    const imported = await importDrawioXmlToHybridV2(text, {
      baseDoc: hybridDocRef.current,
      preserveBindings: true,
    });
    const nextDoc = normalizeHybridV2Doc(imported.hybridV2);
    setHybridDoc(nextDoc);
    hybridDocRef.current = nextDoc;
    setBindPickMode?.(false);
    const skippedCount = asArray(imported.skipped).length;
    const warningsCount = asArray(imported.warnings).length;
    const skippedPreview = asArray(imported.skipped).slice(0, 3).map((row) => toText(row)).filter(Boolean).join(", ");
    const warningsPreview = asArray(imported.warnings).slice(0, 3).map((row) => toText(row)).filter(Boolean).join(", ");
    const summary = `Imported: ${Number(asArray(nextDoc.elements).length)} elements, ${Number(asArray(nextDoc.edges).length)} edges, ${Number(asArray(nextDoc.layers).length)} layers`;
    const detail = [
      skippedCount ? `Skipped: ${skippedCount}` : "",
      warningsCount ? `Warnings: ${warningsCount}` : "",
      skippedPreview ? `Skipped reasons: ${skippedPreview}` : "",
      warningsPreview ? `Warnings: ${warningsPreview}` : "",
    ].filter(Boolean).join(" · ");
    setImportNotice(detail ? `${summary} · ${detail}` : summary);
    await persistHybridV2Doc(nextDoc, { source: "hybrid_v2_import_drawio" });
  }, [hybridDocRef, persistHybridV2Doc, setBindPickMode, setHybridDoc]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const openContextMenu = useCallback((event, idRaw = "") => {
    const id = toText(idRaw);
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();
    setContextMenu({
      clientX: Number(event?.clientX || 0),
      clientY: Number(event?.clientY || 0),
      targetId: id,
    });
  }, []);

  const onElementContextMenu = useCallback((event, idRaw) => {
    openContextMenu(event, idRaw);
  }, [openContextMenu]);

  const onElementDoubleClick = useCallback((event, idRaw, selectionApi = {}) => {
    const id = toText(idRaw);
    if (!id) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    tryCapturePointer(event);
    focusHybridOverlayFromEvent(event);
    selectionApi.selectOnly?.(id);
    openTextEditor(id);
  }, [openTextEditor]);

  const onOverlayContextMenu = useCallback((event, hitTestAtClientPoint) => {
    const hit = typeof hitTestAtClientPoint === "function"
      ? hitTestAtClientPoint(event?.clientX, event?.clientY)
      : null;
    if (!hit?.id) {
      closeContextMenu();
      return;
    }
    openContextMenu(event, hit.id);
  }, [closeContextMenu, openContextMenu]);

  const onElementPointerDown = useCallback((event, elementIdRaw, selectionApi = {}) => {
    const elementId = toText(elementIdRaw);
    if (!elementId) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    tryCapturePointer(event);
    focusHybridOverlayFromEvent(event);
    markPlaybackOverlayInteraction?.({ action: "hybrid_v2_element_pointer", elementId });
    selectionApi.selectFromPointerEvent?.(elementId, event);
    if (modeEffective !== "edit" || uiLocked) return;
    const point = clientToDiagram(event?.clientX, event?.clientY);
    if (!point) return;
    const row = asObject(renderable.elementsById[elementId]);
    const rowLayer = asObject(layerById[toText(row.layer_id)]);
    if (!row.id) return;
    if (rowLayer.locked === true || row.locked === true) {
      setInfoMsg?.(`Перемещение недоступно: слой "${toText(rowLayer.name) || toText(row.layer_id) || "Hybrid"}" заблокирован.`);
      setGenErr?.("");
      return;
    }
    const tool = toText(toolRef.current).toLowerCase() || "select";
    const pending = asObject(arrowDraftRef.current);
    if (tool === "arrow") {
      const pendingFromId = toText(pending.fromId);
      if (pendingFromId && pendingFromId !== elementId) {
        createEdge(pendingFromId, elementId);
        arrowDraftRef.current = null;
        return;
      }
      arrowDraftRef.current = { fromId: elementId, pointer: pending.pointer || null };
      return;
    }
    if (toText(pending.fromId)) {
      arrowDraftRef.current = null;
    }
    dragRef.current = {
      id: elementId,
      pointerId: Number(event?.pointerId),
      captureTarget: event?.currentTarget || null,
      startX: Number(point.x || 0),
      startY: Number(point.y || 0),
      baseX: Number(row.x || 0),
      baseY: Number(row.y || 0),
      baseW: Number(row.w || 0),
      baseH: Number(row.h || 0),
      computeRect(nextPointRaw) {
        const nextPoint = asObject(nextPointRaw);
        return applyHybridDragDelta(
          {
            x: Number(row.x || 0),
            y: Number(row.y || 0),
            w: Number(row.w || 0),
            h: Number(row.h || 0),
          },
          Number(nextPoint.x || 0) - Number(point.x || 0),
          Number(nextPoint.y || 0) - Number(point.y || 0),
          { bounds: getDiagramViewportBounds() },
        );
      },
    };
  }, [clientToDiagram, createEdge, getDiagramViewportBounds, layerById, markPlaybackOverlayInteraction, modeEffective, renderable.elementsById, setGenErr, setInfoMsg, uiLocked]);

  const onResizeHandlePointerDown = useCallback((event, elementIdRaw, handleRaw, selectionApi = {}) => {
    const elementId = toText(elementIdRaw);
    const handle = toText(handleRaw).toLowerCase();
    if (!elementId || !handle) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    tryCapturePointer(event);
    focusHybridOverlayFromEvent(event);
    markPlaybackOverlayInteraction?.({ action: "hybrid_v2_resize_start", elementId, handle });
    if (modeEffective !== "edit" || uiLocked) return;
    const point = clientToDiagram(event?.clientX, event?.clientY);
    if (!point) return;
    const row = asObject(renderable.elementsById[elementId]);
    const rowLayer = asObject(layerById[toText(row.layer_id)]);
    if (!row.id) return;
    if (!canResizeHybridElement(row.type)) return;
    if (rowLayer.locked === true || row.locked === true) {
      setInfoMsg?.(`Изменение размера недоступно: слой "${toText(rowLayer.name) || toText(row.layer_id) || "Hybrid"}" заблокирован.`);
      setGenErr?.("");
      return;
    }
    selectionApi.selectOnly?.(elementId);
    resizeRef.current = {
      id: elementId,
      pointerId: Number(event?.pointerId),
      captureTarget: event?.currentTarget || null,
      handle,
      startX: Number(point.x || 0),
      startY: Number(point.y || 0),
      baseX: Number(row.x || 0),
      baseY: Number(row.y || 0),
      baseW: Number(row.w || 0),
      baseH: Number(row.h || 0),
      computeRect(nextPointRaw) {
        const nextPoint = asObject(nextPointRaw);
        return applyHybridResizeHandleDelta(
          {
            x: Number(row.x || 0),
            y: Number(row.y || 0),
            w: Number(row.w || 0),
            h: Number(row.h || 0),
          },
          handle,
          Number(nextPoint.x || 0) - Number(point.x || 0),
          Number(nextPoint.y || 0) - Number(point.y || 0),
          { bounds: getDiagramViewportBounds() },
        );
      },
    };
  }, [clientToDiagram, getDiagramViewportBounds, layerById, markPlaybackOverlayInteraction, modeEffective, renderable.elementsById, setGenErr, setInfoMsg, uiLocked]);

  const onOverlayPointerDown = useCallback((event, selectionApi = {}) => {
    if (modeEffective !== "edit" || uiLocked || !hybridVisible) return;
    const target = event?.target instanceof Element ? event.target : null;
    if (
      target?.closest(".hybridV2Shape")
      || target?.closest(".hybridV2ResizeHandle")
      || target?.closest(".hybridLayerCard")
      || target?.closest(".hybridLayerHotspot")
    ) {
      return;
    }
    const point = clientToDiagram(event?.clientX, event?.clientY);
    if (!point) return;
    const activeLayerId = toText(asObject(hybridDocRef.current?.view).active_layer_id || "L1") || "L1";
    const activeLayer = asObject(layerById[activeLayerId]);
    const tool = toText(toolRef.current).toLowerCase() || "select";
    const isPlacementTool = tool === "template_stencil"
      || tool === "rect"
      || tool === "note"
      || tool === "text"
      || tool === "container"
      || tool === "arrow";
    if (!isPlacementTool) {
      if (tool === "arrow") {
        arrowDraftRef.current = null;
      }
      if (tool === "select") {
        selectionApi.clearSelection?.();
      }
      return;
    }
    if (activeLayer.locked === true) {
      setInfoMsg?.(`Создание недоступно: слой "${toText(activeLayer.name) || activeLayerId}" заблокирован.`);
      setGenErr?.("");
      return;
    }
    event?.preventDefault?.();
    event?.stopPropagation?.();
    focusHybridOverlayFromEvent(event);
    markPlaybackOverlayInteraction?.({ action: "hybrid_v2_overlay_pointer", tool });
    if (toText(tool) === "template_stencil") {
      placeStencilAt(point);
      return;
    }
    if (tool === "rect" || tool === "note" || tool === "text" || tool === "container") {
      createElementAt(point, tool);
      return;
    }
    if (tool === "arrow") {
      arrowDraftRef.current = null;
      return;
    }
    selectionApi.clearSelection?.();
  }, [clientToDiagram, createElementAt, hybridDocRef, hybridVisible, layerById, markPlaybackOverlayInteraction, modeEffective, placeStencilAt, setGenErr, setInfoMsg, uiLocked]);

  const onOverlayPointerMove = useCallback((event) => {
    const clientX = Number(event?.clientX);
    const clientY = Number(event?.clientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    pendingPointerMoveRef.current = { clientX, clientY };
    if (pointerMoveFrameRef.current) return;
    const scheduleFrame = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (fn) => setTimeout(fn, 16);
    pointerMoveFrameRef.current = scheduleFrame(() => {
      pointerMoveFrameRef.current = 0;
      const pendingPoint = asObject(pendingPointerMoveRef.current);
      pendingPointerMoveRef.current = null;
      const px = Number(pendingPoint.clientX);
      const py = Number(pendingPoint.clientY);
      if (!Number.isFinite(px) || !Number.isFinite(py)) return;
      const rect = asObject(overlayRect);
      const localX = px - Number(rect.left || 0);
      const localY = py - Number(rect.top || 0);
      const point = clientToDiagram(px, py);
      const tool = toText(toolRef.current).toLowerCase() || "select";
      const stencilPlacement = asObject(stencilPlacementRef.current);
      if (tool === "template_stencil" && asArray(stencilPlacement.payload?.elements).length && point) {
        setGhostPreview(buildStencilGhostPreview(stencilPlacement.payload, point, hybridViewportMatrix));
      } else if (tool === "rect" || tool === "container" || tool === "text") {
        setGhostPreview(buildDiagramGhostPreview(tool, point));
      } else {
        setGhostPreview(null);
      }
      const pendingArrow = asObject(arrowDraftRef.current);
      if (toText(pendingArrow.fromId) && point) {
        arrowDraftRef.current = {
          ...pendingArrow,
          pointer: {
            x: localX,
            y: localY,
          },
        };
      }
    });
  }, [asArray, clientToDiagram, hybridViewportMatrix, overlayRect]);

  const onOverlayPointerLeave = useCallback(() => {
    if (pointerMoveFrameRef.current) {
      const cancelFrame = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame.bind(window)
        : clearTimeout;
      cancelFrame(pointerMoveFrameRef.current);
      pointerMoveFrameRef.current = 0;
    }
    pendingPointerMoveRef.current = null;
    setGhostPreview(null);
    const pending = asObject(arrowDraftRef.current);
    if (!toText(pending.fromId)) return;
    arrowDraftRef.current = {
      ...pending,
      pointer: null,
    };
  }, []);

  useHybridTransformController({
    clientToDiagram,
    modeEffective,
    uiLocked,
    dragRef,
    resizeRef,
    queueElementTransform: useCallback((elementIdRaw, rectRaw, source = "hybrid_v2_transform_move") => {
      const elementId = toText(elementIdRaw);
      if (!elementId) return;
      const rect = asObject(rectRaw);
      if (!Number.isFinite(Number(rect.x)) || !Number.isFinite(Number(rect.y))) return;
      const clampedRect = clampRectToViewport({
        x: Number(rect.x || 0),
        y: Number(rect.y || 0),
        w: Number(rect.w || 0),
        h: Number(rect.h || 0),
      });
      queueElementTransform(
        elementId,
        clampedRect,
        source,
      );
    }, [clampRectToViewport, queueElementTransform]),
    flushPendingTransform,
    hybridDocRef,
    persistHybridV2Doc,
  });

  useEffect(() => {
    if (!contextMenu || typeof window === "undefined") return undefined;
    const onPointerDown = () => {
      setContextMenu(null);
    };
    const onKeyDown = (event) => {
      if (String(event?.key || "") !== "Escape") return;
      setContextMenu(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  const cancelTransientState = useCallback(() => {
    if (typeof window !== "undefined" && transformFrameRef.current) {
      window.cancelAnimationFrame(transformFrameRef.current);
      transformFrameRef.current = 0;
    }
    pendingTransformRef.current = null;
    arrowDraftRef.current = null;
    stencilPlacementRef.current = null;
    dragRef.current = null;
    resizeRef.current = null;
    textEditorRef.current = null;
    setGhostPreview(null);
    setContextMenu(null);
    setTextEditor(null);
    if (toText(toolRef.current) === "template_stencil") {
      toolRef.current = "select";
      setToolState("select");
    }
  }, []);

  useEffect(() => () => {
    if (typeof window !== "undefined" && transformFrameRef.current) {
      window.cancelAnimationFrame(transformFrameRef.current);
      transformFrameRef.current = 0;
    }
    if (typeof window !== "undefined" && pointerMoveFrameRef.current) {
      window.cancelAnimationFrame(pointerMoveFrameRef.current);
      pointerMoveFrameRef.current = 0;
    }
    pendingPointerMoveRef.current = null;
  }, []);

  useEffect(() => {
    if (toolState === "rect" || toolState === "container" || toolState === "text" || toolState === "template_stencil") return;
    setGhostPreview(null);
  }, [toolState]);

  useEffect(() => {
    if (!textEditor) return;
    const id = toText(textEditor.id);
    const renderRow = asObject(renderable.elementsById[id]);
    if (!renderRow.id) {
      textEditorRef.current = null;
      setTextEditor(null);
      return;
    }
    const nextFrame = {
      left: Math.round(Number(renderRow.left || 0)),
      top: Math.round(Number(renderRow.top || 0)),
      width: Math.max(140, Math.round(Number(renderRow.width || 0))),
      height: Math.max(44, Math.round(Number(renderRow.height || 0))),
    };
    setTextEditor((prev) => {
      if (!prev || toText(prev.id) !== id) return prev;
      if (
        Number(prev.left || 0) === nextFrame.left
        && Number(prev.top || 0) === nextFrame.top
        && Number(prev.width || 0) === nextFrame.width
        && Number(prev.height || 0) === nextFrame.height
      ) {
        return prev;
      }
      return { ...prev, ...nextFrame };
    });
  }, [renderable.elementsById, textEditor]);

  useEffect(() => {
    if (modeEffective === "edit" && hybridVisible) return;
    textEditorRef.current = null;
    setTextEditor(null);
  }, [hybridVisible, modeEffective]);

  return {
    docLive,
    layerById,
    bindingByHybridId,
    renderable,
    hiddenCount,
    totalCount,
    toolState,
    setTool,
    importNotice,
    updateDoc,
    createElementAt,
    createEdge,
    startStencilPlacement,
    placeStencilAtClient,
    cancelStencilPlacement,
    bindHybridToBpmn,
    goToHybridBinding,
    exportDrawio,
    importFile,
    onElementPointerDown,
    onResizeHandlePointerDown,
    onOverlayPointerDown,
    onOverlayPointerMove,
    onOverlayPointerLeave,
    onElementContextMenu,
    onElementDoubleClick,
    onOverlayContextMenu,
    contextMenu,
    closeContextMenu,
    ghostPreview: ghostPreviewScreen,
    ghostPreviewDiagram: ghostPreview,
    stencilPlacementActive: !!stencilPlacementRef.current,
    arrowPreview,
    cancelTransientState,
    renameHybridItem,
    hideHybridIds,
    lockLayersForHybridIds,
    openTextEditor,
    textEditor,
    updateTextEditorValue,
    closeTextEditor,
    commitTextEditor,
    setImportNotice,
    bindingByBpmnId,
  };
}
