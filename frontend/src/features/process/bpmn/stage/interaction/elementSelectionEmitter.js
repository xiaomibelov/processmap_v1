function shouldTraceSelectionContinuity() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_E2E__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_selection_continuity") || "").trim() === "1";
  } catch {
    return false;
  }
}

function traceSelectionContinuity(event, payload = {}) {
  if (!shouldTraceSelectionContinuity()) return;
  const detail = payload && typeof payload === "object" ? payload : {};
  try {
    const prev = Array.isArray(window.__FPC_SELECTION_CONTINUITY_LOG__)
      ? window.__FPC_SELECTION_CONTINUITY_LOG__
      : [];
    const next = [
      ...prev,
      {
        ts: Date.now(),
        event: String(event || "trace"),
        ...detail,
      },
    ];
    if (next.length > 200) next.splice(0, next.length - 200);
    window.__FPC_SELECTION_CONTINUITY_LOG__ = next;
  } catch {
    // intentionally ignore
  }
  const suffix = Object.entries(detail)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[SELECTION_CONTINUITY] ${String(event || "trace")} ${suffix}`.trim());
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

export function emitElementSelectionChange(payload, { onElementSelectionChangeRef, selectedMarkerStateRef }) {
  const cb = onElementSelectionChangeRef.current;
  if (typeof cb !== "function") return;
  traceSelectionContinuity("selection_change_emit", {
    nextSelectedId: String(payload?.id || "").trim() || "-",
    viewerSelectedId: String(selectedMarkerStateRef.current.viewer || "").trim() || "-",
    editorSelectedId: String(selectedMarkerStateRef.current.editor || "").trim() || "-",
    source: String(payload?.source || (!payload ? "clear" : "unknown")).trim() || "-",
  });
  if (!payload || !payload.id) {
    cb(null);
    return;
  }
  cb(payload);
}

export function emitElementSelection(el, source, extra, deps) {
  const {
    onElementSelectionChangeRef,
    selectedMarkerStateRef,
    isSelectableElement,
    readableBpmnText,
    readLaneNameForElement,
    getAiQuestionsForElement,
    aiQuestionStats,
    getElementNoteCount,
  } = deps || {};

  if (typeof isSelectableElement !== "function") {
    throw new Error("emitElementSelection: isSelectableElement is required");
  }

  if (!isSelectableElement(el)) {
    emitElementSelectionChange(null, { onElementSelectionChangeRef, selectedMarkerStateRef });
    return;
  }

  const elementId = String(el?.id || "").trim();
  if (!elementId) {
    emitElementSelectionChange(null, { onElementSelectionChangeRef, selectedMarkerStateRef });
    return;
  }

  const bo = (el?.businessObject && typeof el.businessObject === "object" && !Array.isArray(el.businessObject))
    ? el.businessObject
    : {};

  const name = typeof readableBpmnText === "function"
    ? readableBpmnText(
        bo?.name,
        el?.label?.businessObject?.name,
        el?.label?.businessObject?.text,
        el?.businessObject?.label,
        el?.businessObject?.text,
      )
    : String(bo?.name || "").trim();

  const type = String(bo?.$type || el?.type || "").trim();
  const laneName = typeof readLaneNameForElement === "function" ? readLaneNameForElement(el) : "";

  const aiQuestions = typeof getAiQuestionsForElement === "function" ? getAiQuestionsForElement(elementId) : [];
  const aiStats = typeof aiQuestionStats === "function" ? aiQuestionStats(aiQuestions) : { total: 0, done: 0, withoutComment: 0 };

  const selectedIds = asArray(extra?.selectedIds)
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  const insertBetween = extra?.insertBetween && typeof extra.insertBetween === "object"
    ? { ...extra.insertBetween }
    : null;

  emitElementSelectionChange({
    id: elementId,
    name,
    type,
    laneName,
    selectedIds,
    selectedCount: selectedIds.length || 1,
    insertBetween,
    noteCount: typeof getElementNoteCount === "function" ? getElementNoteCount(elementId) : 0,
    aiQuestionCount: aiStats.total,
    aiQuestionDoneCount: aiStats.done,
    aiQuestionMissingCommentCount: aiStats.withoutComment,
    source,
  }, { onElementSelectionChangeRef, selectedMarkerStateRef });
}
