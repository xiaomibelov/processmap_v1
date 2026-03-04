function toText(value) {
  return String(value || "").trim();
}

function escapeAttr(valueRaw) {
  return String(valueRaw || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function sanitizeDrawioSvg(svgRaw) {
  return toText(svgRaw)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
}

function readAttr(tagRaw, attrName) {
  const tag = String(tagRaw || "");
  const match = tag.match(new RegExp(`${String(attrName)}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? String(match[1] || "").trim() : "";
}

export function parseDrawioSvgCache(svgRaw) {
  const sanitized = sanitizeDrawioSvg(svgRaw);
  if (!sanitized) return null;
  const svgMatch = sanitized.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (!svgMatch) return null;
  const attrs = String(svgMatch[1] || "");
  const body = String(svgMatch[2] || "").trim();
  const width = readAttr(attrs, "width");
  const height = readAttr(attrs, "height");
  const viewBox = readAttr(attrs, "viewBox");
  const widthAttr = width ? ` width="${escapeAttr(width)}"` : "";
  const heightAttr = height ? ` height="${escapeAttr(height)}"` : "";
  const viewBoxAttr = viewBox ? ` viewBox="${escapeAttr(viewBox)}"` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"${widthAttr}${heightAttr}${viewBoxAttr}>${body}</svg>`;
  return {
    svg,
    body,
    width,
    height,
    viewBox,
  };
}
