// Per-field chips model (property-panel-redesign).
//
// Builds the chip list as the union of the selected element's property names,
// the organization dictionary names, and the quick-pin defaults (first
// occurrence wins). Active state mirrors the persisted visibleFields list.

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  value.forEach((item) => {
    if (typeof item !== "string") return;
    const name = item.trim();
    if (!name || out.includes(name)) return;
    out.push(name);
  });
  return out;
}

export function buildFieldChips({ elementPropertyNames, dictionaryNames, quickNames, visibleFields } = {}) {
  const names = [
    ...asStringList(elementPropertyNames),
    ...asStringList(dictionaryNames),
    ...asStringList(quickNames),
  ];
  const seen = new Set();
  const active = Array.isArray(visibleFields) ? new Set(visibleFields) : null;
  const chips = [];
  names.forEach((name) => {
    if (seen.has(name)) return;
    seen.add(name);
    chips.push({ name, label: name, active: active === null ? true : active.has(name) });
  });
  return chips;
}

// Returns a new list with the field toggled. Never mutates the input.
export function toggleFieldName(visibleFieldsRaw, nameRaw) {
  const current = asStringList(visibleFieldsRaw);
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  if (!name) return current;
  return current.includes(name) ? current.filter((field) => field !== name) : [...current, name];
}
