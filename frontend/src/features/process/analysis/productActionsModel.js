const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export const ACTION_TYPES = Object.freeze([
  "вскрытие",
  "взятие",
  "перекладывание",
  "перетаривание",
  "нарезка",
  "разогрев",
  "упаковка",
  "маркировка",
  "другое",
]);

export const ACTION_STAGES = Object.freeze([
  "подготовка",
  "до разогрева",
  "после разогрева",
  "сборка",
  "упаковка",
  "маркировка",
  "финальный этап",
  "другое",
]);

export const ACTION_OBJECT_CATEGORIES = Object.freeze([
  "продукт",
  "ингредиент",
  "полуфабрикат",
  "готовое блюдо",
  "тара",
  "упаковка",
  "инвентарь",
  "другое",
]);

export const ACTION_METHODS = Object.freeze([
  "перелить",
  "пересыпать",
  "перевернуть",
  "взять рукой",
  "взять щипцами",
  "нарезать ножом",
  "надрез ножом",
  "поместить",
  "другое",
]);

function toText(value) {
  return String(value || "").trim();
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cloneSafeJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cloneSafeJsonValue(item)).filter((item) => item !== undefined);
  }
  if (isPlainObject(value)) {
    const out = {};
    Object.keys(value).forEach((key) => {
      if (UNSAFE_KEYS.has(key)) return;
      const cloned = cloneSafeJsonValue(value[key]);
      if (cloned !== undefined) out[key] = cloned;
    });
    return out;
  }
  if (value === null) return null;
  const type = typeof value;
  if (type === "number") return Number.isFinite(value) ? value : undefined;
  if (type === "string" || type === "boolean") return value;
  return undefined;
}

function toNonNegativeSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

function readStepDurationSeconds(stepRaw) {
  const step = isPlainObject(stepRaw) ? stepRaw : {};
  const secCandidates = [
    step.work_duration_sec,
    step.workDurationSec,
    step.duration_sec,
    step.durationSec,
    step.step_time_sec,
    step.stepTimeSec,
  ];
  for (let i = 0; i < secCandidates.length; i += 1) {
    const sec = toNonNegativeSeconds(secCandidates[i]);
    if (sec !== undefined) return sec;
  }
  const minCandidates = [
    step.duration_min,
    step.durationMin,
    step.step_time_min,
    step.stepTimeMin,
    step.duration,
  ];
  for (let i = 0; i < minCandidates.length; i += 1) {
    const mins = Number(minCandidates[i]);
    if (Number.isFinite(mins) && mins >= 0) return Math.round(mins * 60);
  }
  return undefined;
}

function readStepWaitSeconds(stepRaw) {
  const step = isPlainObject(stepRaw) ? stepRaw : {};
  const secCandidates = [
    step.wait_duration_sec,
    step.waitDurationSec,
    step.wait_sec,
    step.waitSec,
  ];
  for (let i = 0; i < secCandidates.length; i += 1) {
    const sec = toNonNegativeSeconds(secCandidates[i]);
    if (sec !== undefined) return sec;
  }
  const mins = Number(step.wait_min ?? step.waitMin);
  if (Number.isFinite(mins) && mins >= 0) return Math.round(mins * 60);
  return undefined;
}

function normalizeOption(value, options) {
  const text = toText(value);
  if (!text) return "";
  return options.includes(text) ? text : text;
}

export function normalizeProductActionRow(rowRaw, options = {}) {
  if (!isPlainObject(rowRaw)) return null;
  const safe = cloneSafeJsonValue(rowRaw) || {};
  const id = toText(safe.id) || toText(options.id) || createProductActionId(options);
  const row = {
    ...safe,
    id,
    session_id: toText(safe.session_id || safe.sessionId || options.sessionId),
    bpmn_element_id: toText(safe.bpmn_element_id || safe.bpmnElementId),
    step_id: toText(safe.step_id || safe.stepId),
    node_id: toText(safe.node_id || safe.nodeId),
    step_label: toText(safe.step_label || safe.stepLabel),
    product_name: toText(safe.product_name || safe.productName),
    product_group: toText(safe.product_group || safe.productGroup),
    action_type: normalizeOption(safe.action_type || safe.actionType, ACTION_TYPES),
    action_stage: normalizeOption(safe.action_stage || safe.actionStage, ACTION_STAGES),
    action_object: toText(safe.action_object || safe.actionObject),
    action_object_category: normalizeOption(
      safe.action_object_category || safe.actionObjectCategory,
      ACTION_OBJECT_CATEGORIES,
    ),
    action_method: normalizeOption(safe.action_method || safe.actionMethod, ACTION_METHODS),
    role: toText(safe.role),
    source: toText(safe.source) || "manual",
    confidence: Number.isFinite(Number(safe.confidence)) ? Number(safe.confidence) : 1,
    manual_corrected: safe.manual_corrected === false ? false : true,
    updated_at: toText(safe.updated_at || safe.updatedAt),
  };
  const workDurationSec = toNonNegativeSeconds(safe.work_duration_sec ?? safe.workDurationSec);
  if (workDurationSec !== undefined) row.work_duration_sec = workDurationSec;
  const waitDurationSec = toNonNegativeSeconds(safe.wait_duration_sec ?? safe.waitDurationSec);
  if (waitDurationSec !== undefined) row.wait_duration_sec = waitDurationSec;
  if (!row.bpmn_element_id && row.node_id) row.bpmn_element_id = row.node_id;
  if (!row.node_id && row.bpmn_element_id) row.node_id = row.bpmn_element_id;
  return row;
}

