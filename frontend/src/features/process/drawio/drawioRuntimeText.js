function toText(value) {
  return String(value || "").trim();
}

function toNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
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

function decodeXmlText(valueRaw) {
  return String(valueRaw || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseAttrs(attrsRaw) {
  const attrs = {};
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match = attrPattern.exec(String(attrsRaw || ""));
  while (match) {
    const key = toText(match[1]);
    const value = String(match[3] || match[4] || "");
    if (key) attrs[key] = value;
    match = attrPattern.exec(String(attrsRaw || ""));
  }
  return attrs;
}

function stringifyAttrs(attrsRaw = {}) {
  const attrs = attrsRaw && typeof attrsRaw === "object" ? attrsRaw : {};
  return Object.entries(attrs)
    .filter(([key]) => toText(key))
    .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
    .join("");
}

function readTextTagMatch(svgRaw, elementIdRaw) {
  const svg = String(svgRaw || "");
  const elementId = toText(elementIdRaw);
  if (!svg || !elementId) return null;
  const pattern = new RegExp(
    `(<text\\b([^>]*?)\\bid\\s*=\\s*["']${escapeRegExp(elementId)}["']([^>]*)>)([\\s\\S]*?)(<\\/text>)`,
    "i",
  );
  const match = svg.match(pattern);
  if (!match) return null;
  return {
    openTag: String(match[1] || ""),
    attrsRaw: `${String(match[2] || "")}${String(match[3] || "")}`,
    inner: String(match[4] || ""),
    closeTag: String(match[5] || ""),
    pattern,
  };
}

function estimateCharsPerLine(widthRaw, fontSizeRaw) {
  const width = Math.max(40, toNumber(widthRaw, 120));
  const fontSize = Math.max(8, toNumber(fontSizeRaw, 16));
  return Math.max(3, Math.floor(width / Math.max(5, fontSize * 0.62)));
}

function wrapTextByWidth(textRaw, widthRaw, fontSizeRaw) {
  const text = String(textRaw ?? "").replace(/\r\n/g, "\n");
  const maxChars = estimateCharsPerLine(widthRaw, fontSizeRaw);
  const paragraphs = text.split("\n");
  const lines = [];

  paragraphs.forEach((paragraph) => {
    const words = String(paragraph || "").split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      return;
    }
    let current = "";
    words.forEach((word) => {
      if (!current) {
        if (word.length <= maxChars) {
          current = word;
          return;
        }
        let rest = word;
        while (rest.length > maxChars) {
          lines.push(rest.slice(0, maxChars));
          rest = rest.slice(maxChars);
        }
        current = rest;
        return;
      }
      const candidate = `${current} ${word}`;
      if (candidate.length <= maxChars) {
        current = candidate;
        return;
      }
      lines.push(current);
      if (word.length <= maxChars) {
        current = word;
        return;
      }
      let rest = word;
      while (rest.length > maxChars) {
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      current = rest;
    });
    if (current || !lines.length) lines.push(current);
  });

  return lines.length ? lines : [""];
}

function renderLineSegments(lineRaw) {
  const line = String(lineRaw ?? "");
  const segments = [];
  const boldPattern = /\*\*([^*]*)\*\*/g;
  let lastIndex = 0;
  let match = boldPattern.exec(line);
  while (match) {
    if (match.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    lastIndex = match.index + match[0].length;
    match = boldPattern.exec(line);
  }
  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex), bold: false });
  }
  if (!segments.length) return escapeAttr(line);
  return segments.map(({ text, bold }) =>
    bold
      ? `<tspan font-weight="bold">${escapeAttr(text)}</tspan>`
      : escapeAttr(text),
  ).join("");
}

function renderWrappedTextInner({ lines = [], x = 0, y = 0, lineHeight = 20 }) {
  return lines.map((line, index) => {
    const inner = renderLineSegments(line);
    if (index === 0) {
      return `<tspan x="${escapeAttr(x)}" y="${escapeAttr(y)}">${inner}</tspan>`;
    }
    return `<tspan x="${escapeAttr(x)}" dy="${escapeAttr(lineHeight)}">${inner}</tspan>`;
  }).join("");
}

