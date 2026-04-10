import {
  readTemplateNodeSemanticPayload,
  rehydrateSupportedBusinessObjectPayload,
  serializeSupportedBusinessObjectPayload,
} from "./templateSemanticPayload.js";

function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function toText(v) {
  return String(v || "").trim();
}

function isTemplateNodeType(typeRaw) {
  const type = String(typeRaw || "").trim().toLowerCase();
  if (!type) return false;
  if (type.includes("participant") || type.includes("lane")) return false;
  if (type === "bpmn:process" || type.endsWith(":process")) return false;
  if (type.includes("label")) return false;
  return true;
}

function isTemplateConnectionType(typeRaw) {
  const type = String(typeRaw || "").trim().toLowerCase();
  if (!type) return false;
  return type.includes("sequenceflow");
}

function isUnsupportedFragmentNodeType(typeRaw) {
  const type = String(typeRaw || "").trim().toLowerCase();
  if (!type) return false;
  if (type.includes("boundaryevent")) return true;
  return false;
}

function isSubprocessType(typeRaw) {
  return String(typeRaw || "").trim().toLowerCase().includes("subprocess");
}

function isLaneContainerType(typeRaw) {
  const type = String(typeRaw || "").trim().toLowerCase();
  if (!type) return false;
  return type.includes("lane") || type.includes("participant") || type.includes("process");
}

function isLaneType(typeRaw) {
  return String(typeRaw || "").trim().toLowerCase().includes("lane");
}

function isParticipantType(typeRaw) {
  return String(typeRaw || "").trim().toLowerCase().includes("participant");
}

function isProcessType(typeRaw) {
  const type = String(typeRaw || "").trim().toLowerCase();
  return type.includes("process") || type.includes("subprocess");
}

function hasSemanticFlowElements(el) {
  const bo = asObject(el?.businessObject);
  if (Array.isArray(bo.flowElements)) return true;
  if (bo.processRef && Array.isArray(bo.processRef.flowElements)) return true;
  return false;
}

function isSafeFlowParent(el) {
  const type = String(el?.businessObject?.$type || el?.type || "").trim();
  if (!type) return false;
  if (isLaneType(type)) return false;
  if (isParticipantType(type)) return true;
  if (isProcessType(type) && hasSemanticFlowElements(el)) return true;
  return false;
}

