function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function isNoteRow(rowRaw) {
  return toText(asObject(rowRaw).type).toLowerCase() === "note";
}

function normalizeRows(rowsRaw) {
  return asArray(rowsRaw)
    .map((rowRaw) => asObject(rowRaw))
    .filter((row) => Object.keys(row).length > 0);
}

export default function mergeDrawioHydrateNoteFields({
  current,
  incoming,
  explicitEmptyNoteIds,
}) {
  const currentMeta = asObject(current);
  const incomingMeta = asObject(incoming);
  const currentRows = normalizeRows(currentMeta.drawio_elements_v1);
  const incomingRows = normalizeRows(incomingMeta.drawio_elements_v1);
  if (!currentRows.length || !incomingRows.length) return incomingMeta;

  const localNoteById = new Map();
  currentRows.forEach((row) => {
    const id = toText(row.id);
    if (!id || !isNoteRow(row)) return;
    localNoteById.set(id, row);
  });
  if (!localNoteById.size) return incomingMeta;
  const explicitEmptyIds = new Set(
    asArray(explicitEmptyNoteIds).map((idRaw) => toText(idRaw)).filter(Boolean),
  );

  let changed = false;
  const mergedRows = incomingRows.map((row) => {
    const id = toText(row.id);
    if (!id) return row;
    const localNote = localNoteById.get(id);
    if (!localNote) return row;
    if (isNoteRow(row)) return row;
    changed = true;
    const next = {
      ...row,
      type: "note",
      width: localNote.width,
      height: localNote.height,
      style: asObject(localNote.style),
    };
    if (Object.prototype.hasOwnProperty.call(localNote, "text")) {
      next.text = localNote.text;
    } else if (explicitEmptyIds.has(id)) {
      next.text = "";
    }
    return next;
  });

  if (!changed) return incomingMeta;
  return {
    ...incomingMeta,
    drawio_elements_v1: mergedRows,
  };
}
