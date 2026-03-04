function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function unique(values) {
  return Array.from(new Set(asArray(values).map((row) => toText(row)).filter(Boolean)));
}

export function buildTemplateFromSelection(idsRaw, meta = {}) {
  const ids = unique(idsRaw);
  if (!ids.length) {
    return { ok: false, error: "no_selection", template: null };
  }
  const elementTypes = unique(meta.elementTypes);
  const laneNames = unique(meta.laneNames);
  const title = toText(meta.title)
    || (toText(meta.primaryName) ? `Шаблон: ${toText(meta.primaryName)}` : `Шаблон ${ids.length}`);
  const template = {
    id: toText(meta.id),
    title,
    scope: toText(meta.scope || "personal") || "personal",
    bpmn_element_ids: ids,
    primary_element_id: toText(meta.primaryElementId || ids[0] || ""),
    selection_count: ids.length,
    element_types: elementTypes,
    lane_names: laneNames,
    source_session_id: toText(meta.sourceSessionId),
    notes: toText(meta.notes),
    meta: {
      source: toText(meta.source || "diagram_selection"),
    },
  };
  return { ok: true, error: "", template };
}
