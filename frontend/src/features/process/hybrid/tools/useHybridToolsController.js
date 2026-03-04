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
} from "../actions/hybridTransform.js";
import {
  buildHybridElementAt,
  buildHybridGhost,
  getDefaultHybridSize,
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
  const pendingTransformRef = useRef(null);
  const toolRef = useRef("select");
  const arrowDraftRef = useRef(null);
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
    focusHybridOverlayFromEvent(event);
    markPlaybackOverlayInteraction?.({ action: "hybrid_v2_element_pointer", elementId });
    selectionApi.selectFromPointerEvent?.(elementId, event);
    if (modeEffective !== "edit" || uiLocked) return;
    const point = clientToDiagram(event?.clientX, event?.clientY);
    if (!point) return;
    const row = asObject(renderable.elementsById[elementId]);
    const rowLayer = asObject(layerById[toText(row.layer_id)]);
    if (!row.id) return;
    if (rowLayer.locked === true) {
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
        );
      },
    };
  }, [clientToDiagram, createEdge, layerById, markPlaybackOverlayInteraction, modeEffective, renderable.elementsById, setGenErr, setInfoMsg, uiLocked]);

  const onResizeHandlePointerDown = useCallback((event, elementIdRaw, handleRaw, selectionApi = {}) => {
    const elementId = toText(elementIdRaw);
    const handle = toText(handleRaw).toLowerCase();
    if (!elementId || !handle) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    focusHybridOverlayFromEvent(event);
    markPlaybackOverlayInteraction?.({ action: "hybrid_v2_resize_start", elementId, handle });
    if (modeEffective !== "edit" || uiLocked) return;
    const point = clientToDiagram(event?.clientX, event?.clientY);
    if (!point) return;
    const row = asObject(renderable.elementsById[elementId]);
    const rowLayer = asObject(layerById[toText(row.layer_id)]);
    if (!row.id) return;
    if (!canResizeHybridElement(row.type)) return;
    if (rowLayer.locked === true) {
      setInfoMsg?.(`Изменение размера недоступно: слой "${toText(rowLayer.name) || toText(row.layer_id) || "Hybrid"}" заблокирован.`);
      setGenErr?.("");
      return;
    }
    selectionApi.selectOnly?.(elementId);
    resizeRef.current = {
      id: elementId,
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
        );
      },
    };
  }, [clientToDiagram, layerById, markPlaybackOverlayInteraction, modeEffective, renderable.elementsById, setGenErr, setInfoMsg, uiLocked]);

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
    event?.preventDefault?.();
    event?.stopPropagation?.();
    focusHybridOverlayFromEvent(event);
    const point = clientToDiagram(event?.clientX, event?.clientY);
    if (!point) return;
    const activeLayerId = toText(asObject(hybridDocRef.current?.view).active_layer_id || "L1") || "L1";
    const activeLayer = asObject(layerById[activeLayerId]);
    if (activeLayer.locked === true) {
      setInfoMsg?.(`Создание недоступно: слой "${toText(activeLayer.name) || activeLayerId}" заблокирован.`);
      setGenErr?.("");
      return;
    }
    const tool = toText(toolRef.current).toLowerCase() || "select";
    markPlaybackOverlayInteraction?.({ action: "hybrid_v2_overlay_pointer", tool });
    if (tool === "rect" || tool === "note" || tool === "text" || tool === "container") {
      createElementAt(point, tool);
      return;
    }
    if (tool === "arrow") {
      arrowDraftRef.current = null;
      return;
    }
    selectionApi.clearSelection?.();
  }, [clientToDiagram, createElementAt, hybridDocRef, hybridVisible, layerById, markPlaybackOverlayInteraction, modeEffective, setGenErr, setInfoMsg, uiLocked]);

  const onOverlayPointerMove = useCallback((event) => {
    const rect = asObject(overlayRect);
    const localX = Number(event?.clientX || 0) - Number(rect.left || 0);
    const localY = Number(event?.clientY || 0) - Number(rect.top || 0);
    const point = clientToDiagram(event?.clientX, event?.clientY);
    const tool = toText(toolRef.current).toLowerCase() || "select";
    if (tool === "rect" || tool === "container") {
      setGhostPreview(buildDiagramGhostPreview(tool, point));
    } else {
      setGhostPreview(null);
    }
    const pending = asObject(arrowDraftRef.current);
    if (toText(pending.fromId) && point) {
      const localPoint = {
        x: localX,
        y: localY,
      };
      arrowDraftRef.current = {
        ...pending,
        pointer: localPoint,
      };
    }
  }, [clientToDiagram, overlayRect]);

  const onOverlayPointerLeave = useCallback(() => {
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
      queueElementTransform(
        elementId,
        {
          x: Number(rect.x || 0),
          y: Number(rect.y || 0),
          w: Number(rect.w || 0),
          h: Number(rect.h || 0),
        },
        source,
      );
    }, [queueElementTransform]),
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
    dragRef.current = null;
    resizeRef.current = null;
    textEditorRef.current = null;
    setGhostPreview(null);
    setContextMenu(null);
    setTextEditor(null);
  }, []);

  useEffect(() => () => {
    if (typeof window !== "undefined" && transformFrameRef.current) {
      window.cancelAnimationFrame(transformFrameRef.current);
      transformFrameRef.current = 0;
    }
  }, []);

  useEffect(() => {
    if (toolState === "rect" || toolState === "container") return;
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
