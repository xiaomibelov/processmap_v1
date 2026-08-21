import { readRuntimeTextState, updateRuntimeTextLayout } from "./drawioRuntimeText.js";

function toText(value) {
  return String(value || "").trim();
}

function escapeRegExp(valueRaw) {
  return String(valueRaw || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

export function extractDrawioElementIdsFromSvg(svgRaw, options = {}) {
  const parsed = parseDrawioSvgCache(svgRaw);
  const body = String(parsed?.body || "");
  if (!body) return [];
  const includeTechnical = options.includeTechnical === true;
  const TECHNICAL_TAGS = new Set([
    "defs",
    "clippath",
    "mask",
    "pattern",
    "lineargradient",
    "radialgradient",
    "marker",
    "filter",
    "style",
    "title",
    "desc",
    "metadata",
  ]);
  const TECHNICAL_ID_PATTERNS = [
    /^mx(?:clip|marker|gradient|pattern|shadow|filter|mask|defs)[-_]/i,
    /^clip[-_]/i,
    /^mask[-_]/i,
    /^filter[-_]/i,
    /^gradient[-_]/i,
    /^pattern[-_]/i,
    /^arrow[-_]/i,
  ];
  const ids = new Set();
  const re = /<([a-zA-Z][a-zA-Z0-9:_-]*)([^>]*?)\sid\s*=\s*("([^"]+)"|'([^']+)')([^>]*)>/g;
  let match = re.exec(body);
  while (match) {
    const tagName = String(match[1] || "").trim().toLowerCase();
    const id = toText(match[4] || match[5]);
    if (!id) {
      match = re.exec(body);
      continue;
    }
    if (!includeTechnical) {
      if (TECHNICAL_TAGS.has(tagName)) {
        match = re.exec(body);
        continue;
      }
      if (TECHNICAL_ID_PATTERNS.some((pattern) => pattern.test(id))) {
        match = re.exec(body);
        continue;
      }
    }
    ids.add(id);
    match = re.exec(body);
  }
  return Array.from(ids);
}

export function readDrawioTextElementContent(svgRaw, elementIdRaw) {
  return readRuntimeTextState(svgRaw, elementIdRaw)?.text ?? null;
}

export function updateDrawioTextElementContent(svgRaw, elementIdRaw, nextTextRaw) {
  return updateRuntimeTextLayout(svgRaw, elementIdRaw, { textRaw: nextTextRaw }).svg;
}

function upsertElementAttr(attrsRaw, attrNameRaw, attrValueRaw) {
  const attrs = String(attrsRaw || "");
  const attrName = String(attrNameRaw || "").trim();
  if (!attrName) return attrs;
  const attrPattern = new RegExp(`\\s${escapeRegExp(attrName)}\\s*=\\s*(\"([^\"]*)\"|'([^']*)')`, "i");
  const attrValue = attrValueRaw == null ? null : String(attrValueRaw);
  if (attrValue == null) {
    return attrs.replace(attrPattern, "");
  }
  if (attrPattern.test(attrs)) {
    return attrs.replace(attrPattern, ` ${attrName}="${escapeAttr(attrValue)}"`);
  }
  return `${attrs} ${attrName}="${escapeAttr(attrValue)}"`;
}

export function readDrawioElementSnapshot(svgRaw, elementIdRaw) {
  const svg = toText(svgRaw);
  const elementId = toText(elementIdRaw);
  if (!svg || !elementId) return null;
  const pattern = new RegExp(
    `<([a-zA-Z][a-zA-Z0-9:_-]*)\\b([^>]*?)\\bid\\s*=\\s*["']${escapeRegExp(elementId)}["']([^>]*)>`,
    "i",
  );
  const match = svg.match(pattern);
  if (!match) return null;
  const tagName = toText(match[1]).toLowerCase();
  const attrsRaw = `${String(match[2] || "")}${String(match[3] || "")}`;
  const attrs = {};
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let attrMatch = attrPattern.exec(attrsRaw);
  while (attrMatch) {
    const key = toText(attrMatch[1]);
    const value = String(attrMatch[3] || attrMatch[4] || "");
    if (key) attrs[key] = value;
    attrMatch = attrPattern.exec(attrsRaw);
  }
  return {
    tagName,
    attrs,
  };
}

export function updateDrawioElementAttributes(svgRaw, elementIdRaw, patchRaw = {}) {
  const svg = toText(svgRaw);
  const elementId = toText(elementIdRaw);
  const patch = patchRaw && typeof patchRaw === "object" ? patchRaw : {};
  if (!svg || !elementId || Object.keys(patch).length === 0) return svg;
  const pattern = new RegExp(
    `(<([a-zA-Z][a-zA-Z0-9:_-]*)\\b)([^>]*?\\bid\\s*=\\s*["']${escapeRegExp(elementId)}["'][^>]*?)(\\/?>)`,
    "i",
  );
  const match = svg.match(pattern);
  if (!match) return svg;
  return svg.replace(pattern, (_fullMatch, openPrefix, _tagName, attrsRaw, closePart) => {
    let nextAttrs = String(attrsRaw || "");
    Object.entries(patch).forEach(([key, value]) => {
      nextAttrs = upsertElementAttr(nextAttrs, key, value);
    });
    return `${openPrefix}${nextAttrs}${closePart}`;
  });
}
