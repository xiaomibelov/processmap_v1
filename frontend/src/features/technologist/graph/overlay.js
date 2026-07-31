// OL1 — чистые хелперы overlay-канваса (юнит-тестируемые, без React):
// раскладка TO BE относительно AS IS (derived_from) + индекс трассировки.

// Зазор между низом AS IS-узла и верхом его TO BE-потомка (px в координатах модели).
export const OVERLAY_GAP_Y = 48;
// Зазор между несколькими TO BE-потомками одного AS IS-источника.
export const OVERLAY_STACK_GAP_Y = 24;

/**
 * OL1.2: начальная раскладка overlay после трансформации.
 * TO BE-узел со связью derived_from ставится СТРОГО ПОД своим AS IS-источником
 * (offset по Y = высота источника + gap; подписи обоих читаемы, совпадение по X
 * сохраняет пространственное соответствие «откуда → куда»). Несколько потомков
 * одного источника каскадируются вниз. Узлы без derived_from (новые блоки) —
 * не трогаем (свободная область канваса).
 * Чистая функция: возвращает НОВУЮ модель, вход не мутирует.
 */
export function applyOverlayLayout(draftModel, asIsModel) {
  if (!draftModel || !Array.isArray(draftModel?.nodes)) return draftModel;
  if (!asIsModel || !Array.isArray(asIsModel?.nodes)) return draftModel;
  const asisById = new Map();
  asIsModel.nodes.forEach((n) => asisById.set(String(n?.id || ""), n));
  const usedPerSource = new Map();
  const nodes = draftModel.nodes.map((node) => {
    const derived = Array.isArray(node?.derived_from) ? node.derived_from : [];
    const srcId = derived.length ? String(derived[0] || "") : "";
    const src = srcId ? asisById.get(srcId) : null;
    if (!src) return node;
    const idx = usedPerSource.get(srcId) || 0;
    usedPerSource.set(srcId, idx + 1);
    const srcH = Number(src.height) || 60;
    const nodeH = Number(node.height) || 60;
    return {
      ...node,
      x: Number(src.x) || 0,
      y: (Number(src.y) || 0) + srcH + OVERLAY_GAP_Y + idx * (nodeH + OVERLAY_STACK_GAP_Y),
    };
  });
  return { ...draftModel, nodes };
}

/**
 * OL1.3: индекс трассировки в обе стороны.
 * Источник: traceMap (element_id → draft_node_ids) + fallback node.derived_from.
 * Возвращает { tobeToAsis: Map<tobeId, asisId[]>, asisToTobe: Map<asisId, tobeId[]> }.
 */
export function buildTraceIndex(traceMap, tobeModel) {
  const tobeToAsis = new Map();
  const asisToTobe = new Map();
  const add = (tobeId, asisId) => {
    const t = String(tobeId || "");
    const a = String(asisId || "");
    if (!t || !a) return;
    if (!tobeToAsis.has(t)) tobeToAsis.set(t, []);
    if (!tobeToAsis.get(t).includes(a)) tobeToAsis.get(t).push(a);
    if (!asisToTobe.has(a)) asisToTobe.set(a, []);
    if (!asisToTobe.get(a).includes(t)) asisToTobe.get(a).push(t);
  };
  (Array.isArray(traceMap) ? traceMap : []).forEach((tr) => {
    const asisId = String(tr?.element_id || "");
    (Array.isArray(tr?.draft_node_ids) ? tr.draft_node_ids : []).forEach((d) => add(d, asisId));
  });
  (Array.isArray(tobeModel?.nodes) ? tobeModel.nodes : []).forEach((n) => {
    const id = String(n?.id || "");
    (Array.isArray(n?.derived_from) ? n.derived_from : []).forEach((a) => add(id, a));
  });
  return { tobeToAsis, asisToTobe };
}

/**
 * Множества подсветки для текущего выделения (обе стороны, OL1.3):
 * выделен TO BE → подсветить его AS IS-источники; выделена AS IS → её TO BE-потомков.
 */
export function traceHighlights(traceIndex, { selectedTobeId = "", selectedAsisId = "" } = {}) {
  const asis = new Set();
  const tobe = new Set();
  const idx = traceIndex || { tobeToAsis: new Map(), asisToTobe: new Map() };
  const t = String(selectedTobeId || "");
  const a = String(selectedAsisId || "");
  if (t) (idx.tobeToAsis.get(t) || []).forEach((x) => asis.add(x));
  if (a) (idx.asisToTobe.get(a) || []).forEach((x) => tobe.add(x));
  return { asis, tobe };
}

/**
 * Пары (tobeId, asisId) для отрисовки пунктирных связей происхождения (OL1.4):
 * mode "always" — все пары; "selection" — только инцидентные выделению.
 */
export function traceLinkPairs(traceIndex, { mode = "selection", selectedTobeId = "", selectedAsisId = "" } = {}) {
  const idx = traceIndex || { tobeToAsis: new Map(), asisToTobe: new Map() };
  const pairs = [];
  const t = String(selectedTobeId || "");
  const a = String(selectedAsisId || "");
  idx.tobeToAsis.forEach((asisIds, tobeId) => {
    asisIds.forEach((asisId) => {
      if (mode === "always" || tobeId === t || asisId === a) pairs.push({ tobeId, asisId });
    });
  });
  return pairs;
}
