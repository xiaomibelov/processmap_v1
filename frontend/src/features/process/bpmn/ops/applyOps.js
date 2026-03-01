function asText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeKey(value) {
  return asText(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isConnection(element) {
  return !!element && Array.isArray(element?.waypoints);
}

function isShape(element) {
  return !!element && !Array.isArray(element?.waypoints) && String(element?.type || "") !== "label";
}

function elementName(element) {
  return asText(element?.businessObject?.name || element?.id || "");
}

function resolveElement(registry, ref, options = {}) {
  const token = asText(ref);
  if (!token || !registry) return null;

  const direct = registry.get(token);
  if (direct) return direct;

  const normalized = normalizeKey(token);
  const allowConnections = options.allowConnections === true;
  const elements = asArray(registry.getAll?.()).filter((element) => {
    if (!element || String(element?.type || "") === "label") return false;
    return allowConnections ? true : isShape(element);
  });

  let best = null;
  let bestScore = -1;
  elements.forEach((element) => {
    const idNorm = normalizeKey(element?.id);
    const nameNorm = normalizeKey(elementName(element));
    let score = -1;
    if (idNorm === normalized || nameNorm === normalized) score = 5;
    else if (nameNorm.startsWith(normalized) || idNorm.startsWith(normalized)) score = 4;
    else if (nameNorm.includes(normalized) || idNorm.includes(normalized)) score = 3;
    if (score > bestScore) {
      best = element;
      bestScore = score;
    }
  });

  return best;
}

function resolveLaneParent(registry, laneId, fallbackParent) {
  const laneRef = asText(laneId);
  if (!laneRef) return fallbackParent;
  const lane = resolveElement(registry, laneRef, { allowConnections: false });
  if (!lane) return fallbackParent;
  const type = String(lane?.businessObject?.$type || lane?.type || "").toLowerCase();
  if (!type.includes("lane")) return fallbackParent;
  return lane;
}

function resolveOwningLaneId(element) {
  let cur = element?.parent || null;
  while (cur) {
    const type = String(cur?.businessObject?.$type || cur?.type || "").toLowerCase();
    if (type.includes("lane")) return asText(cur?.id);
    cur = cur?.parent || null;
  }
  return "";
}

function sequenceConnectionsBetween(source, target) {
  return asArray(source?.outgoing).filter((connection) => {
    if (!isConnection(connection)) return false;
    const connType = String(connection?.businessObject?.$type || connection?.type || "").toLowerCase();
    if (!connType.includes("sequenceflow")) return false;
    return String(connection?.target?.id || "") === String(target?.id || "");
  });
}

function sequenceConnectionExists(source, target) {
  return sequenceConnectionsBetween(source, target)[0] || null;
}

function connectSequence(modeling, source, target, when = "") {
  if (!modeling || !source || !target) return null;
  const existing = sequenceConnectionExists(source, target);
  if (existing) {
    const label = asText(when);
    if (label) {
      try {
        modeling.updateLabel(existing, label);
      } catch {
      }
    }
    return existing;
  }
  try {
    const conn = modeling.connect(source, target, { type: "bpmn:SequenceFlow" });
    const label = asText(when);
    if (conn && label) {
      try {
        modeling.updateLabel(conn, label);
      } catch {
      }
    }
    return conn || null;
  } catch {
    return null;
  }
}

function createTaskShape({ modeling, elementFactory, registry, op, fallbackParent, fromElement, toElement }) {
  const parent = resolveLaneParent(registry, op?.laneId, fallbackParent);
  const source = fromElement || toElement || null;
  const sourceX = Number(source?.x || 160);
  const sourceY = Number(source?.y || 140);
  const sourceW = Number(source?.width || 120);
  const sourceH = Number(source?.height || 80);
  const isBetween = !!fromElement && !!toElement;

  const pos = isBetween
    ? {
        x: Math.round((Number(fromElement?.x || 0) + Number(toElement?.x || 0)) / 2 + 70),
        y: Math.round((Number(fromElement?.y || 0) + Number(toElement?.y || 0)) / 2 + 40),
      }
    : {
        x: Math.round(sourceX + sourceW + 220),
        y: Math.round(sourceY + sourceH / 2),
      };

  const type = asText(op?.typeId || op?.taskType || "bpmn:Task") || "bpmn:Task";
  const shape = modeling.createShape(elementFactory.createShape({ type }), pos, parent);
  const name = asText(op?.name || op?.newTaskName || "");
  if (name) {
    try {
      modeling.updateLabel(shape, name);
    } catch {
    }
  }
  return shape;
}

function applyRename(context, op) {
  const element = resolveElement(context.registry, op?.elementId, { allowConnections: true });
  const name = asText(op?.name);
  if (!element) return { ok: false, error: "element_not_found", changedIds: [] };
  if (!name) return { ok: false, error: "missing_name", changedIds: [] };
  try {
    context.modeling.updateLabel(element, name);
    return { ok: true, changedIds: [String(element.id || "")] };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || "rename_failed"), changedIds: [] };
  }
}

