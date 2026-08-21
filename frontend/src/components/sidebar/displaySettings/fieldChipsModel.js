// Per-field chips model (property-panel-redesign).
//
// Builds the chip list as the union of the selected element's property names,
// the organization dictionary names, and the quick-pin defaults (first
// occurrence wins). A chip is active when its field is NOT in hiddenFields —
// fields are active by default, chips only hide what the user turned off.

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

export function buildFieldChips({ elementPropertyNames, dictionaryNames, quickNames, hiddenFields } = {}) {
  const names = [
    ...asStringList(elementPropertyNames),
    ...asStringList(dictionaryNames),
    ...asStringList(quickNames),
  ];
  const seen = new Set();
  const hidden = Array.isArray(hiddenFields) ? new Set(hiddenFields) : new Set();
  const chips = [];
  names.forEach((name) => {
    if (seen.has(name)) return;
    seen.add(name);
    chips.push({ name, label: name, active: !hidden.has(name) });
  });
  return chips;
}

// Toggles whether a field is hidden; returns the new hiddenFields list.
// Never mutates the input.
export function toggleFieldHidden(hiddenFieldsRaw, nameRaw) {
  const current = asStringList(hiddenFieldsRaw);
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  if (!name) return current;
  return current.includes(name) ? current.filter((field) => field !== name) : [...current, name];
}
