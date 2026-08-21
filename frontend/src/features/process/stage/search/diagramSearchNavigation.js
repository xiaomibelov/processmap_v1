function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function getSearchResultElementId(resultRaw) {
  const result = asObject(resultRaw);
  return toText(result.elementId || result.id);
}

function getSubprocessPathIds(resultRaw) {
  const result = asObject(resultRaw);
  const ids = asArray(result.subprocessPath)
    .map((item) => toText(asObject(item).id || asObject(item).subprocessId || asObject(item).elementId))
    .filter(Boolean);
  const parentSubprocessId = toText(result.parentSubprocessId);
  if (parentSubprocessId && !ids.includes(parentSubprocessId)) ids.push(parentSubprocessId);
  return ids;
}

function isSubprocessSearchResult(resultRaw) {
  const result = asObject(resultRaw);
  return result.isInsideSubprocess === true
    || !!toText(result.parentSubprocessId)
    || getSubprocessPathIds(result).length > 0;
}

function describeMissingElement(setGenErr) {
  setGenErr?.("Элемент больше не найден на схеме.");
}

async function waitForDiagramReady(bpmnRef, expectedSid = "") {
  try {
    const ready = await Promise.resolve(
      bpmnRef?.current?.whenReady?.({
        timeoutMs: 5000,
        expectedSid: toText(expectedSid),
      }),
    );
    return ready !== false;
  } catch {
    return false;
  }
}

async function focusRenderedElement({
  bpmnRef,
  elementId,
  source,
  expectedSid = "",
  isStale,
} = {}) {
  const targetId = toText(elementId);
  if (!targetId) return { ok: false, error: "element_id_missing" };
  const ready = await waitForDiagramReady(bpmnRef, expectedSid);
  if (isStale?.()) return { ok: false, error: "stale" };
  if (!ready) return { ok: false, error: "not_ready" };

  const selected = bpmnRef?.current?.selectElements?.([targetId], {
    focusFirst: false,
    source: toText(source),
  });
  if (isStale?.()) return { ok: false, error: "stale" };
  if (!selected?.ok) {
    return {
      ok: false,
      error: toText(selected?.error) || "elements_not_found",
      selected,
    };
  }

  const focused = bpmnRef?.current?.focusNode?.(targetId, {
    markerClass: "fpcAttentionJumpFocus",
    durationMs: 1800,
    targetZoom: 0.92,
    centerInViewport: true,
    clearExistingSelection: true,
    source: toText(source),
  });
  if (isStale?.()) return { ok: false, error: "stale" };
  if (focused !== true) return { ok: false, error: "focus_failed", selected };
  return { ok: true, elementId: targetId, selected, focused };
}

async function openSubprocessPreviewFallback({
  bpmnRef,
  subprocessId,
  searchResult,
  onSubprocessPreviewResult,
  isStale,
} = {}) {
  const targetId = toText(subprocessId);
  if (!targetId) return { ok: false, error: "subprocess_id_missing" };
  let result = null;
  try {
    result = await Promise.resolve(
      bpmnRef?.current?.runDiagramContextAction?.({
        actionId: "open_inside",
        target: { id: targetId, kind: "element" },
        clientX: 0,
        clientY: 0,
        value: "",
      }),
    );
  } catch (error) {
    result = { ok: false, error: toText(error?.message || error || "context_action_failed") };
  }
  if (isStale?.()) return { ok: false, error: "stale" };
  if (!result?.ok) return { ok: false, error: toText(result?.error) || "open_inside_failed", result };
  onSubprocessPreviewResult?.(result, {
    menuTarget: { id: targetId, kind: "element" },
    searchResult: asObject(searchResult),
  });
  return { ok: true, result };
}

export async function navigateDiagramSearchResult(resultRaw, {
  bpmnRef,
  requestDiagramFocus,
  onSubprocessPreviewResult,
  setInfoMsg,
  setGenErr,
  source = "diagram_search",
  expectedSid = "",
  isStale,
} = {}) {
  const result = asObject(resultRaw);
  const elementId = getSearchResultElementId(result);
  if (!elementId) return { ok: false, error: "element_id_missing" };
  const normalizedSource = toText(source) || "diagram_search";

  if (!isSubprocessSearchResult(result)) {
    const requested = requestDiagramFocus?.(elementId, {
      source: normalizedSource,
      clearExistingSelection: true,
      centerInViewport: true,
    });
    return { ok: requested !== false, mode: "ordinary_focus_request", elementId };
  }

  const childFocus = await focusRenderedElement({
    bpmnRef,
    elementId,
    source: normalizedSource,
    expectedSid,
    isStale,
  });
  if (childFocus.ok || childFocus.error === "stale") {
    return {
      ...childFocus,
      mode: childFocus.ok ? "subprocess_child_focus" : "stale",
      childFocused: childFocus.ok === true,
    };
  }

  const subprocessIds = getSubprocessPathIds(result).reverse();
  for (const subprocessId of subprocessIds) {
    const preview = await openSubprocessPreviewFallback({
      bpmnRef,
      subprocessId,
      searchResult: result,
      onSubprocessPreviewResult,
      isStale,
    });
    if (preview.error === "stale") return { ok: false, error: "stale", mode: "stale" };
    if (!preview.ok) continue;

    const containerFocus = await focusRenderedElement({
      bpmnRef,
      elementId: subprocessId,
      source: `${normalizedSource}_subprocess_preview`,
      expectedSid,
      isStale,
    });
    if (containerFocus.error === "stale") return { ok: false, error: "stale", mode: "stale" };
    setInfoMsg?.("Элемент находится внутри subprocess. Открыт контекст subprocess.");
    return {
      ok: true,
      mode: "subprocess_preview_fallback",
      childFocused: false,
      containerFocused: containerFocus.ok === true,
      elementId,
      subprocessId,
      childError: childFocus.error,
      containerError: containerFocus.ok ? "" : toText(containerFocus.error),
    };
  }

  describeMissingElement(setGenErr);
  return {
    ok: false,
    mode: "subprocess_focus_failed",
    error: childFocus.error || "subprocess_focus_failed",
    elementId,
  };
}

export const __test__ = {
  getSubprocessPathIds,
  isSubprocessSearchResult,
};
