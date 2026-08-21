const PATH_TIER_ORDER = ["P0", "P1", "P2"];
const PATH_TIER_SET = new Set(PATH_TIER_ORDER);

const PATH_TIER_ALIASES = new Map([
  ["IDEAL", "P0"],
  ["ИДЕАЛЬНЫЙ", "P0"],
  ["ИДЕАЛЬНАЯ", "P0"],
  ["ALTERNATIVE", "P1"],
  ["АЛЬТЕРНАТИВНЫЙ", "P1"],
  ["АЛЬТЕРНАТИВНАЯ", "P1"],
  ["RECOVERY", "P1"],
  ["ВОССТАНОВЛЕНИЕ", "P1"],
  ["ESCALATION", "P2"],
  ["FAILURE", "P2"],
  ["FAIL", "P2"],
  ["НЕУСПЕХ", "P2"],
  ["ЭСКАЛАЦИЯ", "P2"],
]);

export const PATH_TIER_LABELS = {
  P0: "Идеальный",
  P1: "Альтернативный",
  P2: "Неуспех / эскалация",
};

export function primitivePathValue(value, keys = ["value", "key", "code", "tier", "path"]) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (Array.isArray(value)) return "";
  if (typeof value !== "object") return "";
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const next = primitivePathValue(value[key], keys);
    if (next) return next;
  }
  return "";
}

export function normalizePathTier(value) {
  const raw = primitivePathValue(value).trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (PATH_TIER_SET.has(upper)) return upper;
  return PATH_TIER_ALIASES.get(upper) || "";
}

export function normalizePathTierList(value) {
  const rawList = Array.isArray(value) ? value : [value];
  const seen = new Set();
  return rawList
    .map((item) => normalizePathTier(item))
    .filter((tier) => {
      if (!tier || seen.has(tier)) return false;
      seen.add(tier);
      return true;
    })
    .sort((a, b) => PATH_TIER_ORDER.indexOf(a) - PATH_TIER_ORDER.indexOf(b));
}

export function normalizePathSequenceKey(value) {
  const raw = primitivePathValue(value, ["key", "value", "sequence_key", "sequenceKey", "id"]).trim().toLowerCase();
  if (!raw) return "";
  const compact = raw
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return compact.slice(0, 64);
}

export function formatPathTierLabel(value, fallback = "—") {
  const tier = normalizePathTier(value);
  return tier ? PATH_TIER_LABELS[tier] : fallback;
}

export function formatPathTierTitle(value, fallback = "Без приоритета") {
  const tier = normalizePathTier(value);
  return tier ? PATH_TIER_LABELS[tier] : fallback;
}
