export function normalizeOverlayPropertyKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hueFromKey(key) {
  const normalized = normalizeOverlayPropertyKey(key) || "property";
  let hash = 23;
  for (let idx = 0; idx < normalized.length; idx += 1) {
    hash = (hash * 37 + normalized.charCodeAt(idx)) % 360;
  }
  return hash;
}

export function overlayPropertyColorByKey(keyRaw) {
  const key = normalizeOverlayPropertyKey(keyRaw);
  const hue = hueFromKey(key);
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
