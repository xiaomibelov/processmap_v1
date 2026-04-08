import buildSubprocessPreview from "./executor/buildSubprocessPreview.js";
import {
  canCopyBpmnElement,
  copyBpmnElementToClipboard,
  hasCopiedBpmnElementSnapshot,
  pasteCopiedBpmnElementFromClipboard,
  readCopiedBpmnElementSnapshot,
  resolveBpmnPastePoint,
} from "../copy-paste/bpmnElementClipboard.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

const MODDLE_CLONE_EXCLUDED_KEYS = new Set([
  "$parent",
  "parent",
  "businessObject",
  "source",
  "target",
  "sourceRef",
  "targetRef",
  "incoming",
  "outgoing",
  "di",
  "labelTarget",
  "labels",
  "children",
  "flowElements",
  "laneSet",
  "lanes",
  "processRef",
  "rootElements",
  "collaborationRef",
  "participants",
]);

function setBpmnProperty(target, key, value) {
  if (!target) return;
  if (typeof target.set === "function") {
    target.set(key, value);
    return;
  }
  target[key] = value;
}

function cloneBpmnModdleValue(value, moddle, seen = new WeakMap()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => cloneBpmnModdleValue(item, moddle, seen))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== "object") return undefined;
  if (seen.has(value)) return seen.get(value);

  const type = toText(value?.$type || value?.type);
  const canCreateModdle = !!(type && moddle && typeof moddle.create === "function");
  const out = canCreateModdle ? moddle.create(type) : {};
  seen.set(value, out);

  Object.keys(value).forEach((key) => {
    if (!key || key === "$type" || MODDLE_CLONE_EXCLUDED_KEYS.has(key)) return;
    const item = value[key];
    if (typeof item === "function") return;
    const cloned = cloneBpmnModdleValue(item, moddle, seen);
    if (cloned !== undefined) {
      setBpmnProperty(out, key, cloned);
    }
  });

  if (!canCreateModdle && type) {
    out.$type = type;
  }
  return out;
}

function isConnectionElement(el) {
  return !!el && Array.isArray(el?.waypoints);
}

function hasShapeBounds(el) {
  if (!el || typeof el !== "object") return false;
  if (isConnectionElement(el)) return false;
  const x = Number(el?.x);
  const y = Number(el?.y);
  const width = Number(el?.width);
  const height = Number(el?.height);
  return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0;
}

function readElementType(el) {
  return String(el?.businessObject?.$type || el?.type || "").trim().toLowerCase();
}

function isLaneType(typeRaw) {
  return String(typeRaw || "").trim().toLowerCase().includes("lane");
}

function isParticipantType(typeRaw) {
  return String(typeRaw || "").trim().toLowerCase().includes("participant");
}

function isProcessType(typeRaw) {
  const type = String(typeRaw || "").trim().toLowerCase();
  return type.includes("process");
}

function hasSemanticFlowElements(el) {
  const bo = asObject(el?.businessObject);
  if (Array.isArray(bo.flowElements)) return true;
  if (bo.processRef && Array.isArray(bo.processRef.flowElements)) return true;
  return false;
}

function normalizeDocumentationRows(rawRows) {
  return asArray(rawRows)
    .map((rowRaw) => {
      const row = asObject(rowRaw);
      const text = String(
        Object.prototype.hasOwnProperty.call(row, "text")
          ? row.text
          : (Object.prototype.hasOwnProperty.call(row, "value") ? row.value : rowRaw),
      );
      const textFormat = toText(row?.textFormat || row?.textformat);
      if (!text.trim() && !textFormat) return null;
      return { text, textFormat };
    })
    .filter(Boolean);
}

function readDocumentationRowsFromElement(element) {
  const docs = asArray(element?.businessObject?.documentation);
  return docs
    .map((docRaw) => {
      const doc = asObject(docRaw);
      const text = String(doc?.text ?? "");
      const textFormat = toText(doc?.textFormat || doc?.textformat);
      if (!text.trim() && !textFormat) return null;
      return { text, textFormat };
    })
    .filter(Boolean);
}