function readShapeBounds(el) {
  if (!el) return null;
  const x = Number(el?.x);
  const y = Number(el?.y);
  const width = Number(el?.width);
  const height = Number(el?.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function readElementType(el) {
  return String(el?.businessObject?.$type || el?.type || "").trim();
}

function readSelectionSnapshot(itemsRaw) {
  const items = asArray(itemsRaw);
  return items.map((el) => ({
    id: String(el?.id || "").trim(),
    type: readElementType(el),
    supportedNode: isTemplateNodeType(readElementType(el)),
    unsupportedFragmentNode: isUnsupportedFragmentNodeType(readElementType(el)),
  }));
}

function createElementIndex(allElementsRaw) {
  const index = new Map();
  asArray(allElementsRaw).forEach((entry) => {
    const id = toText(entry?.id);
    if (id) index.set(id, entry);
  });
  return index;
}

function findRegistryElementById(elementIndex, idRaw) {
  const id = toText(idRaw);
  if (!id) return null;
  return elementIndex.get(id) || null;
}

function sortTemplateNodes(nodesRaw) {
  return asArray(nodesRaw)
    .slice()
    .sort((aRaw, bRaw) => {
      const a = asObject(aRaw);
      const b = asObject(bRaw);
      return Number(a.nestingDepth || 0) - Number(b.nestingDepth || 0)
        || Number(a?.di?.x || 0) - Number(b?.di?.x || 0)
        || Number(a?.di?.y || 0) - Number(b?.di?.y || 0)
        || toText(a.id).localeCompare(toText(b.id));
    });
}

function sortTemplateEdges(edgesRaw) {
  return asArray(edgesRaw)
    .slice()
    .sort((aRaw, bRaw) => toText(aRaw?.id).localeCompare(toText(bRaw?.id)));
}

function buildTemplateEdgeItem(elementRaw, fallbackRaw = {}) {
  const element = asObject(elementRaw);
  const fallback = asObject(fallbackRaw);
  const bo = asObject(element.businessObject);
  const sourceId = toText(element?.source?.id || fallback?.sourceRef?.id);
  const targetId = toText(element?.target?.id || fallback?.targetRef?.id);
  if (!sourceId || !targetId) return null;
  return {
    id: toText(element.id || fallback.id),
    sourceId,
    targetId,
    when: toText(bo.name || fallback.name),
  };
}

function buildTemplateNodeItem(elementRaw, fallbackRaw = {}) {
  const element = asObject(elementRaw);
  const fallback = asObject(fallbackRaw);
  const bo = asObject(element.businessObject);
  const type = toText(bo.$type || element.type || fallback.$type || fallback.type || "bpmn:Task");
  const bounds = readShapeBounds(element) || {
    x: Number(fallback.x || 0),
    y: Number(fallback.y || 0),
    width: Math.max(24, Number(fallback.width || 140)),
    height: Math.max(24, Number(fallback.height || 80)),
  };
  return {
    id: toText(element.id || fallback.id),
    type,
    name: toText(bo.name || fallback.name),
    laneHint: "",
    semanticPayload: serializeSupportedBusinessObjectPayload(bo || fallback),
    di: {
      x: Number(bounds.x || 0),
      y: Number(bounds.y || 0),
      w: Number(bounds.width || 140),
      h: Number(bounds.height || 80),
    },
  };
}

function collectSubprocessSubtreeIntoPack(flowElementsRaw, state, context = {}) {
  const flowElements = asArray(flowElementsRaw);
  const elementIndex = context.elementIndex instanceof Map ? context.elementIndex : new Map();
  const parentNodeId = toText(context.parentNodeId);
  const nestingDepth = Math.max(1, Number(context.nestingDepth || 1));
  flowElements.forEach((entryRaw) => {
    const entry = asObject(entryRaw);
    const id = toText(entry.id);
    const type = toText(entry.$type || entry.type);
    if (!id || !type) return;
    state.sourceIds.add(id);
    const registryElement = findRegistryElementById(elementIndex, id);
    if (isTemplateConnectionType(type)) {
      if (state.seenEdges.has(id)) return;
      const edge = buildTemplateEdgeItem(registryElement, entry);
      if (!edge) return;
      state.seenEdges.add(id);
      state.edges.push(edge);
      return;
    }
    if (!isTemplateNodeType(type) || state.seenNodes.has(id)) return;
    state.seenNodes.add(id);
    state.nodes.push({
      ...buildTemplateNodeItem(registryElement, entry),
      laneHint: "",
      parentNodeId,
      nestingDepth,
    });
    if (isSubprocessType(type)) {
      collectSubprocessSubtreeIntoPack(entry.flowElements, state, {
        elementIndex,
        parentNodeId: id,
        nestingDepth: nestingDepth + 1,
      });
    }
  });
}

function buildSubprocessTemplatePack(inst, subprocessElement, options = {}, deps = {}) {
  const subprocess = asObject(subprocessElement);
  const subprocessId = toText(subprocess.id);
  if (!subprocessId) return null;
  const allElements = asArray(inst?.get?.("elementRegistry")?.getAll?.());
  const elementIndex = createElementIndex(allElements);
  const state = {
    nodes: [],
    edges: [],
    seenNodes: new Set(),
    seenEdges: new Set(),
    sourceIds: new Set([subprocessId]),
  };
  state.nodes.push({
    ...buildTemplateNodeItem(subprocessElement, subprocess.businessObject),
    laneHint: typeof deps.readLaneNameForElement === "function" ? deps.readLaneNameForElement(subprocessElement) : "",
    parentNodeId: "",
    nestingDepth: 0,
  });
  state.seenNodes.add(subprocessId);
  collectSubprocessSubtreeIntoPack(asObject(subprocess.businessObject).flowElements, state, {
    elementIndex,
    parentNodeId: subprocessId,
    nestingDepth: 1,
  });

  return {
    title: String(options?.title || "").trim() || createTemplateTitle([subprocessElement]),
    tags: ["subprocess", "subtree"],
    captureMode: "subprocess_subtree",
    sourceRootId: subprocessId,
    sourceDescriptorIds: Array.from(state.sourceIds),
    fragment: {
      nodes: sortTemplateNodes(state.nodes).filter((item) => toText(item.id)),
      edges: sortTemplateEdges(state.edges),
      annotations: [],
    },
    entryNodeId: subprocessId,
    exitNodeId: subprocessId,
    hints: {
      defaultLaneName: typeof deps.readLaneNameForElement === "function" ? deps.readLaneNameForElement(subprocessElement) : "",
      defaultActor: typeof deps.readLaneNameForElement === "function" ? deps.readLaneNameForElement(subprocessElement) : "",
      suggestedInsertMode: "after",
    },
    diagnostics: {
      subtreeSourceIds: Array.from(state.sourceIds),
      subtreeFlowElementCount: Math.max(0, state.sourceIds.size - 1),
    },
  };
}

function createTemplateTitle(selectedNodes) {
  const first = selectedNodes[0] || null;
  const firstName = String(first?.businessObject?.name || first?.id || "").trim();
  if (firstName) return `Шаблон: ${firstName}`;
  return `Шаблон ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

function selectTemplateNodes(inst, deps = {}) {
  if (!inst) return [];
  const isShapeElement = typeof deps.isShapeElement === "function"
    ? deps.isShapeElement
    : () => true;
  try {
    const selection = inst.get("selection");
    const selected = asArray(selection?.get?.());
    return selected.filter((el) => {
      if (!isShapeElement(el)) return false;
      const type = String(el?.businessObject?.$type || el?.type || "");
      return isTemplateNodeType(type);
    });
  } catch {
    return [];
  }
}

function readLaneMap(inst, deps = {}) {
  const map = new Map();
  if (!inst) return map;
  const isShapeElement = typeof deps.isShapeElement === "function"
    ? deps.isShapeElement
    : () => true;
  try {
    const registry = inst.get("elementRegistry");
    const all = asArray(registry?.getAll?.());
    all.forEach((item) => {
      if (!isShapeElement(item)) return;
      const bo = asObject(item?.businessObject);
      const type = String(bo?.$type || item?.type || "").trim().toLowerCase();
      if (!type.includes("lane")) return;
      const laneName = String(bo?.name || item?.id || "").trim().toLowerCase();
      if (!laneName) return;
      map.set(laneName, item);
    });
  } catch {
  }
  return map;
}

function connectSequenceFlow(modeling, source, target, when = "") {
  if (!modeling || !source || !target) return null;
  try {
    const conn = modeling.connect(source, target, { type: "bpmn:SequenceFlow" });
    const label = String(when || "").trim();
    if (conn && label) modeling.updateLabel(conn, label);
    return conn || null;
  } catch {
    return null;
  }
}

function readPoint(raw) {
  const point = asObject(raw);
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function isPointInsideBounds(point, bounds) {
  if (!point || !bounds) return false;
  return point.x >= bounds.x
    && point.x <= (bounds.x + bounds.width)
    && point.y >= bounds.y
    && point.y <= (bounds.y + bounds.height);
}

function findShapeAtPoint(elements, point, predicate = () => true) {
  if (!point) return null;
  const candidates = asArray(elements)
    .filter((el) => predicate(el))
    .map((el) => ({ el, bounds: readShapeBounds(el) }))
    .filter((row) => !!row.bounds && isPointInsideBounds(point, row.bounds))
    .sort((a, b) => {
      const aArea = Number(a.bounds.width || 0) * Number(a.bounds.height || 0);
      const bArea = Number(b.bounds.width || 0) * Number(b.bounds.height || 0);
      return aArea - bArea;
    });
  return candidates[0]?.el || null;
}

export function resolveGraphicalInsertParent(hitElement, canvasRoot = null) {
  const visited = new Set();
  let cursor = hitElement || null;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    if (isSafeFlowParent(cursor)) return cursor;
    const type = String(cursor?.businessObject?.$type || cursor?.type || "").trim();
    if (isLaneType(type)) {
      cursor = cursor?.parent || null;
      continue;
    }
    cursor = cursor?.parent || null;
  }
  if (isSafeFlowParent(canvasRoot)) return canvasRoot;
  return canvasRoot || null;
}

function findFirstSafeFlowParent(root) {
  const queue = root ? [root] : [];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    if (isSafeFlowParent(current)) return current;
    asArray(current?.children).forEach((child) => {
      if (child && !visited.has(child)) queue.push(child);
    });
  }
  return null;
}

function resolveCreateShapeParent(candidate, canvasRoot = null) {
  const resolved = resolveGraphicalInsertParent(candidate, canvasRoot);
  if (isSafeFlowParent(resolved)) return resolved;
  const fromRootChildren = findFirstSafeFlowParent(canvasRoot);
  if (isSafeFlowParent(fromRootChildren)) return fromRootChildren;
  return isSafeFlowParent(canvasRoot) ? canvasRoot : null;
}

export function createTemplatePackAdapter(deps = {}) {
  const ensureModeler = typeof deps.ensureModeler === "function" ? deps.ensureModeler : null;
  const getModeler = typeof deps.getModeler === "function" ? deps.getModeler : null;
  const emitDiagramMutation = typeof deps.emitDiagramMutation === "function"
    ? deps.emitDiagramMutation
    : () => {};
  const logPackDebug = typeof deps.logPackDebug === "function" ? deps.logPackDebug : () => {};
  const getSessionId = typeof deps.getSessionId === "function" ? deps.getSessionId : () => "";
  const readLaneNameForElement = typeof deps.readLaneNameForElement === "function"
    ? deps.readLaneNameForElement
    : () => "";
  const isShapeElement = typeof deps.isShapeElement === "function"
    ? deps.isShapeElement
    : () => true;
  const isConnectionElement = typeof deps.isConnectionElement === "function"
    ? deps.isConnectionElement
    : () => false;

  function captureTemplatePackOnModeler(inst, options = {}) {
    if (!inst) return { ok: false, error: "modeler_not_ready" };
    let rawSelection = [];
    try {
      rawSelection = asArray(inst.get("selection")?.get?.());
    } catch {
      rawSelection = [];
    }

    const selectionSnapshot = readSelectionSnapshot(rawSelection);
    const selectedNodes = selectTemplateNodes(inst, { isShapeElement });
    if (!selectedNodes.length) {
      return {
        ok: false,
        error: "no_selection",
        diagnostics: {
          rawSelection: selectionSnapshot,
          normalizedSelection: [],
          unsupportedSelectionTypes: selectionSnapshot
            .filter((row) => row.unsupportedFragmentNode)
            .map((row) => row.type)
            .filter(Boolean),
        },
      };
    }

    if (selectedNodes.length === 1 && isSubprocessType(readElementType(selectedNodes[0]))) {
      const subprocessPack = buildSubprocessTemplatePack(inst, selectedNodes[0], options, {
        readLaneNameForElement,
      });
      if (subprocessPack) {
        logPackDebug("capture", {
          sid: String(getSessionId() || "-"),
          selectedNodes: subprocessPack.fragment.nodes.length,
          selectedEdges: subprocessPack.fragment.edges.length,
          entry: subprocessPack.entryNodeId || "-",
          exit: subprocessPack.exitNodeId || "-",
          captureMode: subprocessPack.captureMode,
        });
        return {
          ok: true,
          pack: subprocessPack,
          diagnostics: {
            rawSelection: selectionSnapshot,
            normalizedSelection: subprocessPack.fragment.nodes.map((node) => ({
              id: toText(node.id),
              type: toText(node.type),
              laneHint: toText(node.laneHint),
            })),
            unsupportedSelectionTypes: selectionSnapshot
              .filter((row) => row.unsupportedFragmentNode)
              .map((row) => row.type)
              .filter(Boolean),
          },
        };
      }
    }

    const selectedIds = new Set(selectedNodes.map((el) => String(el?.id || "").trim()).filter(Boolean));
    const registry = inst.get("elementRegistry");
    const all = asArray(registry?.getAll?.());
    const selectedEdges = all
      .filter((el) => {
        if (!isConnectionElement(el)) return false;
        const type = String(el?.businessObject?.$type || el?.type || "");
        if (!isTemplateConnectionType(type)) return false;
        const sourceId = String(el?.source?.id || "").trim();
        const targetId = String(el?.target?.id || "").trim();
        return selectedIds.has(sourceId) && selectedIds.has(targetId);
      })
      .sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || "")));

    const nodeItems = selectedNodes
      .map((el) => {
        const type = String(el?.businessObject?.$type || el?.type || "bpmn:Task");
        const bounds = readShapeBounds(el) || { x: 0, y: 0, width: 140, height: 80 };
        const bo = asObject(el?.businessObject);
        return {
          id: String(el?.id || ""),
          type,
          name: String(bo?.name || "").trim(),
          laneHint: readLaneNameForElement(el),
          semanticPayload: serializeSupportedBusinessObjectPayload(bo),
          di: {
            x: Number(bounds.x || 0),
            y: Number(bounds.y || 0),
            w: Number(bounds.width || 140),
            h: Number(bounds.height || 80),
          },
        };
      })
      .filter((item) => item.id)
      .sort((a, b) => Number(a.di.x || 0) - Number(b.di.x || 0) || Number(a.di.y || 0) - Number(b.di.y || 0));

    const edgeItems = selectedEdges.map((edge) => ({
      id: String(edge?.id || ""),
      sourceId: String(edge?.source?.id || ""),
      targetId: String(edge?.target?.id || ""),
      when: String(edge?.businessObject?.name || "").trim(),
    }));

    const incomingCount = new Map();
    const outgoingCount = new Map();
    nodeItems.forEach((node) => {
      incomingCount.set(node.id, 0);
      outgoingCount.set(node.id, 0);
    });
    edgeItems.forEach((edge) => {
      incomingCount.set(edge.targetId, Number(incomingCount.get(edge.targetId) || 0) + 1);
      outgoingCount.set(edge.sourceId, Number(outgoingCount.get(edge.sourceId) || 0) + 1);
    });

    const entryCandidates = nodeItems.filter((node) => Number(incomingCount.get(node.id) || 0) === 0);
    const exitCandidates = nodeItems.filter((node) => Number(outgoingCount.get(node.id) || 0) === 0);
    const entryNode = entryCandidates[0] || nodeItems[0] || null;
    const exitNode = exitCandidates[0] || nodeItems[nodeItems.length - 1] || null;

    const laneHint = String(entryNode?.laneHint || exitNode?.laneHint || "").trim();
    const tags = new Set();
    nodeItems.forEach((node) => {
      const normalizedType = String(node.type || "").toLowerCase();
      if (normalizedType.includes("task")) tags.add("task");
      if (normalizedType.includes("event")) tags.add("event");
      if (node.laneHint) tags.add(String(node.laneHint).trim().toLowerCase());
    });

    const pack = {
      title: String(options?.title || "").trim() || createTemplateTitle(selectedNodes),
      tags: Array.from(tags),
      fragment: {
        nodes: nodeItems,
        edges: edgeItems,
        annotations: [],
      },
      entryNodeId: String(entryNode?.id || ""),
      exitNodeId: String(exitNode?.id || ""),
      hints: {
        defaultLaneName: laneHint,
        defaultActor: laneHint,
        suggestedInsertMode: "after",
      },
    };

    logPackDebug("capture", {
      sid: String(getSessionId() || "-"),
      selectedNodes: nodeItems.length,
      selectedEdges: edgeItems.length,
      entry: pack.entryNodeId || "-",
      exit: pack.exitNodeId || "-",
    });
    return {
      ok: true,
      pack,
      diagnostics: {
        rawSelection: selectionSnapshot,
        normalizedSelection: nodeItems.map((node) => ({
          id: String(node.id || "").trim(),
          type: String(node.type || "").trim(),
          laneHint: String(node.laneHint || "").trim(),
        })),
        unsupportedSelectionTypes: selectionSnapshot
          .filter((row) => row.unsupportedFragmentNode)
          .map((row) => row.type)
          .filter(Boolean),
      },
    };
  }

  async function insertTemplatePackOnModeler(payload = {}) {
    const inst = (getModeler ? getModeler() : null) || (ensureModeler ? await ensureModeler() : null);
    if (!inst) return { ok: false, error: "modeler_not_ready" };
    const pack = payload?.pack && typeof payload.pack === "object" ? payload.pack : null;
    if (!pack) return { ok: false, error: "missing_pack" };

    const modeling = inst.get("modeling");
    const elementFactory = inst.get("elementFactory");
    const moddle = inst.get("moddle");
    const canvas = inst.get("canvas");
    const registry = inst.get("elementRegistry");
    const laneMap = readLaneMap(inst, { isShapeElement });
    const allElements = asArray(registry?.getAll?.()).filter((el) => isShapeElement(el));
    const anchorPayload = asObject(payload?.anchor);
    const anchorPoint = readPoint(anchorPayload?.point);
    const anchorById = toText(anchorPayload?.elementId) ? registry?.get?.(toText(anchorPayload.elementId)) : null;
    const selectedNodes = selectTemplateNodes(inst, { isShapeElement });
    const anchorByPoint = findShapeAtPoint(
      allElements,
      anchorPoint,
      (el) => {
        const type = String(el?.businessObject?.$type || el?.type || "");
        return isTemplateNodeType(type);
      },
    );
    const preferPointAnchor = payload?.preferPointAnchor === true;
    const anchor = anchorById
      || (preferPointAnchor ? (anchorByPoint || selectedNodes[0] || null) : (selectedNodes[0] || anchorByPoint || null));
    const parentByIdRaw = toText(anchorPayload?.parentId) ? registry?.get?.(toText(anchorPayload.parentId)) : null;
    const parentByPoint = findShapeAtPoint(
      allElements,
      anchorPoint,
      (el) => {
        const type = String(el?.businessObject?.$type || el?.type || "");
        return isLaneContainerType(type);
      },
    );
    const canvasRoot = canvas?.getRootElement?.() || null;

    // Guard: bpmn-js's BpmnUpdater.updateDiParent() calls
    // `BPMNPlane.get('planeElement').push(di)` but bpmn-moddle does NOT
    // initialize the `planeElement` collection when the plane has no shapes
    // (i.e. the array is `undefined`, not `[]`).  On empty/new sessions this
    // causes "Cannot read properties of undefined (reading 'push')".
    // Fix: ensure the root plane's planeElement array exists before any
    // modeling.createShape() call.  Direct property assignment is safe here
    // because bpmn-moddle falls back to own-property reads for collections.
    const canvasRootDi = canvasRoot?.di;
    if (canvasRootDi && !Array.isArray(canvasRootDi.planeElement)) {
      canvasRootDi.planeElement = [];
    }

    const parentById = resolveCreateShapeParent(parentByIdRaw, canvasRoot);
    const pointParent = resolveCreateShapeParent(parentByPoint, canvasRoot);
    const anchorParent = resolveCreateShapeParent(anchor?.parent || null, canvasRoot);
    const defaultParent = resolveCreateShapeParent(canvasRoot, canvasRoot);
    const insertParent = parentById || pointParent || anchorParent || defaultParent || canvasRoot || null;
    const laneParentResolved = !!(parentByPoint && pointParent && parentByPoint !== pointParent);
    const parentFallbackUsed = !insertParent || insertParent === canvasRoot;
    if (!insertParent) return { ok: false, error: "anchor_parent_missing" };
    const safeLaneParentByName = new Map();
    laneMap.forEach((laneEl, key) => {
      safeLaneParentByName.set(key, resolveCreateShapeParent(laneEl, insertParent) || insertParent);
    });
    const safeAnchorParent = resolveCreateShapeParent(anchor?.parent || null, insertParent) || insertParent;

    const modeRaw = String(payload?.mode || "after").trim();
    const mode = modeRaw === "between" && anchor ? "between" : "after";
    const nodes = sortTemplateNodes(asArray(pack?.fragment?.nodes).filter((node) => String(node?.id || "").trim()));
    const edges = asArray(pack?.fragment?.edges).filter((edge) => String(edge?.sourceId || "").trim() && String(edge?.targetId || "").trim());
    if (!nodes.length) return { ok: false, error: "empty_pack" };
    const minX = Math.min(...nodes.map((node) => Number(node?.di?.x || 0)));
    const minY = Math.min(...nodes.map((node) => Number(node?.di?.y || 0)));
    const offsetX = anchor
      ? Number(anchor?.x || 0) + Number(anchor?.width || 0) + 220
      : Number(anchorPoint?.x || 0) + 80;
    const offsetY = anchor
      ? Number(anchor?.y || 0) - 16
      : Number(anchorPoint?.y || 0) - 16;

    const createdNodeMap = {};
    const remap = {};
    const createdNodes = [];

    for (const node of nodes) {
      const type = String(node?.type || "bpmn:Task").trim() || "bpmn:Task";
      if (!isTemplateNodeType(type)) continue;
      const laneHint = String(node?.laneHint || "").trim().toLowerCase();
      const parentNodeId = toText(node?.parentNodeId);
      const nestedParent = parentNodeId ? createdNodeMap[parentNodeId] : null;
      const parent = nestedParent
        || (laneHint && safeLaneParentByName.get(laneHint)
          ? safeLaneParentByName.get(laneHint)
          : safeAnchorParent);
      const shapeAttrs = { type };
      const width = Number(node?.di?.w);
      const height = Number(node?.di?.h);
      if (width > 0) shapeAttrs.width = width;
      if (height > 0) shapeAttrs.height = height;
      if (isSubprocessType(type)) shapeAttrs.isExpanded = true;
      const relX = Number(node?.di?.x || 0) - minX;
      const relY = Number(node?.di?.y || 0) - minY;
      const shape = modeling.createShape(
        elementFactory.createShape(shapeAttrs),
        {
          x: Math.round(offsetX + relX),
          y: Math.round(offsetY + relY),
        },
        parent,
      );
      const label = String(node?.name || "").trim();
      if (label) modeling.updateLabel(shape, label);
      rehydrateSupportedBusinessObjectPayload(
        shape?.businessObject,
        readTemplateNodeSemanticPayload(node),
        { moddle },
      );
      const oldId = String(node?.id || "");
      createdNodeMap[oldId] = shape;
      remap[oldId] = String(shape?.id || "");
      createdNodes.push(shape);
    }

    if (!createdNodes.length) return { ok: false, error: "nothing_created" };

    const createdEdges = [];
    for (const edge of edges) {
      const source = createdNodeMap[String(edge?.sourceId || "")];
      const target = createdNodeMap[String(edge?.targetId || "")];
      if (!source || !target) continue;
      const conn = connectSequenceFlow(modeling, source, target, edge?.when);
      if (!conn) continue;
      const oldId = String(edge?.id || "");
      remap[oldId] = String(conn?.id || "");
      createdEdges.push(conn);
    }

    const firstNode = createdNodes[0] || null;
    const lastNode = createdNodes[createdNodes.length - 1] || null;
    const entryShape = createdNodeMap[String(pack?.entryNodeId || "")] || firstNode;
    const exitShape = createdNodeMap[String(pack?.exitNodeId || "")] || lastNode;
    if (!entryShape || !exitShape) return { ok: false, error: "entry_or_exit_missing" };

    let nextTarget = null;
    if (mode === "between") {
      const outgoing = asArray(anchor?.outgoing).find((conn) => {
        if (!isConnectionElement(conn)) return false;
        const type = String(conn?.businessObject?.$type || conn?.type || "");
        if (!isTemplateConnectionType(type)) return false;
        return !!conn?.target && String(conn?.target?.id || "") !== String(entryShape?.id || "");
      });
      if (outgoing?.target) {
        nextTarget = outgoing.target;
        try {
          modeling.removeConnection(outgoing);
        } catch {
        }
      }
    }

    if (anchor) {
      connectSequenceFlow(modeling, anchor, entryShape);
    }
    if (mode === "between" && nextTarget) {
      connectSequenceFlow(modeling, exitShape, nextTarget);
    }

    logPackDebug("insert", {
      sid: String(getSessionId() || "-"),
      mode,
      packId: String(pack?.packId || "-"),
      anchorId: String(anchor?.id || "-"),
      anchorByPoint: anchor ? 0 : 1,
      laneParentResolved: laneParentResolved ? 1 : 0,
      parentFallbackUsed: parentFallbackUsed ? 1 : 0,
      createdNodes: createdNodes.length,
      createdEdges: createdEdges.length,
      rewiredNext: nextTarget ? 1 : 0,
    });
    emitDiagramMutation("diagram.template_insert", {
      mode,
      pack_id: String(pack?.packId || ""),
      created_nodes: createdNodes.length,
      created_edges: createdEdges.length,
    });

    return {
      ok: true,
      mode,
      remap,
      createdNodes: createdNodes.length,
      createdEdges: createdEdges.length,
      entryNodeId: String(entryShape?.id || ""),
      exitNodeId: String(exitShape?.id || ""),
      anchorId: String(anchor?.id || ""),
      anchorByPoint: !anchor,
      laneParentResolved,
      parentFallbackUsed,
    };
  }

  return {
    captureTemplatePackOnModeler,
    insertTemplatePackOnModeler,
  };
}

export default createTemplatePackAdapter;
