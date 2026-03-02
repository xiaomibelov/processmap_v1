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
  if (type.includes("participant") || type.includes("lane") || type.includes("process")) return false;
  if (type.includes("label")) return false;
  return true;
}

function isTemplateConnectionType(typeRaw) {
  const type = String(typeRaw || "").trim().toLowerCase();
  if (!type) return false;
  return type.includes("sequenceflow");
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
    const selectedNodes = selectTemplateNodes(inst, { isShapeElement });
    if (!selectedNodes.length) {
      return { ok: false, error: "no_selection" };
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
        return {
          id: String(el?.id || ""),
          type,
          name: String(el?.businessObject?.name || "").trim(),
          laneHint: readLaneNameForElement(el),
          propsMinimal: {},
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
    return { ok: true, pack };
  }

  async function insertTemplatePackOnModeler(payload = {}) {
    const inst = (getModeler ? getModeler() : null) || (ensureModeler ? await ensureModeler() : null);
    if (!inst) return { ok: false, error: "modeler_not_ready" };
    const pack = payload?.pack && typeof payload.pack === "object" ? payload.pack : null;
    if (!pack) return { ok: false, error: "missing_pack" };

    const nodes = asArray(pack?.fragment?.nodes).filter((node) => String(node?.id || "").trim());
    const edges = asArray(pack?.fragment?.edges).filter((edge) => String(edge?.sourceId || "").trim() && String(edge?.targetId || "").trim());
    if (!nodes.length) return { ok: false, error: "empty_pack" };

    const selectedNodes = selectTemplateNodes(inst, { isShapeElement });
    const anchor = selectedNodes[0] || null;
    if (!anchor) return { ok: false, error: "anchor_required" };

    const modeling = inst.get("modeling");
    const elementFactory = inst.get("elementFactory");
    const canvas = inst.get("canvas");
    const laneMap = readLaneMap(inst, { isShapeElement });
    const anchorParent = anchor?.parent || canvas?.getRootElement?.() || null;
    if (!anchorParent) return { ok: false, error: "anchor_parent_missing" };

    const mode = String(payload?.mode || "after").trim() === "between" ? "between" : "after";
    const minX = Math.min(...nodes.map((node) => Number(node?.di?.x || 0)));
    const minY = Math.min(...nodes.map((node) => Number(node?.di?.y || 0)));
    const offsetX = Number(anchor?.x || 0) + Number(anchor?.width || 0) + 220;
    const offsetY = Number(anchor?.y || 0) - 16;

    const createdNodeMap = {};
    const remap = {};
    const createdNodes = [];

    for (const node of nodes) {
      const type = String(node?.type || "bpmn:Task").trim() || "bpmn:Task";
      if (!isTemplateNodeType(type)) continue;
      const laneHint = String(node?.laneHint || "").trim().toLowerCase();
      const parent = laneHint && laneMap.get(laneHint) ? laneMap.get(laneHint) : anchorParent;
      const relX = Number(node?.di?.x || 0) - minX;
      const relY = Number(node?.di?.y || 0) - minY;
      const shape = modeling.createShape(
        elementFactory.createShape({ type }),
        {
          x: Math.round(offsetX + relX),
          y: Math.round(offsetY + relY),
        },
        parent,
      );
      const label = String(node?.name || "").trim();
      if (label) modeling.updateLabel(shape, label);
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

    connectSequenceFlow(modeling, anchor, entryShape);
    if (mode === "between" && nextTarget) {
      connectSequenceFlow(modeling, exitShape, nextTarget);
    }

    logPackDebug("insert", {
      sid: String(getSessionId() || "-"),
      mode,
      packId: String(pack?.packId || "-"),
      anchorId: String(anchor?.id || "-"),
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
    };
  }

  return {
    captureTemplatePackOnModeler,
    insertTemplatePackOnModeler,
  };
}

export default createTemplatePackAdapter;
