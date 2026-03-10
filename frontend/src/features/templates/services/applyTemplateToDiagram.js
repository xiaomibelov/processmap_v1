function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

export async function applyTemplateToDiagram(bpmnApi, idsRaw, options = {}) {
  const ids = Array.from(new Set(asArray(idsRaw).map((row) => toText(row)).filter(Boolean)));
  if (!ids.length) {
    return {
      ok: false,
      error: "no_ids",
      count: 0,
      ids: [],
      applied: [],
      missing: [],
      warning: "",
    };
  }
  if (!bpmnApi || typeof bpmnApi.selectElements !== "function") {
    return {
      ok: false,
      error: "select_api_unavailable",
      count: 0,
      ids,
      applied: [],
      missing: ids,
      warning: "selection_api_unavailable",
    };
  }
  const result = await Promise.resolve(
    bpmnApi.selectElements(ids, {
      focusFirst: options.focusFirst !== false,
      markerClass: toText(options.markerClass || "fpcAttentionJumpFocus"),
    }),
  );
  if (result?.ok === false) {
    const resolvedMissing = asArray(result?.missingIds).map((row) => toText(row)).filter(Boolean);
    const resolvedApplied = asArray(result?.ids).map((row) => toText(row)).filter(Boolean);
    const softMissing = toText(result?.error) === "elements_not_found";
    return {
      ok: softMissing,
      error: softMissing ? "" : toText(result.error || "selection_apply_failed"),
      count: Number(result.count || resolvedApplied.length || 0),
      ids,
      applied: resolvedApplied,
      missing: resolvedMissing.length ? resolvedMissing : ids,
      warning: softMissing ? `template_partial_apply:${resolvedApplied.length}/${ids.length}` : "",
    };
  }
  const appliedIds = Array.from(new Set(asArray(result?.ids).map((row) => toText(row)).filter(Boolean)));
  const missingIds = Array.from(new Set(
    asArray(result?.missingIds).map((row) => toText(row)).filter(Boolean),
  ));
  const warning = missingIds.length ? `template_partial_apply:${appliedIds.length}/${ids.length}` : "";
  if (typeof bpmnApi.flashNode === "function") {
    appliedIds.slice(0, 3).forEach((id) => {
      void Promise.resolve(bpmnApi.flashNode(id, "accent", { label: toText(options.label || "Template") }));
    });
  }
  return {
    ok: true,
    error: "",
    count: Number(result?.count || appliedIds.length || 0),
    ids: appliedIds,
    applied: appliedIds,
    missing: missingIds,
    warning,
  };
}
