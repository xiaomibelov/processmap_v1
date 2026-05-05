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