function readExtensionPropertiesFromElement(element) {
  const ext = asObject(element?.businessObject?.extensionElements);
  const values = asArray(ext?.values);
  const rows = [];
  values.forEach((containerRaw, containerIndex) => {
    const container = asObject(containerRaw);
    const containerType = toText(container?.$type || container?.type || "");
    const normalized = containerType.toLowerCase();
    if (!normalized.endsWith(":properties")) return;
    const props = asArray(container?.values);
    props.forEach((propRaw, propIndex) => {
      const prop = asObject(propRaw);
      const name = toText(prop?.name || prop?.key || prop?.id);
      if (!name) return;
      rows.push({
        key: `${containerIndex}:${propIndex}:${name}`,
        containerIndex,
        propIndex,
        name,
        value: String(prop?.value ?? ""),
        containerType,
      });
    });
  });
  return rows;
}

function readRobotMetaFromElement(element) {
  const ext = asObject(element?.businessObject?.extensionElements);
  const values = asArray(ext?.values);
  const rows = [];
  values.forEach((entryRaw) => {
    const entry = asObject(entryRaw);
    const type = toText(entry?.$type || entry?.type || "");
    if (!type.toLowerCase().startsWith("pm:")) return;
    Object.keys(entry).forEach((keyRaw) => {
      const key = toText(keyRaw);
      if (!key || key.startsWith("$")) return;
      if (key === "id" || key === "values" || key === "extensionElements") return;
      const value = entry[key];
      if (value === null || value === undefined || typeof value === "function") return;
      if (typeof value === "object") return;
      const textValue = String(value);
      if (!textValue.trim()) return;
      rows.push({ key, value: textValue, sourceType: type });
    });
  });
  return rows;
}

function buildPropertiesOverlayPayload(element) {
  if (!element) return null;
  const bo = asObject(element?.businessObject);
  return {
    elementId: toText(element?.id),
    elementName: toText(bo?.name || element?.id),
    bpmnType: toText(bo?.$type || element?.type),
    documentation: readDocumentationRowsFromElement(element),
    extensionProperties: readExtensionPropertiesFromElement(element),
    robotMeta: readRobotMetaFromElement(element),
  };
}

function updateElementName(modeling, element, nameRaw) {
  const name = String(nameRaw ?? "");
  if (!modeling || !element) return { ok: false, error: "target_not_found" };
  try {
    if (typeof modeling.updateLabel === "function") {
      modeling.updateLabel(element, name);
      return { ok: true };
    }
  } catch {
  }
  try {
    if (typeof modeling.updateProperties === "function") {
      modeling.updateProperties(element, { name });
      return { ok: true };
    }
  } catch (error) {
    return { ok: false, error: toText(error?.message || error || "rename_failed") || "rename_failed" };
  }
  return { ok: false, error: "rename_unavailable" };
}

function updateElementDocumentation({
  inst,
  modeling,
  element,
  documentationRowsRaw,
}) {
  if (!modeling || typeof modeling.updateProperties !== "function") {
    return { ok: false, error: "update_properties_unavailable" };
  }
  const rows = normalizeDocumentationRows(documentationRowsRaw);
  const moddle = inst?.get?.("moddle");
  const documentation = rows.map((row) => {
    const attrs = { text: String(row?.text ?? "") };
    if (toText(row?.textFormat)) attrs.textFormat = toText(row.textFormat);
    if (moddle && typeof moddle.create === "function") {
      try {
        return moddle.create("bpmn:Documentation", attrs);
      } catch {
      }
    }
    return { $type: "bpmn:Documentation", ...attrs };
  });
  try {
    modeling.updateProperties(element, { documentation });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: toText(error?.message || error || "set_documentation_failed") || "set_documentation_failed",
    };
  }
}

function updateExtensionPropertyValue({
  inst,
  modeling,
  element,
  propertyNameRaw,
  propertyKeyRaw,
  nextValueRaw,
}) {
  if (!modeling || typeof modeling.updateProperties !== "function") {
    return { ok: false, error: "update_properties_unavailable" };
  }
  const propertyKey = toText(propertyKeyRaw);
  const propertyName = toText(propertyNameRaw);
  if (!propertyKey && !propertyName) return { ok: false, error: "missing_property_name" };
  const bo = asObject(element?.businessObject);
  const ext = bo?.extensionElements || null;
  if (!ext) return { ok: false, error: "extension_property_not_found" };

  const moddle = inst?.get?.("moddle");
  const nextExt = cloneBpmnModdleValue(ext, moddle);
  const values = asArray(nextExt?.values);
  let found = false;
  values.forEach((containerRaw, containerIndex) => {
    const container = asObject(containerRaw);
    const type = toText(container?.$type || container?.type || "").toLowerCase();
    if (!type.endsWith(":properties")) return;
    asArray(container?.values).forEach((propRaw, propIndex) => {
      const prop = asObject(propRaw);
      const name = toText(prop?.name || prop?.key || prop?.id);
      const propertyKeyCandidate = `${containerIndex}:${propIndex}:${name}`;
      if (propertyKey) {
        if (propertyKeyCandidate !== propertyKey) return;
      } else if (name !== propertyName) {
        return;
      }
      setBpmnProperty(prop, "value", String(nextValueRaw ?? ""));
      found = true;
    });
  });
  if (!found) return { ok: false, error: "extension_property_not_found" };
  try {
    modeling.updateProperties(element, { extensionElements: nextExt });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: toText(error?.message || error || "extension_property_update_failed") || "extension_property_update_failed",
    };
  }
}

