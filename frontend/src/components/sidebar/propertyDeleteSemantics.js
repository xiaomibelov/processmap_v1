function normalizePropertyLogicalKey(valueRaw) {
  return String(valueRaw ?? "").trim().toLowerCase();
}

export function deleteExtensionPropertyRowsByDeleteAction(rowsRaw, rowIdRaw) {
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  const rowId = String(rowIdRaw || "").trim();
  if (!rowId) return rows;
  const target = rows.find((row) => String(row?.id || "").trim() === rowId) || null;
  if (!target) return rows;
  const targetLogicalKey = normalizePropertyLogicalKey(target?.name);
  if (!targetLogicalKey) {
    return rows.filter((row) => String(row?.id || "").trim() !== rowId);
  }
  return rows.filter((row) => normalizePropertyLogicalKey(row?.name) !== targetLogicalKey);
}

