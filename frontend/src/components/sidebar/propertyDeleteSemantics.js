export function deleteExtensionPropertyRowsByDeleteAction(rowsRaw, rowIdRaw) {
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  const rowId = String(rowIdRaw || "").trim();
  if (!rowId) return rows;
  return rows.filter((row) => String(row?.id || "").trim() !== rowId);
}
