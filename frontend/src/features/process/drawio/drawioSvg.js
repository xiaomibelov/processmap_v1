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

function sanitizeTestIdPart(raw) {
  return String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, "_")
    .slice(0, 128);
}

function decorateDrawioElementsWithTestIds(bodyRaw) {
  const body = String(bodyRaw || "");
  if (!body) return "";
  return body.replace(
    /<([a-zA-Z][a-zA-Z0-9:_-]*)([^>]*?)\s(id)\s*=\s*("([^"]+)"|'([^']+)')([^>]*)>/g,
    (fullMatch, tagName, beforeIdAttrs, _idKey, _idQuoted, idDouble, idSingle, afterAttrs) => {
      const idValue = String(idDouble || idSingle || "").trim();
      if (!idValue) return fullMatch;
      const combinedAttrs = `${String(beforeIdAttrs || "")}${String(afterAttrs || "")}`;
      if (/\sdata-testid\s*=/.test(combinedAttrs)) return fullMatch;
      const testId = sanitizeTestIdPart(idValue);
      if (!testId) return fullMatch;
      return `<${tagName}${beforeIdAttrs || ""} id="${idValue}" data-testid="drawio-el-${testId}"${afterAttrs || ""}>`;
    },
  );
}

export function parseDrawioSvgCache(svgRaw) {
  const sanitized = sanitizeDrawioSvg(svgRaw);
  if (!sanitized) return null;
  const svgMatch = sanitized.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (!svgMatch) return null;
  const attrs = String(svgMatch[1] || "");
  const body = String(svgMatch[2] || "").trim();
  const decoratedBody = decorateDrawioElementsWithTestIds(body);
  const width = readAttr(attrs, "width");
  const height = readAttr(attrs, "height");
  const viewBox = readAttr(attrs, "viewBox");
  const widthAttr = width ? ` width="${escapeAttr(width)}"` : "";
  const heightAttr = height ? ` height="${escapeAttr(height)}"` : "";
  const viewBoxAttr = viewBox ? ` viewBox="${escapeAttr(viewBox)}"` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"${widthAttr}${heightAttr}${viewBoxAttr}>${decoratedBody}</svg>`;
  return {
    svg,
    body: decoratedBody,
    width,
    height,
    viewBox,
  };
}