export function normalizeRuntimeTextWidth(valueRaw, fallback, { min = 80, max = 800 } = {}) {
  if (String(valueRaw ?? "").trim() === "") return Number(fallback || min);
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return Number(fallback || min);
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function readRuntimeTextState(svgRaw, elementIdRaw, options = {}) {
  const match = readTextTagMatch(svgRaw, elementIdRaw);
  if (!match) return null;
  const attrs = parseAttrs(match.attrsRaw);
  const docGeometry = options?.docGeometryRaw && typeof options.docGeometryRaw === "object" ? options.docGeometryRaw : {};
  const text = attrs["data-drawio-text-value"]
    ? decodeXmlText(attrs["data-drawio-text-value"])
    : decodeXmlText(String(match.inner || "").replace(/<\/tspan>\s*<tspan[^>]*>/gi, "\n").replace(/<[^>]+>/g, ""));
  const fontSize = Math.max(8, toNumber(attrs["font-size"], 16));
  const lineHeight = Math.max(fontSize + 4, toNumber(attrs["data-drawio-text-line-height"], fontSize + 4));
  const width = normalizeRuntimeTextWidth(
    attrs["data-drawio-text-width"] ?? docGeometry.width,
    docGeometry.width || 120,
  );
  const height = Math.max(
    30,
    toNumber(attrs["data-drawio-text-height"], toNumber(docGeometry.height, 30)),
  );
  return {
    attrs,
    text,
    x: toNumber(attrs.x, toNumber(docGeometry.x, 0)),
    y: toNumber(attrs.y, toNumber(docGeometry.y, 0)),
    width,
    height,
    fontSize,
    lineHeight,
    fill: toText(attrs.fill),
    fontFamily: toText(attrs["font-family"]),
  };
}

export function buildRuntimeWrappedTextMarkup({
  elementIdRaw,
  textRaw,
  xRaw,
  yRaw,
  widthRaw,
  fillRaw = "#0f172a",
  fontSizeRaw = 16,
  fontFamilyRaw = "Arial, sans-serif",
}) {
  const id = toText(elementIdRaw);
  if (!id) return "";
  const x = Math.round(toNumber(xRaw, 0) * 1000) / 1000;
  const y = Math.round(toNumber(yRaw, 0) * 1000) / 1000;
  const fontSize = Math.max(8, toNumber(fontSizeRaw, 16));
  const width = normalizeRuntimeTextWidth(widthRaw, 120);
  const lineHeight = Math.max(fontSize + 4, Math.round((fontSize + 4) * 1000) / 1000);
  const text = String(textRaw ?? "");
  const lines = wrapTextByWidth(text, width, fontSize);
  const height = Math.max(30, lines.length * lineHeight);
  const attrs = {
    id,
    x: String(x),
    y: String(y),
    fill: toText(fillRaw) || "#0f172a",
    "font-size": String(fontSize),
    "font-family": toText(fontFamilyRaw) || "Arial, sans-serif",
    "data-drawio-text-layout": "wrap",
    "data-drawio-text-value": text,
    "data-drawio-text-width": String(width),
    "data-drawio-text-height": String(height),
    "data-drawio-text-line-height": String(lineHeight),
  };
  return `<text${stringifyAttrs(attrs)}>${renderWrappedTextInner({ lines, x, y, lineHeight })}</text>`;
}

export function updateRuntimeTextLayout(svgRaw, elementIdRaw, options = {}) {
  const svg = toText(svgRaw);
  const match = readTextTagMatch(svg, elementIdRaw);
  if (!match) return { svg, state: null };
  const docGeometry = options?.docGeometryRaw && typeof options.docGeometryRaw === "object" ? options.docGeometryRaw : {};
  const currentState = readRuntimeTextState(svg, elementIdRaw, { docGeometryRaw: docGeometry });
  if (!currentState) return { svg, state: null };
  const nextText = options.textRaw != null ? String(options.textRaw) : currentState.text;
  const nextWidth = normalizeRuntimeTextWidth(options.widthRaw, currentState.width);
  const nextMarkup = buildRuntimeWrappedTextMarkup({
    elementIdRaw,
    textRaw: nextText,
    xRaw: currentState.x,
    yRaw: currentState.y,
    widthRaw: nextWidth,
    fillRaw: currentState.fill || currentState.attrs.fill,
    fontSizeRaw: currentState.fontSize,
    fontFamilyRaw: currentState.fontFamily || currentState.attrs["font-family"],
  });
  const nextSvg = svg.replace(match.pattern, nextMarkup);
  const nextState = readRuntimeTextState(nextSvg, elementIdRaw, { docGeometryRaw: docGeometry });
  return {
    svg: nextSvg,
    state: nextState,
  };
}
