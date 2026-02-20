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
  return {
    id,
    text,
    createdAt,
    updatedAt,
  };
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
    if (!items.length) return;
    const updatedAt = toNumber(entry.updatedAt || entry.updated_at) || items[items.length - 1].updatedAt || Date.now();
    out[elementId] = {
      items,
      updatedAt,
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
  const prevItems = asArray(next[id]?.items);
  next[id] = {
    items: [...prevItems, note],
    updatedAt: now,
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
  const updatedAt = Math.max(
    toNumber(targetEntry.updatedAt || targetEntry.updated_at),
    toNumber(oldEntry.updatedAt || oldEntry.updated_at),
    Date.now(),
  );
  next[newId] = {
    items: mergedItems,
    updatedAt,
  };
  delete next[oldId];
  return next;
}