function applyAddTask(context, op) {
  const after = resolveElement(context.registry, op?.afterElementId, { allowConnections: false }) || context.selectedElement;
  const parent = after?.parent || context.canvas.getRootElement?.() || null;
  if (!parent) return { ok: false, error: "missing_parent", changedIds: [] };

  try {
    const task = createTaskShape({
      modeling: context.modeling,
      elementFactory: context.elementFactory,
      registry: context.registry,
      op,
      fallbackParent: parent,
      fromElement: after,
      toElement: null,
    });
    const changedIds = [String(task?.id || "")];
    if (after && isShape(after)) {
      const connection = connectSequence(context.modeling, after, task, asText(op?.when));
      if (connection) changedIds.push(String(connection.id || ""));
    }
    return { ok: true, changedIds };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || "add_task_failed"), changedIds: [] };
  }
}

function applyAddEndEvent(context, op) {
  const after = resolveElement(context.registry, op?.afterElementId, { allowConnections: false }) || context.selectedElement;
  const parent = after?.parent || context.canvas.getRootElement?.() || null;
  if (!after || !parent) return { ok: false, error: "missing_anchor_for_end", changedIds: [] };

  try {
    const endEvent = createTaskShape({
      modeling: context.modeling,
      elementFactory: context.elementFactory,
      registry: context.registry,
      op: {
        ...op,
        typeId: "bpmn:EndEvent",
        name: asText(op?.name || "Завершение"),
      },
      fallbackParent: parent,
      fromElement: after,
      toElement: null,
    });
    const changedIds = [String(endEvent?.id || "")];
    const connection = connectSequence(context.modeling, after, endEvent, asText(op?.when));
    if (connection) changedIds.push(String(connection.id || ""));
    return { ok: true, changedIds };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || "add_end_event_failed"), changedIds: [] };
  }
}

function applyConnect(context, op) {
  const from = resolveElement(context.registry, op?.fromId, { allowConnections: false });
  const to = resolveElement(context.registry, op?.toId, { allowConnections: false });
  if (!from || !to) {
    return { ok: false, error: "connect_nodes_not_found", changedIds: [] };
  }
  const connection = connectSequence(context.modeling, from, to, asText(op?.when));
  if (!connection) return { ok: false, error: "connect_failed", changedIds: [] };
  return {
    ok: true,
    changedIds: [String(from.id || ""), String(to.id || ""), String(connection.id || "")],
  };
}

function applyInsertBetween(context, op) {
  const from = resolveElement(context.registry, op?.fromId, { allowConnections: false });
  const to = resolveElement(context.registry, op?.toId, { allowConnections: false });
  if (!from || !to) {
    return { ok: false, error: "insert_nodes_not_found", changedIds: [] };
  }

  const parent = from?.parent || to?.parent || context.canvas.getRootElement?.() || null;
  if (!parent) return { ok: false, error: "missing_parent", changedIds: [] };

  const existingConnections = sequenceConnectionsBetween(from, to);
  if (!existingConnections.length) {
    return { ok: false, error: "edge_not_found", changedIds: [] };
  }

  const flowId = asText(op?.flowId);
  let targetConnection = null;
  if (flowId) {
    targetConnection = existingConnections.find((connection) => asText(connection?.id) === flowId) || null;
    if (!targetConnection) {
      return { ok: false, error: "flow_not_found", changedIds: [] };
    }
  } else if (existingConnections.length === 1) {
    targetConnection = existingConnections[0];
  } else {
    return { ok: false, error: "multiple_edges_ambiguous", changedIds: [] };
  }

  try {
    const existing = targetConnection;
    const preservedWhen = asText(op?.when || existing?.businessObject?.name || "");
    const laneId = asText(op?.laneId) || resolveOwningLaneId(to) || resolveOwningLaneId(from);
    const whenPolicy = asText(op?.whenPolicy || "to_first").toLowerCase();
    const whenForFirst = whenPolicy === "to_second" ? "" : preservedWhen;
    const whenForSecond = whenPolicy === "both" ? preservedWhen : "";

    context.modeling.removeConnection(existing);

    let task = null;
    let first = null;
    let second = null;
    const rollback = () => {
      try {
        if (first) context.modeling.removeConnection(first);
      } catch {
      }
      try {
        if (second) context.modeling.removeConnection(second);
      } catch {
      }
      try {
        if (task) context.modeling.removeShape(task);
      } catch {
      }
      try {
        connectSequence(context.modeling, from, to, preservedWhen);
      } catch {
      }
    };

    try {
      task = createTaskShape({
        modeling: context.modeling,
        elementFactory: context.elementFactory,
        registry: context.registry,
        op: {
          ...op,
          laneId,
          name: asText(op?.newTaskName || op?.name || ""),
        },
        fallbackParent: parent,
        fromElement: from,
        toElement: to,
      });

      first = connectSequence(context.modeling, from, task, whenForFirst);
      second = connectSequence(context.modeling, task, to, whenForSecond);
      if (!task || !first || !second) {
        rollback();
        return { ok: false, error: "insert_between_incomplete", changedIds: [] };
      }
    } catch {
      rollback();
      return { ok: false, error: "insert_between_failed", changedIds: [] };
    }
    const changedIds = [String(from.id || ""), String(task.id || ""), String(to.id || "")];
    if (first) changedIds.push(String(first.id || ""));
    if (second) changedIds.push(String(second.id || ""));
    return { ok: true, changedIds };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || "insert_between_failed"), changedIds: [] };
  }
}

