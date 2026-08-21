import { patchInterviewAnalysis as defaultPatchInterviewAnalysis } from "./interviewAnalysisPatchHelper.js";
import {
  buildProductActionForStep,
  deleteProductAction,
  normalizeProductActionsList,
  upsertProductAction,
} from "./productActionsModel.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function readProductActions(currentAnalysisRaw) {
  return normalizeProductActionsList(asObject(currentAnalysisRaw).product_actions);
}

function makeAcceptedAiProductActionId({ timestamp, index, usedIds } = {}) {
  const compactTimestamp = toText(timestamp).replace(/[^0-9a-z]/gi, "").slice(0, 20) || Date.now().toString(36);
  const base = `pa_ai_${compactTimestamp}_${Number(index || 0) + 1}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds?.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function saveProductActionForStep({
  sessionId,
  currentAnalysis,
  step,
  draft,
  patchInterviewAnalysis = defaultPatchInterviewAnalysis,
  getBaseDiagramStateVersion,
  rememberDiagramStateVersion,
  onSessionSync,
  nowIso,
  idFactory,
} = {}) {
  const sid = toText(sessionId);
  if (!sid) return { ok: false, status: 0, error: "missing_session_id" };
  const nextRow = buildProductActionForStep(step, draft, {
    sessionId: sid,
    nowIso,
    idFactory,
  });
  if (!nextRow?.id) return { ok: false, status: 0, error: "invalid_product_action" };
  const nextProductActions = upsertProductAction(readProductActions(currentAnalysis), nextRow, {
    sessionId: sid,
  });
  const response = await patchInterviewAnalysis(sid, { product_actions: nextProductActions }, {
    getBaseDiagramStateVersion,
    rememberDiagramStateVersion,
    onSessionSync,
  });
  return {
    ...response,
    productAction: nextRow,
    productActions: nextProductActions,
  };
}

export async function deleteProductActionForStep({
  sessionId,
  currentAnalysis,
  actionId,
  patchInterviewAnalysis = defaultPatchInterviewAnalysis,
  getBaseDiagramStateVersion,
  rememberDiagramStateVersion,
  onSessionSync,
} = {}) {
  const sid = toText(sessionId);
  if (!sid) return { ok: false, status: 0, error: "missing_session_id" };
  const nextProductActions = deleteProductAction(readProductActions(currentAnalysis), actionId);
  const response = await patchInterviewAnalysis(sid, { product_actions: nextProductActions }, {
    getBaseDiagramStateVersion,
    rememberDiagramStateVersion,
    onSessionSync,
  });
  return {
    ...response,
    productActions: nextProductActions,
  };
}

export async function acceptAiProductActions({
  sessionId,
  currentAnalysis,
  selectedActions,
  patchInterviewAnalysis = defaultPatchInterviewAnalysis,
  getBaseDiagramStateVersion,
  rememberDiagramStateVersion,
  onSessionSync,
  nowIso,
} = {}) {
  const sid = toText(sessionId);
  if (!sid) return { ok: false, status: 0, error: "missing_session_id" };
  const accepted = Array.isArray(selectedActions) ? selectedActions : [];
  if (!accepted.length) return { ok: false, status: 0, error: "no_selected_product_actions" };
  const timestamp = toText(nowIso) || new Date().toISOString();
  let nextProductActions = readProductActions(currentAnalysis);
  const usedIds = new Set(nextProductActions.map((row) => toText(row.id)).filter(Boolean));
  const savedRows = [];
  accepted.forEach((rowRaw, index) => {
    if (!rowRaw || typeof rowRaw !== "object" || toText(rowRaw.duplicate_of)) return;
    const sourceAiId = toText(rowRaw.id);
    const savedId = makeAcceptedAiProductActionId({ timestamp, index, usedIds });
    const nextRow = buildProductActionForStep(
      rowRaw,
      {
        ...rowRaw,
        id: savedId,
        ai_suggestion_id: sourceAiId,
        source: "ai_suggested",
        manual_corrected: false,
        updated_at: timestamp,
      },
      {
        sessionId: sid,
        nowIso: timestamp,
        idFactory: () => savedId,
      },
    );
    if (!nextRow?.id) return;
    usedIds.add(nextRow.id);
    savedRows.push(nextRow);
    nextProductActions = upsertProductAction(nextProductActions, nextRow, { sessionId: sid });
  });
  if (!savedRows.length) return { ok: false, status: 0, error: "no_selected_product_actions" };
  const response = await patchInterviewAnalysis(sid, { product_actions: nextProductActions }, {
    getBaseDiagramStateVersion,
    rememberDiagramStateVersion,
    onSessionSync,
  });
  return {
    ...response,
    productActions: nextProductActions,
    acceptedProductActions: savedRows,
  };
}
