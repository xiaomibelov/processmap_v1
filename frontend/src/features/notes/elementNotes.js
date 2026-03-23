function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeNoteItem(raw, fallbackIndex = 0) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const text = toText(obj.text || obj.note || raw);
  if (!text) return null;
  const now = Date.now();
  const createdAt = toNumber(obj.createdAt || obj.created_at || obj.ts) || now;
  const updatedAt = toNumber(obj.updatedAt || obj.updated_at || obj.ts) || createdAt;
  const id = toText(obj.id || obj.note_id || obj.noteId) || `note_${createdAt}_${fallbackIndex + 1}`;
  const normalized = {
    id,
    text,
    createdAt,
    updatedAt,
  };
  const kind = toText(obj.kind || obj.type).toLowerCase();
  if (kind) normalized.kind = kind;

  const statusRaw = toText(obj.status).toLowerCase();
  if (statusRaw === "open" || statusRaw === "resolved") {
    normalized.status = statusRaw;
  } else if (statusRaw === "reopened") {
    normalized.status = "open";
  }

  const sessionId = toText(obj.session_id || obj.sessionId);
  if (sessionId) normalized.session_id = sessionId;

  const anchorType = toText(obj.anchor_type || obj.anchorType).toLowerCase();
  if (anchorType) normalized.anchor_type = anchorType;
  const anchorId = toText(obj.anchor_id || obj.anchorId);
  if (anchorId) normalized.anchor_id = anchorId;
  const anchorLabel = toText(obj.anchor_label || obj.anchorLabel);
  if (anchorLabel) normalized.anchor_label = anchorLabel;
  const anchorPath = toText(obj.anchor_path || obj.anchorPath);
  if (anchorPath) normalized.anchor_path = anchorPath;

  const authorUserId = toText(obj.author_user_id || obj.authorUserId);
  if (authorUserId) normalized.author_user_id = authorUserId;
  const authorLabel = toText(obj.author_label || obj.authorLabel || obj.author || obj.user || obj.created_by);
  if (authorLabel) normalized.author_label = authorLabel;

  const resolvedByUserId = toText(obj.resolved_by_user_id || obj.resolvedByUserId);
  if (resolvedByUserId) normalized.resolved_by_user_id = resolvedByUserId;
  const resolvedByLabel = toText(obj.resolved_by_label || obj.resolvedByLabel);
  if (resolvedByLabel) normalized.resolved_by_label = resolvedByLabel;
  const resolvedAt = toNumber(obj.resolved_at || obj.resolvedAt);
  if (resolvedAt > 0) normalized.resolved_at = resolvedAt;
  return normalized;
}

export function normalizeElementNotesMap(value) {
  const source = asObject(value);
  const out = {};
  Object.entries(source).forEach(([rawElementId, rawEntry]) => {
    const elementId = toText(rawElementId);
    if (!elementId) return;
    const entry = asObject(rawEntry);
    const items = asArray(entry.items || entry.notes)
      .map((item, idx) => normalizeNoteItem(item, idx))
      .filter(Boolean);
    const summary = toText(entry.summary || entry.tldr || entry.summary_text);
    const templateKey = toText(entry.templateKey || entry.template_key);
    if (!items.length && !summary) return;
    const fallbackUpdatedAt = items.length ? toNumber(items[items.length - 1]?.updatedAt) : 0;
    const updatedAt = toNumber(entry.updatedAt || entry.updated_at) || fallbackUpdatedAt || Date.now();
    const summaryUpdatedAt = toNumber(entry.summaryUpdatedAt || entry.summary_updated_at || entry.tldr_updated_at)
      || (summary ? updatedAt : 0);
    out[elementId] = {
      items,
      updatedAt,
      summary,
      summaryUpdatedAt,
      templateKey,
    };
  });
  return out;
}

export function elementNotesForId(notesMap, elementId) {
  const map = normalizeElementNotesMap(notesMap);
  const id = toText(elementId);
  if (!id) return [];
  return asArray(map[id]?.items);
}

export function elementNotesCount(notesMap, elementId) {
  return elementNotesForId(notesMap, elementId).length;
}

export function elementNoteSummaryForId(notesMap, elementId) {
  const map = normalizeElementNotesMap(notesMap);
  const id = toText(elementId);
  if (!id) return "";
  return toText(map[id]?.summary);
}

export function withAddedElementNote(notesMap, elementId, text) {
  const id = toText(elementId);
  const noteText = toText(text);
  if (!id || !noteText) return normalizeElementNotesMap(notesMap);
  const now = Date.now();
  const note = {
    id: `note_${now}_${Math.random().toString(36).slice(2, 7)}`,
    text: noteText,
    createdAt: now,
    updatedAt: now,
  };
  const next = normalizeElementNotesMap(notesMap);
  const prev = asObject(next[id]);
  const prevItems = asArray(prev.items);
  next[id] = {
    items: [...prevItems, note],
    updatedAt: now,
    summary: toText(prev.summary),
    summaryUpdatedAt: toNumber(prev.summaryUpdatedAt || prev.summary_updated_at),
    templateKey: toText(prev.templateKey || prev.template_key),
  };
  return next;
}

export function withElementNoteSummary(notesMap, elementId, summary, options = {}) {
  const id = toText(elementId);
  if (!id) return normalizeElementNotesMap(notesMap);
  const next = normalizeElementNotesMap(notesMap);
  const prev = asObject(next[id]);
  const now = Date.now();
  const nextSummary = toText(summary);
  const nextTemplateKey = toText(options?.templateKey || prev.templateKey || prev.template_key);
  next[id] = {
    items: asArray(prev.items),
    updatedAt: toNumber(prev.updatedAt || prev.updated_at) || now,
    summary: nextSummary,
    summaryUpdatedAt: nextSummary ? now : 0,
    templateKey: nextTemplateKey,
  };
  return next;
}

export function withRemappedElementNotes(notesMap, oldElementId, newElementId) {
  const oldId = toText(oldElementId);
  const newId = toText(newElementId);
  const next = normalizeElementNotesMap(notesMap);
  if (!oldId || !newId || oldId === newId) return next;
  const oldEntry = asObject(next[oldId]);
  const oldItems = asArray(oldEntry.items);
  if (!oldItems.length) return next;

  const targetEntry = asObject(next[newId]);
  const targetItems = asArray(targetEntry.items);
  const mergedItems = [...targetItems, ...oldItems];
  const oldSummary = toText(oldEntry.summary || oldEntry.tldr || oldEntry.summary_text);
  const targetSummary = toText(targetEntry.summary || targetEntry.tldr || targetEntry.summary_text);
  const mergedSummary = targetSummary || oldSummary;
  const oldTemplateKey = toText(oldEntry.templateKey || oldEntry.template_key);
  const targetTemplateKey = toText(targetEntry.templateKey || targetEntry.template_key);
  const updatedAt = Math.max(
    toNumber(targetEntry.updatedAt || targetEntry.updated_at),
    toNumber(oldEntry.updatedAt || oldEntry.updated_at),
    Date.now(),
  );
  next[newId] = {
    items: mergedItems,
    updatedAt,
    summary: mergedSummary,
    summaryUpdatedAt: Math.max(
      toNumber(targetEntry.summaryUpdatedAt || targetEntry.summary_updated_at),
      toNumber(oldEntry.summaryUpdatedAt || oldEntry.summary_updated_at),
      mergedSummary ? Date.now() : 0,
    ),
    templateKey: targetTemplateKey || oldTemplateKey,
  };
  delete next[oldId];
  return next;
}
