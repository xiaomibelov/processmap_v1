// Per-field chip filter for overlay preview rows (property-panel-redesign).
//
// Preview-level only: decides which property rows appear inside overlay cards
// (legacy + V2). It never touches the draft, the XML, or persisted state —
// hiding a field in the overlay does not delete the property.

function asText(value) {
  return typeof value === "string" ? value : "";
}

// Field name of a preview row: explicit `name` wins; otherwise the `key`
// (IO rows use "IN:<name>" / "OUT:<name>" — the direction prefix is stripped).
export function rowFieldName(row) {
  if (!row || typeof row !== "object") return "";
  const name = asText(row.name).trim();
  if (name) return name;
  const key = asText(row.key).trim();
  if (!key) return "";
  const colon = key.indexOf(":");
  return colon >= 0 ? key.slice(colon + 1).trim() : key;
}

// Returns a new array with rows whose field name is in visibleFields.
// A non-array visibleFields means "no filter configured" and yields a copy of
// the input; an empty array hides every row (all chips inactive).
export function filterRowsByVisibleFields(rowsRaw, visibleFieldsRaw) {
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  if (!Array.isArray(visibleFieldsRaw)) return [...rows];
  const allowed = new Set(visibleFieldsRaw.filter((field) => typeof field === "string"));
  return rows.filter((row) => allowed.has(rowFieldName(row)));
}