function isSafeFlowParent(el) {
  const type = readElementType(el);
  if (!type) return false;
  if (isLaneType(type)) return false;
  if (isParticipantType(type)) return true;
  if (isProcessType(type) && hasSemanticFlowElements(el)) return true;
  return false;
}

function isLaneContainerType(typeRaw) {
  const type = String(typeRaw || "").trim().toLowerCase();
  if (!type) return false;
  return type.includes("lane") || type.includes("participant") || type.includes("process");
}

function isPointInsideShape(point, shape) {
  if (!point || !hasShapeBounds(shape)) return false;
  const x = Number(point?.x || 0);
  const y = Number(point?.y || 0);
  const sx = Number(shape?.x || 0);
  const sy = Number(shape?.y || 0);
  const sw = Number(shape?.width || 0);
  const sh = Number(shape?.height || 0);
  return x >= sx && x <= sx + sw && y >= sy && y <= sy + sh;
}

function findShapeAtPoint(itemsRaw, point, predicate) {
  const items = asArray(itemsRaw);
  const test = typeof predicate === "function" ? predicate : () => true;
  const candidates = items
    .filter((item) => hasShapeBounds(item) && test(item) && isPointInsideShape(point, item))
    .sort((a, b) => {
      const aArea = Number(a?.width || 0) * Number(a?.height || 0);
      const bArea = Number(b?.width || 0) * Number(b?.height || 0);
      return aArea - bArea;
    });
  return candidates[0] || null;
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

function resolveGraphicalInsertParent(hitElement, canvasRoot = null) {
  const visited = new Set();
  let cursor = hitElement || null;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    if (isSafeFlowParent(cursor)) return cursor;
    const type = readElementType(cursor);
    if (isLaneType(type)) {
      cursor = cursor?.parent || null;
      continue;
    }
    cursor = cursor?.parent || null;
  }
  if (isSafeFlowParent(canvasRoot)) return canvasRoot;
  return canvasRoot || null;
}

function resolveCreateShapeParent(candidate, canvasRoot = null) {
  const resolved = resolveGraphicalInsertParent(candidate, canvasRoot);
  if (isSafeFlowParent(resolved)) return resolved;
  const fromRootChildren = findFirstSafeFlowParent(canvasRoot);
  if (isSafeFlowParent(fromRootChildren)) return fromRootChildren;
  return isSafeFlowParent(canvasRoot) ? canvasRoot : null;
}

function ensureRootPlaneCollection(rootElement) {
  const di = rootElement?.di;
  if (di && !Array.isArray(di.planeElement)) {
    di.planeElement = [];
  }
}

function ensureFlowElementsCollection(parent) {
  const bo = asObject(parent?.businessObject);
  if (!bo || typeof bo !== "object") return;
  const type = readElementType(parent);
  if (isParticipantType(type)) {
    if (bo.processRef && !Array.isArray(bo.processRef.flowElements)) {
      bo.processRef.flowElements = [];
    }
    return;
  }
  if (isProcessType(type) && !Array.isArray(bo.flowElements)) {
    bo.flowElements = [];
  }
}

function ensureArtifactsCollection(parent) {
  const bo = asObject(parent?.businessObject);
  if (!bo || typeof bo !== "object") return;
  const type = readElementType(parent);
  if (isParticipantType(type)) {
    if (bo.processRef && !Array.isArray(bo.processRef.artifacts)) {
      bo.processRef.artifacts = [];
    }
    return;
  }
  if (
    type.includes("process")
    || type.includes("subprocess")
    || type.includes("collaboration")
  ) {
    if (!Array.isArray(bo.artifacts)) {
      bo.artifacts = [];
    }
  }
}

