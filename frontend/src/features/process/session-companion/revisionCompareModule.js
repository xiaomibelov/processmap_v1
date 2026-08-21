import { buildSemanticBpmnDiff } from "../bpmn/diff/semanticDiff.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

export function findRevisionById(revisionsRaw, revisionIdRaw) {
  const revisionId = toText(revisionIdRaw);
  if (!revisionId) return null;
  return asArray(revisionsRaw).find((row) => toText(row?.id || row?.revisionId || row?.revision_id) === revisionId) || null;
}

export function buildRevisionDiffView({
  revisions = [],
  baseRevisionId = "",
  targetRevisionId = "",
} = {}) {
  const baseId = toText(baseRevisionId);
  const targetId = toText(targetRevisionId);
  if (!baseId || !targetId) {
    return { ok: false, error: "Выберите две версии для сравнения.", summary: null, details: null };
  }
  if (baseId === targetId) {
    return { ok: false, error: "Выберите разные версии A и B.", summary: null, details: null };
  }
  const base = findRevisionById(revisions, baseId);
  const target = findRevisionById(revisions, targetId);
  if (!base || !target) {
    return { ok: false, error: "Одна из выбранных версий недоступна.", summary: null, details: null };
  }
  return buildSemanticBpmnDiff(String(base?.xml || ""), String(target?.xml || ""));
}
