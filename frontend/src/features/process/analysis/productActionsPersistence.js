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
  const savedRows = [];
  accepted.forEach((rowRaw, index) => {
    if (!rowRaw || typeof rowRaw !== "object" || toText(rowRaw.duplicate_of)) return;
    const nextRow = buildProductActionForStep(
      rowRaw,
      {
        ...rowRaw,
        id: toText(rowRaw.id) || `pa_ai_${Date.now().toString(36)}_${index + 1}`,
        source: "ai_suggested",
        manual_corrected: false,
        updated_at: timestamp,
      },
      {
        sessionId: sid,
        nowIso: timestamp,
        idFactory: () => toText(rowRaw.id) || `pa_ai_${Date.now().toString(36)}_${index + 1}`,
      },
    );
    if (!nextRow?.id) return;
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
