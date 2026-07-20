export function normalizeOverlayPropertyKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Structured, predictable hues for well-known property names. Replaces the
// old hash-based hue (deterministic but visually chaotic): a known property
// always gets the same, semantically stable color; anything else falls back
// to a neutral slate palette so unknown keys do not scream random colors.
const PROPERTY_HUE_MAP = {
  ingredient: 217, // blue
  container: 160, // emerald
  ee_time: 0, // red
  equipment: 36, // amber
  responsible: 262, // violet
  operation_code: 190, // cyan
};

const FALLBACK_PALETTE = {
  accent: "hsl(215 16% 47%)",
  background: "hsl(210 20% 96%)",
  text: "hsl(215 25% 27%)",
  mutedText: "hsl(215 14% 38%)",
  separator: "hsl(214 14% 50%)",
  shadow: "hsl(215 16% 47% / 0.22)",
};

export function overlayPropertyColorByKey(keyRaw) {
  const key = normalizeOverlayPropertyKey(keyRaw);
  const hue = PROPERTY_HUE_MAP[key];
  if (hue === undefined) {
    return { key, ...FALLBACK_PALETTE };
  }
  return {
    key,
    accent: `hsl(${hue} 62% 46%)`,
    background: `hsl(${hue} 74% 95%)`,
    text: `hsl(${hue} 48% 18%)`,
    mutedText: `hsl(${hue} 32% 30%)`,
    separator: `hsl(${hue} 28% 44%)`,
    shadow: `hsl(${hue} 62% 46% / 0.22)`,
  };
}