function resolveCanvasCreateParent(inst, point) {
  const canvas = inst?.get?.("canvas");
  const registry = inst?.get?.("elementRegistry");
  const root = canvas?.getRootElement?.() || null;
  const all = asArray(registry?.getAll?.());
  const laneContainerAtPoint = findShapeAtPoint(
    all,
    point,
    (el) => isLaneContainerType(readElementType(el)),
  );
  const byPoint = resolveCreateShapeParent(laneContainerAtPoint, root);
  const fallback = resolveCreateShapeParent(root, root) || root || null;
  return { root, parent: byPoint || fallback };
}

function readDiagramPointFromClient(inst, clientXRaw, clientYRaw) {
  const canvas = inst?.get?.("canvas");
  const container = canvas?._container;
  const rect = container?.getBoundingClientRect?.();
  const vb = canvas?.viewbox?.() || {};
  const scale = Number(vb?.scale || canvas?.zoom?.() || 1) || 1;
  const clientX = Number(clientXRaw || 0);
  const clientY = Number(clientYRaw || 0);
  const relX = clientX - Number(rect?.left || 0);
  const relY = clientY - Number(rect?.top || 0);
  return {
    x: Number(vb?.x || 0) + relX / scale,
    y: Number(vb?.y || 0) + relY / scale,
  };
}

function readUndoRedoAvailability(commandStack) {
  if (!commandStack || typeof commandStack !== "object") {
    return { canUndo: false, canRedo: false };
  }
  let canUndo = false;
  let canRedo = false;
  try {
    canUndo = typeof commandStack.canUndo === "function"
      ? commandStack.canUndo() === true
      : false;
  } catch {
    canUndo = false;
  }
  try {
    canRedo = typeof commandStack.canRedo === "function"
      ? commandStack.canRedo() === true
      : false;
  } catch {
    canRedo = false;
  }
  return { canUndo, canRedo };
}

async function copyToClipboard(rawValue) {
  const text = toText(rawValue);
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }

  if (typeof document !== "undefined") {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch {
      document.body.removeChild(ta);
    }
  }

  return false;
}

function selectAndEmitElement({
  inst,
  element,
  source = "context_menu_action",
  emitElementSelection,
  buildInsertBetweenCandidate,
}) {
  if (!inst || !element) return false;
  const elementId = toText(element?.id);
  if (!elementId) return false;
  try {
    const selection = inst.get("selection");
    selection?.select?.([element]);
  } catch {
  }
  if (typeof emitElementSelection === "function") {
    emitElementSelection(element, source, {
      selectedIds: [elementId],
      insertBetween: typeof buildInsertBetweenCandidate === "function"
        ? buildInsertBetweenCandidate(inst, [element])
        : null,
    });
  }
  return true;
}

function createConnectedTaskFromAnchor({
  inst,
  anchor,
  offsetY = 0,
  emitElementSelection,
  buildInsertBetweenCandidate,
}) {
  if (!inst || !anchor) return { ok: false, error: "anchor_not_found" };
  const modeling = inst.get("modeling");
  const elementFactory = inst.get("elementFactory");
  const x = Number(anchor?.x || 0);
  const y = Number(anchor?.y || 0);
  const width = Number(anchor?.width || 120);
  const height = Number(anchor?.height || 80);
  const parent = anchor?.parent || inst.get("canvas")?.getRootElement?.();

  const task = modeling.createShape(
    elementFactory.createShape({ type: "bpmn:Task" }),
    {
      x: Math.round(x + width + 220),
      y: Math.round(y + height / 2 + Number(offsetY || 0)),
    },
    parent,
  );
  modeling.connect(anchor, task, { type: "bpmn:SequenceFlow" });

  selectAndEmitElement({
    inst,
    element: task,
    source: "context_menu_add_next",
    emitElementSelection,
    buildInsertBetweenCandidate,
  });

  return {
    ok: true,
    changedIds: [toText(anchor?.id), toText(task?.id)].filter(Boolean),
    createdId: toText(task?.id),
  };
}

export function createBpmnContextMenuActionExecutor({
  modelerRef,
  ensureModeler,
  emitDiagramMutation,
  emitElementSelection,
  buildInsertBetweenCandidate,
  cloneCompanionStateForCopiedElement,
  buildCopyElementOptions,
} = {}) {
  return async function executeBpmnContextMenuActionRequest(payloadRaw = {}) {
    return await executeBpmnContextMenuAction({
      payloadRaw,
      modelerRef,
      ensureModeler,
      emitDiagramMutation,
      emitElementSelection,
      buildInsertBetweenCandidate,
      cloneCompanionStateForCopiedElement,
      buildCopyElementOptions,
    });
  };
}