export function normalizeProductActionsList(raw, options = {}) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw
    .map((row, index) => normalizeProductActionRow(row, { ...options, id: `pa_import_${index + 1}` }))
    .filter((row) => {
      if (!row?.id || seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
}

export function createProductActionId(options = {}) {
  if (typeof options.idFactory === "function") return toText(options.idFactory()) || "pa_manual";
  const now = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  return `pa_${Math.round(now).toString(36)}_${suffix}`;
}

export function deriveProductActionBindingFromStep(stepRaw, options = {}) {
  const step = isPlainObject(stepRaw) ? stepRaw : {};
  const stepId = toText(step.id || step.step_id || step.stepId);
  const nodeId = toText(step.node_id || step.nodeId || step.node_bind_id || step.nodeBindId || step.bpmn_ref || step.bpmnRef);
  const label = toText(step.action || step.label || step.title || step.node_bind_title || step.nodeBindTitle);
  const out = {
    session_id: toText(options.sessionId),
    step_id: stepId,
    node_id: nodeId,
    bpmn_element_id: nodeId,
    step_label: label,
    role: toText(step.role),
  };
  const workDurationSec = readStepDurationSeconds(step);
  if (workDurationSec !== undefined) out.work_duration_sec = workDurationSec;
  const waitDurationSec = readStepWaitSeconds(step);
  if (waitDurationSec !== undefined) out.wait_duration_sec = waitDurationSec;
  return out;
}

export function buildProductActionForStep(stepRaw, draftRaw = {}, options = {}) {
  const binding = deriveProductActionBindingFromStep(stepRaw, options);
  const draft = isPlainObject(draftRaw) ? draftRaw : {};
  const nowIso = toText(options.nowIso) || new Date().toISOString();
  return normalizeProductActionRow({
    ...binding,
    ...draft,
    step_id: toText(draft.step_id || draft.stepId) || binding.step_id,
    node_id: toText(draft.node_id || draft.nodeId) || binding.node_id,
    bpmn_element_id: toText(draft.bpmn_element_id || draft.bpmnElementId) || binding.bpmn_element_id,
    step_label: toText(draft.step_label || draft.stepLabel) || binding.step_label,
    role: toText(draft.role) || binding.role,
    source: toText(draft.source) || "manual",
    confidence: Number.isFinite(Number(draft.confidence)) ? Number(draft.confidence) : 1,
    manual_corrected: draft.manual_corrected === false ? false : true,
    updated_at: nowIso,
  }, options);
}

export function listProductActionsForStep(productActionsRaw, stepRaw) {
  const list = normalizeProductActionsList(productActionsRaw);
  const binding = deriveProductActionBindingFromStep(stepRaw);
  const stepId = binding.step_id;
  const nodeId = binding.node_id;
  return list.filter((row) => (
    (stepId && row.step_id === stepId)
    || (nodeId && (row.bpmn_element_id === nodeId || row.node_id === nodeId))
  ));
}

export function upsertProductAction(productActionsRaw, rowRaw, options = {}) {
  const list = normalizeProductActionsList(productActionsRaw, options);
  const row = normalizeProductActionRow(rowRaw, options);
  if (!row?.id) return list;
  const idx = list.findIndex((item) => item.id === row.id);
  if (idx < 0) return [...list, row];
  return list.map((item, index) => (index === idx ? { ...item, ...row } : item));
}

export function deleteProductAction(productActionsRaw, actionIdRaw) {
  const actionId = toText(actionIdRaw);
  if (!actionId) return normalizeProductActionsList(productActionsRaw);
  return normalizeProductActionsList(productActionsRaw).filter((row) => row.id !== actionId);
}
