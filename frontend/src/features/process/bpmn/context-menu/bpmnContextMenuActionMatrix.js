import {
  ACTION_ID_REDO,
  ACTION_ID_UNDO,
  readContextMenuSchemaByKind,
} from "./schema/bpmnContextMenuSchemas.js";

function toText(value) {
  return String(value || "").trim();
}

function toLower(value) {
  return toText(value).toLowerCase();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeBpmnType(targetRaw) {
  const target = targetRaw && typeof targetRaw === "object" ? targetRaw : {};
  return toLower(target.bpmnType || target.type || target.elementType);
}

export function resolveBpmnContextTargetKind(targetRaw = null) {
  const target = targetRaw && typeof targetRaw === "object" ? targetRaw : {};
  const kind = toLower(target.kind || target.scope || target.targetKind);
  const type = normalizeBpmnType(target);
  const explicitConnection = target.isConnection === true || kind === "connection";

  if (kind === "canvas" || (!type && !toText(target.id) && !explicitConnection)) return "canvas";
  if (explicitConnection || type.includes("sequenceflow")) return "sequence_flow";
  if (type.includes("subprocess")) return "subprocess";
  if (type.includes("gateway")) return "gateway";
  if (type.includes("startevent")) return "start_event";
  if (type.includes("endevent")) return "end_event";
  if (type.includes("task")) return "task";
  if (kind === "element" || !!type || !!toText(target.id)) return "generic_element";
  return "unsupported";
}

function withUndoRedoAvailability(actionsRaw, targetRaw) {
  const actions = Array.isArray(actionsRaw) ? actionsRaw : [];
  const target = targetRaw && typeof targetRaw === "object" ? targetRaw : {};
  const canUndo = target.canUndo === true;
  const canRedo = target.canRedo === true;
  return actions.map((itemRaw) => {
    const item = itemRaw && typeof itemRaw === "object" ? itemRaw : {};
    const id = toLower(item.id);
    if (id !== ACTION_ID_UNDO && id !== ACTION_ID_REDO) return { ...item };
    return {
      ...item,
      disabled: id === ACTION_ID_UNDO ? !canUndo : !canRedo,
    };
  });
}

export function resolveBpmnContextMenuActions(targetRaw = null) {
  const kind = resolveBpmnContextTargetKind(targetRaw);
  const actions = readContextMenuSchemaByKind(kind);
  return withUndoRedoAvailability(actions, targetRaw);
}

export function resolveBpmnContextMenuHeader(targetRaw = null) {
  const target = targetRaw && typeof targetRaw === "object" ? targetRaw : {};
  const kind = resolveBpmnContextTargetKind(targetRaw);
  if (kind === "canvas") return "Холст";
  if (kind === "sequence_flow") return toText(target.name || target.id) || "Переход";
  return toText(target.name || target.id) || "Элемент BPMN";
}

export function resolveBpmnContextMenuQuickEdit(targetRaw = null) {
  const target = targetRaw && typeof targetRaw === "object" ? targetRaw : {};
  const kind = resolveBpmnContextTargetKind(target);
  if (kind === "task" || kind === "subprocess") {
    return {
      actionId: "quick_set_name",
      label: "Название",
      placeholder: "Введите название шага",
      value: toText(target.name),
      group: "quick_properties",
    };
  }
  if (kind === "sequence_flow") {
    return {
      actionId: "quick_set_flow_label",
      label: "Текст перехода",
      placeholder: "Введите текст перехода",
      value: toText(target.name),
      group: "quick_properties",
    };
  }
  return null;
}

export function buildBpmnContextMenuViewModel({
  payloadRaw = {},
  runtimeUndoRedoState = {},
  fallbackUndoRedoState = {},
} = {}) {
  const payload = asObject(payloadRaw);
  const targetBase = asObject(payload.target);
  const runtimeUndoRedo = asObject(runtimeUndoRedoState);
  const fallbackUndoRedo = asObject(fallbackUndoRedoState);
  const target = {
    ...targetBase,
    canUndo: runtimeUndoRedo.canUndo === true || fallbackUndoRedo.canUndo === true,
    canRedo: runtimeUndoRedo.canRedo === true || fallbackUndoRedo.canRedo === true,
  };
  const kind = resolveBpmnContextTargetKind(target);
  const actions = resolveBpmnContextMenuActions(target);
  if (!actions.length) return null;
  return {
    sessionId: toText(payload.sessionId),
    clientX: Number(payload.clientX || 0),
    clientY: Number(payload.clientY || 0),
    header: resolveBpmnContextMenuHeader(target),
    kind,
    target,
    actions,
    quickEdit: resolveBpmnContextMenuQuickEdit(target),
  };
}

export function normalizeBpmnContextMenuActionRequest(actionRequestRaw = {}) {
  const actionRequest = asObject(actionRequestRaw);
  const actionId = toText(
    typeof actionRequestRaw === "string"
      ? actionRequestRaw
      : (actionRequest.actionId || actionRequest.id),
  );
  if (!actionId) return null;
  return {
    actionId,
    closeOnSuccess: actionRequest.closeOnSuccess !== false,
    value: String(actionRequest.value ?? ""),
  };
}

export function buildBpmnContextMenuExecutionRequest({
  menuRaw = {},
  actionRequestRaw = {},
} = {}) {
  const menu = asObject(menuRaw);
  const actionRequest = normalizeBpmnContextMenuActionRequest(actionRequestRaw);
  if (!actionRequest) return null;
  return {
    actionRequest,
    payload: {
      actionId: actionRequest.actionId,
      target: asObject(menu.target),
      clientX: Number(menu.clientX || 0),
      clientY: Number(menu.clientY || 0),
      value: actionRequest.value,
    },
  };
}