export async function executeBpmnContextMenuAction({
  payloadRaw = {},
  modelerRef,
  ensureModeler,
  emitDiagramMutation,
  emitElementSelection,
  buildInsertBetweenCandidate,
  cloneCompanionStateForCopiedElement,
  buildCopyElementOptions,
} = {}) {
  const payload = asObject(payloadRaw);
  const actionId = toText(payload.actionId);
  if (!actionId) return { ok: false, error: "missing_action_id" };

  const inst = modelerRef?.current || await Promise.resolve(
    typeof ensureModeler === "function" ? ensureModeler() : null,
  );
  if (!inst) return { ok: false, error: "modeler_not_ready" };

  const targetMeta = asObject(payload.target);
  const targetId = toText(targetMeta.id || payload.elementId);
  const registry = inst.get("elementRegistry");
  const modeling = inst.get("modeling");
  const elementFactory = inst.get("elementFactory");
  const canvas = inst.get("canvas");
  const selection = inst.get("selection");
  const directEditing = inst.get?.("directEditing");
  const commandStack = inst.get?.("commandStack");
  const target = targetId ? registry?.get?.(targetId) : null;
  const point = readDiagramPointFromClient(inst, Number(payload.clientX || 0), Number(payload.clientY || 0));
  const actionValue = String(payload.value ?? "");

  const emitMutation = (meta = {}) => {
    if (typeof emitDiagramMutation === "function") {
      emitDiagramMutation("diagram.context_menu_action", {
        actionId,
        ...asObject(meta),
      });
    }
  };

  const createOnCanvas = (type) => {
    const parentResolved = resolveCanvasCreateParent(inst, point);
    const root = parentResolved.root;
    const parent = parentResolved.parent || root;
    if (!parent) {
      return { ok: false, error: "create_parent_missing" };
    }
    ensureRootPlaneCollection(root);
    if (String(type || "").toLowerCase().includes("textannotation")) {
      ensureArtifactsCollection(parent);
    } else {
      ensureFlowElementsCollection(parent);
    }
    const shape = modeling.createShape(
      elementFactory.createShape({ type }),
      { x: Math.round(point.x), y: Math.round(point.y) },
      parent,
    );
    selectAndEmitElement({
      inst,
      element: shape,
      source: "context_menu_create",
      emitElementSelection,
      buildInsertBetweenCandidate,
    });
    emitMutation({ type });
    return {
      ok: true,
      createdId: toText(shape?.id),
      changedIds: [toText(shape?.id)].filter(Boolean),
    };
  };

  try {
    if (actionId === "undo" || actionId === "redo") {
      const availability = readUndoRedoAvailability(commandStack);
      const canRun = actionId === "undo" ? availability.canUndo : availability.canRedo;
      if (!canRun) {
        return {
          ok: false,
          error: actionId === "undo" ? "undo_unavailable" : "redo_unavailable",
        };
      }
      const run = actionId === "undo" ? commandStack?.undo : commandStack?.redo;
      if (typeof run !== "function") {
        return {
          ok: false,
          error: actionId === "undo" ? "undo_unavailable" : "redo_unavailable",
        };
      }
      run.call(commandStack);
      emitMutation({ actionId });
      return { ok: true, changedIds: [] };
    }

    if (actionId === "create_task") return createOnCanvas("bpmn:Task");
    if (actionId === "create_gateway") return createOnCanvas("bpmn:ExclusiveGateway");
    if (actionId === "create_start_event") return createOnCanvas("bpmn:StartEvent");
    if (actionId === "create_end_event") return createOnCanvas("bpmn:EndEvent");
    if (actionId === "create_subprocess") return createOnCanvas("bpmn:SubProcess");
    if (actionId === "add_annotation") return createOnCanvas("bpmn:TextAnnotation");

    if (actionId === "paste") {
      if (hasCopiedBpmnElementSnapshot()) {
        const semanticSnapshot = readCopiedBpmnElementSnapshot();
        const parentResolved = resolveCanvasCreateParent(inst, point);
        const root = parentResolved.root;
        const hasExplicitClientPoint = (
          Object.prototype.hasOwnProperty.call(payload, "clientX")
          || Object.prototype.hasOwnProperty.call(payload, "clientY")
        );
        const fallbackPoint = hasExplicitClientPoint ? point : null;
        const parent = hasShapeBounds(target)
          ? (resolveCreateShapeParent(target?.parent || target, root) || parentResolved.parent || root)
          : (parentResolved.parent || root);
        if (!parent) return { ok: false, error: "paste_parent_missing" };
        const pastePoint = resolveBpmnPastePoint({
          target,
          fallbackPoint,
        });
        if (!pastePoint) return { ok: false, error: "paste_point_missing" };
        ensureRootPlaneCollection(root);
        if (toText(semanticSnapshot?.type).toLowerCase().includes("textannotation")) {
          ensureArtifactsCollection(parent);
        } else {
          ensureFlowElementsCollection(parent);
        }
        const semanticPaste = pasteCopiedBpmnElementFromClipboard({
          modeling,
          elementFactory,
          moddle: inst.get?.("moddle"),
          parent,
          point: pastePoint,
        });
        if (!semanticPaste.ok) return semanticPaste;
        const created = semanticPaste.createdElement || null;
        if (created) {
          if (typeof cloneCompanionStateForCopiedElement === "function") {
            cloneCompanionStateForCopiedElement({
              sourceElementId: toText(semanticSnapshot?.sourceElementId),
              targetElementId: toText(created?.id),
              semanticPayload: semanticSnapshot?.semanticPayload,
              inst,
            });
          }
          selectAndEmitElement({
            inst,
            element: created,
            source: "context_menu_paste",
            emitElementSelection,
            buildInsertBetweenCandidate,
          });
        }
        emitMutation({ count: semanticPaste.changedIds?.length || 0, source: "semantic_clipboard" });
        return {
          ok: true,
          changedIds: asArray(semanticPaste.changedIds),
          createdId: toText(created?.id),
        };
      }

      const copyPaste = inst.get?.("copyPaste");
      if (!copyPaste || typeof copyPaste.paste !== "function") {
        return { ok: false, error: "paste_unavailable" };
      }
      const parentResolved = resolveCanvasCreateParent(inst, point);
      const root = parentResolved.root;
      const parent = parentResolved.parent || root;
      if (!parent) return { ok: false, error: "paste_parent_missing" };
      const pasted = copyPaste.paste({
        element: parent,
        point: { x: Math.round(point.x), y: Math.round(point.y) },
      });
      const ids = asArray(pasted)
        .map((item) => toText(item?.id || item?.element?.id))
        .filter(Boolean);
      if (ids[0]) {
        const first = registry?.get?.(ids[0]);
        if (first) selection?.select?.([first]);
      }
      emitMutation({ count: ids.length, source: "native_copy_paste" });
      return { ok: true, changedIds: ids };
    }

    if (!target) return { ok: false, error: "target_not_found" };

    if (actionId === "quick_set_name" || actionId === "quick_set_flow_label") {
      if (!modeling || typeof modeling.updateLabel !== "function") {
        return { ok: false, error: "update_label_unavailable" };
      }
      modeling.updateLabel(target, actionValue);
      emitMutation({ targetId, valueLength: actionValue.length });
      return { ok: true, changedIds: [toText(target.id)].filter(Boolean) };
    }

    if (actionId === "rename" || actionId === "edit_label") {
      if (directEditing && typeof directEditing.activate === "function") {
        directEditing.activate(target);
        return { ok: true, changedIds: [toText(target.id)].filter(Boolean) };
      }
      return { ok: false, error: "direct_editing_unavailable" };
    }

    if (actionId === "open_properties") {
      selectAndEmitElement({
        inst,
        element: target,
        source: "context_menu_properties",
        emitElementSelection,
        buildInsertBetweenCandidate,
      });
      return {
        ok: true,
        changedIds: [toText(target.id)].filter(Boolean),
        openPropertiesOverlay: buildPropertiesOverlayPayload(target),
      };
    }

    if (actionId === "properties_overlay_update_name") {
      const result = updateElementName(modeling, target, payload.value);
      if (!result.ok) return { ok: false, error: result.error || "rename_failed" };
      selectAndEmitElement({
        inst,
        element: target,
        source: "properties_overlay_update_name",
        emitElementSelection,
        buildInsertBetweenCandidate,
      });
      return {
        ok: true,
        changedIds: [toText(target.id)].filter(Boolean),
        openPropertiesOverlay: buildPropertiesOverlayPayload(target),
      };
    }

    if (actionId === "properties_overlay_update_documentation") {
      const result = updateElementDocumentation({
        inst,
        modeling,
        element: target,
        documentationRowsRaw: payload.documentation,
      });
      if (!result.ok) return { ok: false, error: result.error || "set_documentation_failed" };
      selectAndEmitElement({
        inst,
        element: target,
        source: "properties_overlay_update_documentation",
        emitElementSelection,
        buildInsertBetweenCandidate,
      });
      return {
        ok: true,
        changedIds: [toText(target.id)].filter(Boolean),
        openPropertiesOverlay: buildPropertiesOverlayPayload(target),
      };
    }

    if (actionId === "properties_overlay_update_extension_property") {
      const result = updateExtensionPropertyValue({
        inst,
        modeling,
        element: target,
        propertyNameRaw: payload.propertyName,
        propertyKeyRaw: payload.propertyKey,
        nextValueRaw: payload.value,
      });
      if (!result.ok) return { ok: false, error: result.error || "extension_property_update_failed" };
      selectAndEmitElement({
        inst,
        element: target,
        source: "properties_overlay_update_extension_property",
        emitElementSelection,
        buildInsertBetweenCandidate,
      });
      return {
        ok: true,
        changedIds: [toText(target.id)].filter(Boolean),
        openPropertiesOverlay: buildPropertiesOverlayPayload(target),
      };
    }

    if (actionId === "add_next_step") {
      const result = createConnectedTaskFromAnchor({
        inst,
        anchor: target,
        emitElementSelection,
        buildInsertBetweenCandidate,
      });
      if (result.ok) emitMutation({ targetId });
      return result;
    }

    if (actionId === "add_outgoing_branch") {
      const outgoingCount = asArray(target?.outgoing).filter((row) => isConnectionElement(row)).length;
      const offsetY = outgoingCount <= 0 ? 0 : ((outgoingCount % 4) - 1.5) * 96;
      const result = createConnectedTaskFromAnchor({
        inst,
        anchor: target,
        offsetY,
        emitElementSelection,
        buildInsertBetweenCandidate,
      });
      if (result.ok) emitMutation({ targetId });
      return result;
    }

    if (actionId === "duplicate") {
      return { ok: false, error: "duplicate_disabled_for_semantic_safety" };
    }

    if (actionId === "copy_name") {
      const name = toText(target?.businessObject?.name);
      if (!name) return { ok: false, error: "name_empty" };
      const ok = await copyToClipboard(name);
      return { ok, error: ok ? "" : "clipboard_unavailable", message: ok ? `Скопировано: ${name}` : "" };
    }

    if (actionId === "copy_element") {
      if (!canCopyBpmnElement(target)) {
        return { ok: false, error: "copy_element_unsupported" };
      }
      const copied = copyBpmnElementToClipboard(
        target,
        typeof buildCopyElementOptions === "function"
          ? buildCopyElementOptions({ inst, element: target })
          : {},
      );
      if (!copied.ok) return copied;
      return {
        ok: true,
        changedIds: [toText(target?.id)].filter(Boolean),
        message: "Элемент скопирован",
      };
    }

    if (actionId === "copy_id") {
      const id = toText(target?.id);
      if (!id) return { ok: false, error: "id_empty" };
      const ok = await copyToClipboard(id);
      return { ok, error: ok ? "" : "clipboard_unavailable", message: ok ? `Скопировано: ${id}` : "" };
    }

    if (actionId === "open_inside") {
      selectAndEmitElement({
        inst,
        element: target,
        source: "context_menu_open_inside_preview",
        emitElementSelection,
        buildInsertBetweenCandidate,
      });
      canvas?.scrollToElement?.(target);
      return {
        ok: true,
        changedIds: [toText(target.id)].filter(Boolean),
        openInsidePreview: buildSubprocessPreview(target),
      };
    }

    if (actionId === "delete") {
      if (isConnectionElement(target)) modeling.removeConnection(target);
      else modeling.removeShape(target);
      emitMutation({ targetId });
      return { ok: true, changedIds: [targetId].filter(Boolean) };
    }

    return { ok: false, error: "unsupported_action" };
  } catch (error) {
    return {
      ok: false,
      error: toText(error?.message || error || "context_action_failed"),
    };
  }
}
