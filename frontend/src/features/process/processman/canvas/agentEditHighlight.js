// feat/canvas-edit-highlight — чистая логика подсветки правок агента на канвасе.
// Без React и без bpmn-js: извлечение затронутых элементов из edit_plan и
// маппинг типа операции на тип вспышки. bpmn-js адаптер живёт в ProcessStage.

export const AGENT_EDIT_HIGHLIGHT_LIMIT = 20;

/**
 * Извлечь [{op, element_id}] из edit_plan.operations.
 * update_node/add_node/delete_node → node_id; add_edge/delete_edge → from_id и to_id.
 * Dedupe по (op, element_id), порядок первого появления, кап AGENT_EDIT_HIGHLIGHT_LIMIT.
 */
export function extractFocusElements(editPlan, { limit = AGENT_EDIT_HIGHLIGHT_LIMIT } = {}) {
  const operations = editPlan && typeof editPlan === "object" ? editPlan.operations : null;
  if (!Array.isArray(operations)) return [];
  const out = [];
  const seen = new Set();
  const push = (op, elementId) => {
    const opType = String(op || "").trim();
    const id = String(elementId || "").trim();
    if (!opType || !id) return;
    const key = `${opType}${id}`;
    if (seen.has(key) || out.length >= limit) return;
    seen.add(key);
    out.push({ op: opType, element_id: id });
  };
  for (const op of operations) {
    if (!op || typeof op !== "object") continue;
    const opType = String(op.op || "").trim();
    if (!opType) continue;
    push(opType, op.node_id);
    if (opType === "add_edge" || opType === "delete_edge") {
      push(opType, op.from_id);
      push(opType, op.to_id);
    }
    if (out.length >= limit) break;
  }
  return out;
}

/** Тип операции → тип вспышки на канвасе (add=зелёный, update=жёлтый, delete=красный). */
export function opToFlashType(op) {
  const opType = String(op || "").trim();
  if (opType.startsWith("add_")) return "add";
  if (opType.startsWith("delete_")) return "delete";
  return "update";
}
