// Per-field chip filter for overlay preview rows (property-panel-redesign).
//
// Preview-level only: decides which property rows appear inside overlay cards
// (legacy + V2). It never touches the draft, the XML, or persisted state —
// hiding a field in the overlay does not delete the property.
//
// Semantics are opt-out: a row is hidden only when its field is explicitly
// listed in hiddenFields. Fields are active by default, so newly discovered
// fields stay visible until the user hides them.

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

// Returns a new array without rows whose field name is in hiddenFields.
// A non-array hiddenFields means "no filter configured"; an empty array keeps
// every row (nothing hidden).
export function filterRowsByHiddenFields(rowsRaw, hiddenFieldsRaw) {
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  if (!Array.isArray(hiddenFieldsRaw)) return [...rows];
  const hidden = new Set(hiddenFieldsRaw.filter((field) => typeof field === "string"));
  if (hidden.size === 0) return [...rows];
  return rows.filter((row) => !hidden.has(rowFieldName(row)));
}
