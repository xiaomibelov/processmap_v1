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

  const targetKey = String(rows[targetIndex]?.name || "").trim().toLowerCase();
  if (!targetKey) {
    // Unnamed rows cannot be merged by logical key; delete the single target row.
    return rows.filter((_, i) => i !== targetIndex);
  }

  // The visible UI collapses duplicate names into one logical property.
  // Deleting any row of that logical key removes the whole key.
  return rows.filter((row) => String(row?.name || "").trim().toLowerCase() !== targetKey);
}
