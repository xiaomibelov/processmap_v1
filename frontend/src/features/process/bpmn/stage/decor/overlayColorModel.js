export function normalizeOverlayPropertyKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Structured, predictable hues for well-known property names: a known
// property always gets the same, semantically stable color.
const PROPERTY_HUE_MAP = {
  ingredient: 217, // blue
  container: 160, // emerald
  ee_time: 0, // red
  equipment: 36, // amber
  responsible: 262, // violet
  operation_code: 190, // cyan
};

// Neutral palette for an empty/missing key only.
const EMPTY_KEY_PALETTE = {
  accent: "hsl(215 16% 47%)",
  background: "hsl(215 20% 90%)",
  text: "hsl(215 25% 27%)",
  mutedText: "hsl(215 14% 38%)",
  separator: "hsl(214 14% 50%)",
  shadow: "hsl(215 16% 47% / 0.22)",
};

// Fallback hues for non-mapped names: a fixed 20-degree grid with every slot
// closer than MIN_HUE_SEPARATION to a mapped hue removed. Two fallback colors
// are always >= 20 degrees apart, and any fallback color is >= 15 degrees away
// from a mapped one — so rows never visually merge.
const MIN_HUE_SEPARATION = 15;

function hueDistance(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

const RESERVED_HUES = Object.values(PROPERTY_HUE_MAP);
const FALLBACK_HUES = [];
for (let hue = 0; hue < 360; hue += 20) {
  if (RESERVED_HUES.every((reserved) => hueDistance(hue, reserved) >= MIN_HUE_SEPARATION)) {
    FALLBACK_HUES.push(hue);
  }
}

function fallbackHueFromKey(key) {
  let hash = 23;
  for (let idx = 0; idx < key.length; idx += 1) {
    hash = (hash * 37 + key.charCodeAt(idx)) % 9973;
  }
  return FALLBACK_HUES[hash % FALLBACK_HUES.length];
}

export function overlayPropertyColorByKey(keyRaw) {
  const key = normalizeOverlayPropertyKey(keyRaw);
  if (!key) {
    return { key, ...EMPTY_KEY_PALETTE };
  }
  const hue = PROPERTY_HUE_MAP[key] ?? fallbackHueFromKey(key);
  return {
    key,
    accent: `hsl(${hue} 62% 46%)`,
    background: `hsl(${hue} 74% 88%)`,
    text: `hsl(${hue} 48% 18%)`,
    mutedText: `hsl(${hue} 32% 28%)`,
    separator: `hsl(${hue} 28% 40%)`,
    shadow: `hsl(${hue} 62% 46% / 0.22)`,
  };
}
