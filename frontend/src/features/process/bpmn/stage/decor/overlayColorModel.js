export function normalizeOverlayPropertyKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hashOverlayKey(keyRaw) {
  const key = normalizeOverlayPropertyKey(keyRaw) || "property";
  let hash = 2166136261;
  for (let idx = 0; idx < key.length; idx += 1) {
    hash ^= key.charCodeAt(idx);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export const COLOR_FAMILIES = [
  {
    id: "navy",
    deep: { accent: "#26435F", bg: "#DCE7F1", border: "#26435F", text: "#172B3F" },
    muted: { accent: "#4E6B86", bg: "#EAF1F7", border: "#4E6B86", text: "#24384A" },
    signal: { accent: "#2F6FED", bg: "#DCE8FF", border: "#2F6FED", text: "#163A7A" },
  },
  {
    id: "indigo",
    deep: { accent: "#3E4F7A", bg: "#E2E7F3", border: "#3E4F7A", text: "#25314C" },
    muted: { accent: "#62729A", bg: "#EEF1F8", border: "#62729A", text: "#33415E" },
    signal: { accent: "#5B6CFF", bg: "#E3E7FF", border: "#5B6CFF", text: "#2B3580" },
  },
  {
    id: "blue",
    deep: { accent: "#2C5B8A", bg: "#E1EEF8", border: "#2C5B8A", text: "#193954" },
    muted: { accent: "#5A84AD", bg: "#EDF5FB", border: "#5A84AD", text: "#294762" },
    signal: { accent: "#1395FF", bg: "#DDF1FF", border: "#1395FF", text: "#0F4D80" },
  },
  {
    id: "cyan",
    deep: { accent: "#216A7A", bg: "#DDF0F4", border: "#216A7A", text: "#16444D" },
    muted: { accent: "#4C8E9C", bg: "#EAF7F9", border: "#4C8E9C", text: "#24545D" },
    signal: { accent: "#00B8D9", bg: "#DDF9FF", border: "#00B8D9", text: "#0C5A68" },
  },
  {
    id: "teal",
    deep: { accent: "#1F6B63", bg: "#DDF1EE", border: "#1F6B63", text: "#15453F" },
    muted: { accent: "#4D8D84", bg: "#EAF7F4", border: "#4D8D84", text: "#255750" },
    signal: { accent: "#00A88F", bg: "#DDFBF5", border: "#00A88F", text: "#0D5C50" },
  },
  {
    id: "emerald",
    deep: { accent: "#2A6A46", bg: "#E2F2E8", border: "#2A6A46", text: "#1A442E" },
    muted: { accent: "#5C8F6F", bg: "#EEF8F1", border: "#5C8F6F", text: "#2E5A42" },
    signal: { accent: "#17B26A", bg: "#DDF8EA", border: "#17B26A", text: "#0E5C39" },
  },
  {
    id: "olive",
    deep: { accent: "#667224", bg: "#EEF1DD", border: "#667224", text: "#3C4513" },
    muted: { accent: "#8B8F3E", bg: "#F5F7E5", border: "#8B8F3E", text: "#565A24" },
    signal: { accent: "#A4B826", bg: "#F1F8D3", border: "#A4B826", text: "#556313" },
  },
  {
    id: "lime",
    deep: { accent: "#4F7218", bg: "#E8F2D7", border: "#4F7218", text: "#2E470E" },
    muted: { accent: "#6F9640", bg: "#EAF6D6", border: "#6F9640", text: "#36501C" },
    signal: { accent: "#88B700", bg: "#E7F8C8", border: "#88B700", text: "#466100" },
  },
  {
    id: "ochre",
    deep: { accent: "#7A661D", bg: "#F3E8CE", border: "#7A661D", text: "#4E3F12" },
    muted: { accent: "#9A7F34", bg: "#F9EFD8", border: "#9A7F34", text: "#5F4B1B" },
    signal: { accent: "#C9A129", bg: "#FDEFC9", border: "#C9A129", text: "#73590F" },
  },
  {
    id: "amber",
    deep: { accent: "#97511B", bg: "#F6E2D4", border: "#97511B", text: "#5F3010" },
    muted: { accent: "#C17837", bg: "#FDE9D8", border: "#C17837", text: "#6A3D15" },
    signal: { accent: "#E88B2A", bg: "#FFE8CF", border: "#E88B2A", text: "#7C470C" },
  },
  {
    id: "rust",
    deep: { accent: "#8E3E2E", bg: "#F3DDD8", border: "#8E3E2E", text: "#5A261B" },
    muted: { accent: "#B35A47", bg: "#FCE7E2", border: "#B35A47", text: "#6A3024" },
    signal: { accent: "#E56645", bg: "#FFE4DD", border: "#E56645", text: "#7C2F19" },
  },
  {
    id: "red",
    deep: { accent: "#9A3B3B", bg: "#F8E4E4", border: "#9A3B3B", text: "#642626" },
    muted: { accent: "#B76767", bg: "#FCEEEE", border: "#B76767", text: "#743B3B" },
    signal: { accent: "#E5484D", bg: "#FFE5E6", border: "#E5484D", text: "#8A2328" },
  },
  {
    id: "rose",
    deep: { accent: "#94415C", bg: "#F7E6EC", border: "#94415C", text: "#61293C" },
    muted: { accent: "#B36B82", bg: "#FBEFF3", border: "#B36B82", text: "#753E55" },
    signal: { accent: "#F0447C", bg: "#FFE4EC", border: "#F0447C", text: "#8A2045" },
  },
  {
    id: "plum",
    deep: { accent: "#7A4A73", bg: "#F1E7F0", border: "#7A4A73", text: "#4E304A" },
    muted: { accent: "#9A6C94", bg: "#F7EFF6", border: "#9A6C94", text: "#653F61" },
    signal: { accent: "#C25AD6", bg: "#FBE6FF", border: "#C25AD6", text: "#742B84" },
  },
  {
    id: "violet",
    deep: { accent: "#69518A", bg: "#EEE8F6", border: "#69518A", text: "#45335B" },
    muted: { accent: "#8770A6", bg: "#F4F0FA", border: "#8770A6", text: "#58476D" },
    signal: { accent: "#9B6CFF", bg: "#EFE6FF", border: "#9B6CFF", text: "#5D36A0" },
  },
  {
    id: "cocoa",
    deep: { accent: "#5F4C40", bg: "#ECE3DC", border: "#5F4C40", text: "#3F3027" },
    muted: { accent: "#7E6656", bg: "#F4ECE6", border: "#7E6656", text: "#4F3B2F" },
    signal: { accent: "#A07252", bg: "#F8EBDD", border: "#A07252", text: "#633E28" },
  },
];

const TONE_SEQUENCE = ["muted", "deep", "signal"];
const FAMILY_OFFSETS = [0, 5, 10, 3, 8, 13, 2, 7, 12, 15, 4, 9, 14, 1, 6, 11];
const SPATIAL_WINDOW_SIZE = 6;
const FAMILY_GROUPS = [
  ["navy", "indigo", "blue"],
  ["cyan", "teal"],
  ["emerald", "olive", "lime"],
  ["ochre", "amber", "rust", "cocoa"],
  ["red", "rose"],
  ["plum", "violet"],
];

const FAMILY_TO_GROUP = (() => {
  const out = new Map();
  FAMILY_GROUPS.forEach((group, groupIndex) => {
    group.forEach((familyId) => out.set(String(familyId || ""), groupIndex));
  });
  return out;
})();

const CURATED_FAMILY_BY_PROPERTY_NAME = Object.freeze({
  container: "cocoa",
  tara: "lime",
  ingredient: "emerald",
  equipment: "indigo",
  machine: "indigo",
  operator: "navy",
  line: "blue",
  zone: "teal",
  location: "teal",
  stage: "violet",
  step: "violet",
  status: "cyan",
  priority: "rose",
  batch: "amber",
  lot: "amber",
  recipe: "ochre",
  sku: "ochre",
  material: "olive",
  product: "olive",
  resource: "lime",
  temperature: "red",
  pressure: "rust",
  humidity: "cyan",
  density: "blue",
  weight: "cocoa",
  volume: "cocoa",
  duration: "plum",
  time: "plum",
  date: "navy",
  comment: "navy",
  note: "navy",
  // RU aliases for frequent business fields
  контейнер: "cocoa",
  тара: "lime",
  ингредиент: "emerald",
  оборудование: "indigo",
  оператор: "navy",
  линия: "blue",
  зона: "teal",
  стадия: "violet",
  статус: "cyan",
  приоритет: "rose",
  партия: "amber",
  материал: "olive",
  продукт: "olive",
  температура: "red",
  давление: "rust",
  влажность: "cyan",
  длительность: "plum",
});

const CURATED_FAMILY_BY_TOKEN_PREFIX = Object.freeze([
  { prefix: "container", familyId: "cocoa" },
  { prefix: "контейнер", familyId: "cocoa" },
  { prefix: "tray", familyId: "cocoa" },
  { prefix: "лоток", familyId: "cocoa" },
  { prefix: "противень", familyId: "cocoa" },
]);

const FAMILY_ID_TO_SLOT = (() => {
  const out = new Map();
  COLOR_FAMILIES.forEach((family, index) => out.set(String(family?.id || ""), index));
  return out;
})();

function normalizeSlot(slotRaw) {
  const size = COLOR_FAMILIES.length;
  const slot = Number(slotRaw);
  if (!Number.isFinite(slot) || size <= 0) return 0;
  return ((Math.trunc(slot) % size) + size) % size;
}

function familyDistance(leftRaw, rightRaw) {
  const size = COLOR_FAMILIES.length;
  const left = normalizeSlot(leftRaw);
  const right = normalizeSlot(rightRaw);
  const delta = Math.abs(left - right);
  return Math.min(delta, size - delta);
}

function preferredFamilySlotForKey(keyRaw) {
  const hash = hashOverlayKey(keyRaw);
  return normalizeSlot(hash % COLOR_FAMILIES.length);
}

function resolveCuratedFamilyId(keyRaw) {
  const key = normalizeOverlayPropertyKey(keyRaw);
  if (!key) return "";
  const directFamily = String(CURATED_FAMILY_BY_PROPERTY_NAME[key] || "");
  if (directFamily) return directFamily;

  const tokenized = key.replace(/[_.:/\\-]+/g, " ");
  const tokens = tokenized.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const tokenFamily = String(CURATED_FAMILY_BY_PROPERTY_NAME[token] || "");
    if (tokenFamily) return tokenFamily;
    const prefixMatch = CURATED_FAMILY_BY_TOKEN_PREFIX.find((rule) => token.startsWith(rule.prefix));
    if (prefixMatch?.familyId) return String(prefixMatch.familyId);
  }

  const keyPrefixMatch = CURATED_FAMILY_BY_TOKEN_PREFIX.find((rule) => key.includes(rule.prefix));
  if (keyPrefixMatch?.familyId) return String(keyPrefixMatch.familyId);
  return "";
}

function curatedFamilySlotForKey(keyRaw) {
  const familyId = resolveCuratedFamilyId(keyRaw);
  if (!familyId) return null;
  if (!FAMILY_ID_TO_SLOT.has(familyId)) return null;
  return normalizeSlot(FAMILY_ID_TO_SLOT.get(familyId));
}

function stableFamilySlotForKey(keyRaw) {
  const curated = curatedFamilySlotForKey(keyRaw);
  if (Number.isFinite(curated)) return curated;
  return preferredFamilySlotForKey(keyRaw);
}

function familyIdBySlot(slotRaw) {
  return String(COLOR_FAMILIES[normalizeSlot(slotRaw)]?.id || "");
}

function familyGroupBySlot(slotRaw) {
  return Number(FAMILY_TO_GROUP.get(familyIdBySlot(slotRaw)) ?? -1);
}

function buildSpatialWindowStats(spatialWindowRaw) {
  const windowEntries = Array.isArray(spatialWindowRaw)
    ? spatialWindowRaw.filter((entry) => entry && typeof entry === "object").slice(-SPATIAL_WINDOW_SIZE)
    : [];
  const familyCounts = new Map();
  const groupCounts = new Map();
  const familyLastTone = new Map();
  const dominantTones = [];
  const leadTones = [];

  windowEntries.forEach((entryRaw) => {
    const entry = entryRaw && typeof entryRaw === "object" ? entryRaw : {};
    const families = Array.isArray(entry.families) ? entry.families.map((value) => String(value || "")) : [];
    const uniqueFamilies = Array.from(new Set(families.filter(Boolean)));
    uniqueFamilies.forEach((familyId) => {
      familyCounts.set(familyId, Number(familyCounts.get(familyId) || 0) + 1);
      const group = Number(FAMILY_TO_GROUP.get(familyId) ?? -1);
      if (group >= 0) {
        groupCounts.set(group, Number(groupCounts.get(group) || 0) + 1);
      }
    });
    const dominantTone = String(entry.dominantTone || "");
    if (dominantTone) dominantTones.push(dominantTone);
    const leadTone = String(entry.leadTone || "");
    if (leadTone) leadTones.push(leadTone);
    const familyTonePairs = Array.isArray(entry.familyTonePairs) ? entry.familyTonePairs : [];
    familyTonePairs.forEach((pairRaw) => {
      const pair = pairRaw && typeof pairRaw === "object" ? pairRaw : {};
      const familyId = String(pair.familyId || "");
      const toneId = String(pair.toneId || "");
      if (!familyId || !toneId) return;
      familyLastTone.set(familyId, toneId);
    });
  });

  const lastDominantTone = dominantTones.length ? dominantTones[dominantTones.length - 1] : "";
  let sameToneRun = 0;
  for (let idx = dominantTones.length - 1; idx >= 0; idx -= 1) {
    if (dominantTones[idx] !== lastDominantTone) break;
    sameToneRun += 1;
  }

  return {
    familyCounts,
    groupCounts,
    familyLastTone,
    lastDominantTone,
    sameToneRun,
    lastLeadTone: leadTones.length ? leadTones[leadTones.length - 1] : "",
  };
}

function toneTargets(totalRaw) {
  const total = Math.max(0, Number(totalRaw) || 0);
  if (total <= 2) return { muted: total, deep: 0, signal: 0 };
  let signal = Math.floor(total * 0.15);
  let deep = Math.max(1, Math.round(total * 0.25));
  if (deep + signal > total) deep = Math.max(0, total - signal);
  let muted = Math.max(0, total - deep - signal);

  const mutedMin = Math.ceil(total * 0.6);
  if (muted < mutedMin) {
    const need = mutedMin - muted;
    const fromDeep = Math.min(need, Math.max(0, deep - 1));
    deep -= fromDeep;
    muted += fromDeep;
    const stillNeed = mutedMin - muted;
    if (stillNeed > 0) {
      const fromSignal = Math.min(stillNeed, signal);
      signal -= fromSignal;
      muted += fromSignal;
    }
  }
  return { muted, deep, signal };
}

function chooseFamilySlotForCluster({
  keyRaw,
  usedSlots = null,
  recentSlots = null,
  clusterSize = 0,
  spatialStats = null,
} = {}) {
  void usedSlots;
  void recentSlots;
  void clusterSize;
  void spatialStats;
  return stableFamilySlotForKey(keyRaw);
}

function chooseToneForCluster({
  familyId = "",
  familyUseCount = 0,
  slot,
  previousSlot = null,
  previousTone = "muted",
  tonesHistory = [],
  toneCounts,
  targets,
  spatialStats = null,
} = {}) {
  const counts = toneCounts || { muted: 0, deep: 0, signal: 0 };
  const quota = targets || { muted: 0, deep: 0, signal: 0 };
  const recentTones = Array.isArray(tonesHistory) ? tonesHistory.slice(-2) : [];
  const stats = spatialStats && typeof spatialStats === "object"
    ? spatialStats
    : { lastDominantTone: "", sameToneRun: 0, lastLeadTone: "", familyLastTone: new Map() };
  const repeatedMutedRun = recentTones.length >= 2 && recentTones.every((tone) => tone === "muted");
  const similarFamily = Number.isFinite(previousSlot) && familyDistance(slot, previousSlot) <= 2;
  const sameFamily = Number.isFinite(previousSlot) && familyDistance(slot, previousSlot) === 0;
  const previousSpatialToneForFamily = String(stats.familyLastTone?.get?.(familyId) || "");

  let order = TONE_SEQUENCE.slice();
  if (sameFamily) {
    order = ["deep", "signal", "muted"];
  } else if (Number(familyUseCount || 0) > 0) {
    order = familyUseCount > 1 ? ["signal", "deep", "muted"] : ["deep", "muted", "signal"];
  } else if (similarFamily || repeatedMutedRun) {
    order = ["deep", "muted", "signal"];
  }

  const scored = order.map((tone, orderIndex) => {
    const count = Number(counts[tone] || 0);
    const target = Number(quota[tone] || 0);
    let penalty = orderIndex * 3;
    if (count >= target) penalty += (count - target + 1) * 24;
    if (tone === "signal") penalty += 14;
    if (tone === previousTone) penalty += 8;
    if (stats.lastDominantTone && tone === stats.lastDominantTone) {
      penalty += 22 + Math.max(0, Number(stats.sameToneRun || 0) - 1) * 8;
    }
    if (!recentTones.length && stats.lastLeadTone && tone === stats.lastLeadTone) {
      penalty += 28;
    }
    if (previousSpatialToneForFamily && tone === previousSpatialToneForFamily) {
      penalty += 34;
    }
    if (familyUseCount > 0 && tone === "muted") {
      penalty += 18;
    }
    return { tone, penalty, orderIndex };
  });

  scored.sort((left, right) => left.penalty - right.penalty || left.orderIndex - right.orderIndex);
  return scored[0]?.tone || "muted";
}

function toColorModel(slotRaw, toneRaw, keyRaw) {
  const slot = normalizeSlot(slotRaw);
  const key = normalizeOverlayPropertyKey(keyRaw);
  const family = COLOR_FAMILIES[slot];
  const tone = TONE_SEQUENCE.includes(toneRaw) ? toneRaw : "muted";
  const palette = family[tone] || family.muted;
  return {
    key,
    slot,
    familyId: family.id,
    toneId: tone,
    accent: palette.accent,
    background: palette.bg,
    border: palette.border,
    text: palette.text,
    shadow: palette.accent,
    ring: palette.accent,
  };
}

export function overlayPropertyColorPlanForItems(itemsRaw, optionsRaw = null) {
  void optionsRaw;
  const items = Array.isArray(itemsRaw) ? itemsRaw : [];
  return items.map((itemRaw, index) => {
    const item = itemRaw && typeof itemRaw === "object" ? itemRaw : {};
    const key = normalizeOverlayPropertyKey(item.key || item.label) || `__row_${index + 1}`;
    const slot = stableFamilySlotForKey(key);
    return toColorModel(slot, "muted", key);
  });
}

export function overlayPropertyColorByKey(keyRaw) {
  const key = normalizeOverlayPropertyKey(keyRaw);
  return toColorModel(stableFamilySlotForKey(key), "muted", key);
}
