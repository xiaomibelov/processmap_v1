export function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function asText(value) {
  return String(value ?? "").trim();
}

export function asArray(x) {
  if (Array.isArray(x)) return x;
  return x ? [x] : [];
}
