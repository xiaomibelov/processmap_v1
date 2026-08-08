// LLM4 — чистая view-логика панели PROCESSMAN (без React, тестируется).
// Token economy: построение табов/контекста/статуса НЕ вызывает API и НЕ делает
// side-effect — только клик по действию в SchemaAssistantBlock/LlmAnalysisBlock
// делает LLM-вызов (1 вызов = 1 действие). Статус LLM кэшируется на сессию.

export const PROCESSMAN_TAB_IDS = ["schema", "tobe", "analysis", "asis", "reports"];

export function buildProcessmanTabs(labels = {}) {
  return PROCESSMAN_TAB_IDS.map((id) => ({
    id,
    label: String(labels[id] || id).trim(),
  }));
}

export function readElementId(element) {
  return String(element?.id || "").trim();
}

// Поиск шага маршрута, привязанного к выбранному BPMN-узлу.
// Поле bpmn_ref поддерживается в нескольких вариантах записи (см. ProcessStage).
export function readStepBpmnId(stepRaw) {
  const s = stepRaw && typeof stepRaw === "object" ? stepRaw : {};
  return String(
    s.bpmn_ref
    || s.bpmnRef
    || s.node_bind_id
    || s.nodeBindId
    || s.node_id
    || s.nodeId
    || "",
  ).trim();
}

export function findStepForElement(steps = [], bpmnId = "") {
  const target = String(bpmnId || "").trim();
  if (!target) return null;
  return (Array.isArray(steps) ? steps : []).find((stepRaw) => readStepBpmnId(stepRaw) === target) || null;
}

export function buildTobeContext({ selectedElement = null, steps = [] } = {}) {
  const elementId = readElementId(selectedElement);
  if (!elementId) return { elementId: "", step: null, inRoute: false };
  const step = findStepForElement(steps, elementId);
  return {
    elementId,
    name: String(selectedElement?.name || selectedElement?.title || elementId || ""),
    type: String(selectedElement?.type || "").trim(),
    laneName: String(selectedElement?.laneName || selectedElement?.lane || "").trim(),
    step,
    inRoute: !!step,
  };
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

export function formatDuration(sec) {
  const s = toInt(sec);
  return s === 0 ? "0" : String(s);
}

// Статус LLM для вкладки «Анализ процессов».
// llmStatus — результат apiLlmStatus(): { ok, status, result? } | null (ещё грузится).
export function resolveLlmStatusView(llmStatus = null) {
  if (llmStatus === null) return { kind: "idle" };
  if (llmStatus?.ok !== true) return { kind: "unknown" };
  const result = llmStatus?.result && typeof llmStatus.result === "object" ? llmStatus.result : {};
  if (result.configured !== true) return { kind: "not_configured" };
  const quota = result.quota && typeof result.quota === "object" ? result.quota : {};
  const used = toInt(quota.used);
  const limit = toInt(quota.limit);
  return {
    kind: "configured",
    used,
    limit,
    exhausted: limit > 0 && used >= limit,
  };
}
