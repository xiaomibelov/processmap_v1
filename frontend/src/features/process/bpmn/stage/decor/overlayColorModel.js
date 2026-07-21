export function normalizeOverlayPropertyKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Structured, predictable hues for well-known property names: a known
// property always gets the same, semantically stable color. Unknown names
// get a deterministic hash hue rendered with the SAME saturation/lightness,
// so every row is visibly colored and the palette stays harmonious.
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

function hueFromKey(key) {
  let hash = 23;
  for (let idx = 0; idx < key.length; idx += 1) {
    hash = (hash * 37 + key.charCodeAt(idx)) % 360;
  }
  return hash;
}

export function overlayPropertyColorByKey(keyRaw) {
  const key = normalizeOverlayPropertyKey(keyRaw);
  if (!key) {
    return { key, ...EMPTY_KEY_PALETTE };
  }
  const hue = PROPERTY_HUE_MAP[key] ?? hueFromKey(key);
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
