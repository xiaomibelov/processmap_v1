// AGENT-3 — view-модель pending edits для панели подтверждения правок.
// Чистая логика (без React): edit_plan/diff + resolver имён → строки панели
// «было → стало». Решение D1-A: «было» резолвится на фронте из загруженной
// bpmn-модели; для rename это текущее имя элемента. Расхождение с серверным
// снимком на момент propose ловит CAS бэкенда → conflict_rev.
//
// Поддержка apply (для BPMN-сессий бэкенд применяет ТОЛЬКО rename,
// services/agent/edit/applier.py): applySupported = все операции — rename
// update_node. Неподдержанные операции исключаются из «Применить» с
// пояснением в UI — тихих частичных применений нет (решение владельца).

export const RENAME_FIELDS = new Set(["title", "name"]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeName(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

/**
 * Resolver id узла → имя из модели диаграммы (draft.nodes: id + name/label/title).
 * @param {unknown} nodesRaw
 * @returns {(nodeId: string) => string | null}
 */
export function buildNodeNameResolver(nodesRaw) {
  const byId = new Map();
  for (const node of asArray(nodesRaw)) {
    const id = String(node?.id || "").trim();
    if (!id) continue;
    const name = normalizeName(node?.name ?? node?.label ?? node?.title);
    if (!byId.has(id)) byId.set(id, name || null);
  }
  return (nodeId) => byId.get(String(nodeId || "").trim()) ?? null;
}

function isRenameFields(fields) {
  const keys = Object.keys(fields && typeof fields === "object" ? fields : {});
  return keys.length > 0 && keys.every((k) => RENAME_FIELDS.has(k));
}

/** update_node → строка панели. */
function updateItem(op, resolveNodeName, index) {
  const nodeId = String(op.node_id || "");
  const fields = op.fields && typeof op.fields === "object" ? op.fields : {};
  const rename = isRenameFields(fields);
  const field = Object.keys(fields)[0] || "";
  const newValue = rename ? String(fields.title ?? fields.name ?? "") : "";
  return {
    key: `op_${index}`,
    op: "update",
    nodeId,
    nodeName: resolveNodeName(nodeId),
    field,
    // D1-A: «было» = текущее имя из модели (только для rename-полей).
    oldValue: rename ? resolveNodeName(nodeId) : null,
    newValue,
    supported: rename,
  };
}

function edgeItem(opKind, op, resolveNodeName, index) {
  const fromId = String(op.from_id || "");
  const toId = String(op.to_id || "");
  return {
    key: `op_${index}`,
    op: opKind,
    fromId,
    toId,
    fromName: resolveNodeName(fromId),
    toName: resolveNodeName(toId),
    nodeId: fromId,
    nodeName: resolveNodeName(fromId),
    field: "",
    oldValue: null,
    newValue: null,
    supported: false,
  };
}

function nodeItem(opKind, op, resolveNodeName, index) {
  const nodeId = String(op.node_id || "");
  const title = normalizeName(op.title);
  return {
    key: `op_${index}`,
    op: opKind,
    nodeId,
    nodeName: resolveNodeName(nodeId) ?? (title || null),
    field: "",
    oldValue: null,
    newValue: title || null,
    supported: false,
  };
}

function planOperationToItem(op, resolveNodeName, index) {
  const kind = String(op?.op || "");
  if (kind === "update_node") return updateItem(op, resolveNodeName, index);
  if (kind === "add_node") return nodeItem("add_node", op, resolveNodeName, index);
  if (kind === "delete_node") return nodeItem("delete_node", op, resolveNodeName, index);
  if (kind === "add_edge") return edgeItem("add_edge", op, resolveNodeName, index);
  if (kind === "delete_edge") return edgeItem("delete_edge", op, resolveNodeName, index);
  return {
    key: `op_${index}`,
    op: "unknown",
    nodeId: String(op?.node_id || ""),
    nodeName: null,
    field: "",
    oldValue: null,
    newValue: null,
    supported: false,
  };
}

/** diff-item (бэкенд build_human_diff) → строка панели (fallback, когда edit_plan без operations). */
function diffItemToItem(item, resolveNodeName, index) {
  const kind = String(item?.op || "");
  if (kind === "update") {
    const nodeId = String(item.node_id || "");
    const field = String(item.field || "");
    const rename = RENAME_FIELDS.has(field);
    return {
      key: `diff_${index}`,
      op: "update",
      nodeId,
      nodeName: resolveNodeName(nodeId),
      field,
      oldValue: rename ? resolveNodeName(nodeId) : null,
      newValue: rename ? String(item.new_value ?? "") : String(item.new_value ?? ""),
      supported: rename,
    };
  }
  if (kind === "add_node") return nodeItem("add_node", item, resolveNodeName, index);
  if (kind === "delete_node") return nodeItem("delete_node", item, resolveNodeName, index);
  if (kind === "add_edge") return edgeItem("add_edge", item, resolveNodeName, index);
  return {
    key: `diff_${index}`,
    op: "unknown",
    nodeId: String(item?.node_id || ""),
    nodeName: null,
    field: "",
    oldValue: null,
    newValue: null,
    supported: false,
  };
}

/**
 * Построить view-модель панели pending edits.
 * @param {{editPlan?: object, diff?: unknown[], resolveNodeName?: (id: string) => string | null}} input
 * @returns {{items: object[], note: string, hasUnsupported: boolean, applySupported: boolean}}
 */
export function formatEditPlan({ editPlan, diff, resolveNodeName } = {}) {
  const resolve = typeof resolveNodeName === "function" ? resolveNodeName : () => null;
  const plan = editPlan && typeof editPlan === "object" ? editPlan : {};
  const operations = asArray(plan.operations);
  const items = operations.length
    ? operations.map((op, idx) => planOperationToItem(op, resolve, idx))
    : asArray(diff).map((item, idx) => diffItemToItem(item, resolve, idx));
  const hasUnsupported = items.some((item) => !item.supported);
  return {
    items,
    note: String(plan.note || "").trim(),
    hasUnsupported,
    applySupported: items.length > 0 && !hasUnsupported,
  };
}
