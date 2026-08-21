export function deleteExtensionPropertyRowsByDeleteAction(rowsRaw, rowIdRaw) {
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  const rowId = String(rowIdRaw || "").trim();
  if (!rowId) return rows;

  const targetIndex = rows.findIndex((row) => String(row?.id || "").trim() === rowId);
  if (targetIndex === -1) {
    // Some consumers (e.g. raw rows without ids) generate an index-based id.
    // Handle the legacy sentinel so deletion still works for those rows.
    const match = /^prop_raw_(?<idx>\d+)$/i.exec(rowId);
    if (match) {
      const idx = Number(match.groups.idx) - 1;
      if (idx >= 0 && idx < rows.length) {
        return rows.filter((_, i) => i !== idx);
      }
    }
    return rows;
  }

  // Delete only the targeted row so duplicate property names can be managed
  // independently in the UI.
  return rows.filter((_, i) => i !== targetIndex);
}

export function bulkDeleteExtensionPropertyRows(rowsRaw, rowIdsRaw) {
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  const ids = new Set(
    (Array.isArray(rowIdsRaw) ? rowIdsRaw : [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean),
  );
  if (ids.size === 0) return rows;
  return rows.filter((row) => !ids.has(String(row?.id ?? "").trim()));
}