function applyChangeType(context, op) {
  const element = resolveElement(context.registry, op?.elementId, { allowConnections: false });
  if (!element) return { ok: false, error: "element_not_found", changedIds: [] };

  const newType = asText(op?.newType);
  if (!newType) return { ok: false, error: "missing_new_type", changedIds: [] };

  if (String(element?.businessObject?.$type || element?.type || "") === newType) {
    return { ok: true, changedIds: [String(element.id || "")] };
  }

  const preserveBounds = op?.preserveBounds !== false;
  const oldName = asText(element?.businessObject?.name || "");
  const oldBounds = {
    x: Number(element?.x || 0),
    y: Number(element?.y || 0),
    width: Number(element?.width || 120),
    height: Number(element?.height || 80),
  };
  const parent = element?.parent || context.canvas.getRootElement?.() || null;
  if (!parent) return { ok: false, error: "missing_parent", changedIds: [] };

  const bpmnReplace = (() => {
    try {
      return context.modeler.get("bpmnReplace");
    } catch {
      return null;
    }
  })();

  try {
    let next = null;
    if (bpmnReplace && typeof bpmnReplace.replaceElement === "function") {
      next = bpmnReplace.replaceElement(element, { type: newType });
    } else {
      next = context.modeling.createShape(
        context.elementFactory.createShape({ type: newType }),
        {
          x: Math.round(oldBounds.x + oldBounds.width / 2),
          y: Math.round(oldBounds.y + oldBounds.height / 2),
        },
        parent,
      );
      const incoming = asArray(element?.incoming);
      const outgoing = asArray(element?.outgoing);
      incoming.forEach((connection) => {
        const src = connection?.source;
        if (!src) return;
        connectSequence(context.modeling, src, next, asText(connection?.businessObject?.name || ""));
      });
      outgoing.forEach((connection) => {
        const target = connection?.target;
        if (!target) return;
        connectSequence(context.modeling, next, target, asText(connection?.businessObject?.name || ""));
      });
      try {
        context.modeling.removeShape(element);
      } catch {
      }
    }

    if (!next) {
      return { ok: false, error: "change_type_failed", changedIds: [] };
    }

    if (oldName) {
      try {
        context.modeling.updateLabel(next, oldName);
      } catch {
      }
    }

    if (preserveBounds && typeof context.modeling.resizeShape === "function") {
      try {
        context.modeling.resizeShape(next, {
          x: oldBounds.x,
          y: oldBounds.y,
          width: oldBounds.width,
          height: oldBounds.height,
        });
      } catch {
      }
    }

    return { ok: true, changedIds: [String(next?.id || "")] };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || "change_type_failed"), changedIds: [] };
  }
}

function normalizeOp(raw) {
  const op = raw && typeof raw === "object" ? raw : {};
  const type = asText(op?.type || op?.op || op?.kind);
  return {
    ...op,
    type,
  };
}

export async function applyOpsToModeler(modeler, ops = [], options = {}) {
  if (!modeler) {
    return {
      ok: false,
      applied: 0,
      failed: asArray(ops).length,
      changedIds: [],
      results: [],
      error: "modeler_not_ready",
    };
  }

  const registry = modeler.get("elementRegistry");
  const modeling = modeler.get("modeling");
  const elementFactory = modeler.get("elementFactory");
  const canvas = modeler.get("canvas");

  const selectedElement = resolveElement(registry, options?.selectedElementId, { allowConnections: false });
  const context = {
    modeler,
    registry,
    modeling,
    elementFactory,
    canvas,
    selectedElement,
  };

  const changed = new Set();
  const results = [];
  let applied = 0;
  let failed = 0;

  for (const raw of asArray(ops)) {
    const op = normalizeOp(raw);
    let outcome = { ok: false, error: "unsupported_op", changedIds: [] };

    if (op.type === "addTask") outcome = applyAddTask(context, op);
    else if (op.type === "addEndEvent") outcome = applyAddEndEvent(context, op);
    else if (op.type === "rename") outcome = applyRename(context, op);
    else if (op.type === "connect") outcome = applyConnect(context, op);
    else if (op.type === "insertBetween") outcome = applyInsertBetween(context, op);
    else if (op.type === "changeType") outcome = applyChangeType(context, op);

    if (outcome.ok) applied += 1;
    else failed += 1;
    asArray(outcome.changedIds).forEach((id) => {
      const normalized = asText(id);
      if (normalized) changed.add(normalized);
    });

    results.push({
      type: op.type,
      ok: outcome.ok,
      error: asText(outcome.error),
      changedIds: asArray(outcome.changedIds),
    });
  }

  return {
    ok: applied > 0 && failed === 0,
    applied,
    failed,
    changedIds: Array.from(changed),
    results,
  };
}
