function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function elementId(rowRaw) {
  return String(asObject(rowRaw)?.id || "").trim();
}

function normalizeElementRows(rowsRaw) {
  if (!Array.isArray(rowsRaw)) return [];
  return rowsRaw
    .map((row) => asObject(row))
    .filter((row) => Object.keys(row).length > 0);
}

export default function mergeDrawioHydrateDeletions({
  current,
  incoming,
}) {
  const incomingMeta = asObject(incoming);
  const currentMeta = asObject(current);
  const currentRows = normalizeElementRows(currentMeta.drawio_elements_v1);

  const localDeletedById = new Map();
  currentRows.forEach((row) => {
    const id = elementId(row);
    if (!id || row.deleted !== true) return;
    localDeletedById.set(id, row);
  });
  if (!localDeletedById.size) return incomingMeta;

  const incomingRows = normalizeElementRows(incomingMeta.drawio_elements_v1);
  const incomingById = new Map();
  const mergedRows = incomingRows.map((row) => {
    const id = elementId(row);
    if (!id) return row;
    incomingById.set(id, row);
    if (!localDeletedById.has(id) || row.deleted === true) return row;
    return { ...row, deleted: true };
  });

  localDeletedById.forEach((row, id) => {
    if (incomingById.has(id)) return;
    mergedRows.push({ ...row, deleted: true });
  });

  return {
    ...incomingMeta,
    drawio_elements_v1: mergedRows,
  };
}
