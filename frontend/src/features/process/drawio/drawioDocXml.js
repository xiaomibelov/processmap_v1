function toText(value) {
  return String(value || "").trim();
}

function escapeRegExp(valueRaw) {
  return String(valueRaw || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

function escapeXml(valueRaw) {
  return String(valueRaw || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const DRAWIO_EMPTY_DOC_XML = "<mxfile host=\"ProcessMap\" version=\"1\"><diagram id=\"page-1\" name=\"Page-1\"><mxGraphModel dx=\"960\" dy=\"720\" grid=\"1\" gridSize=\"10\" guides=\"1\" tooltips=\"1\" connect=\"1\" arrows=\"1\" fold=\"1\" page=\"1\" pageScale=\"1\" pageWidth=\"1169\" pageHeight=\"827\" math=\"0\" shadow=\"0\"><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/></root></mxGraphModel></diagram></mxfile>";

function buildRuntimeCellSpec({ toolIdRaw, pointRaw = {} }) {
  const toolId = toText(toolIdRaw).toLowerCase();
  const x = toNumber(pointRaw.x, 0);
  const y = toNumber(pointRaw.y, 0);
  if (toolId === "rect") {
    return {
      value: "",
      style: "rounded=1;whiteSpace=wrap;html=1;fillColor=#dbeafe;strokeColor=#2563eb;strokeWidth=2;",
      x: x - 60,
      y: y - 30,
      width: 120,
      height: 60,
    };
  }
  if (toolId === "container") {
    return {
      value: "",
      style: "swimlane;container=1;horizontal=0;startSize=24;collapsible=0;strokeColor=#334155;fillColor=#f8fafc;strokeWidth=2;",
      x: x - 100,
      y: y - 60,
      width: 200,
      height: 120,
    };
  }
  if (toolId === "text") {
    return {
      value: "Text",
      style: "text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;",
      x,
      y,
      width: 120,
      height: 30,
    };
  }
  return null;
}

function buildRuntimeCellXml({ elementIdRaw, toolIdRaw, pointRaw }) {
  const elementId = toText(elementIdRaw);
  const spec = buildRuntimeCellSpec({ toolIdRaw, pointRaw });
  if (!elementId || !spec) return "";
  return [
    `<mxCell id="${escapeXml(elementId)}" value="${escapeXml(spec.value)}" style="${escapeXml(spec.style)}" parent="1" vertex="1">`,
    `  <mxGeometry x="${toNumber(spec.x, 0)}" y="${toNumber(spec.y, 0)}" width="${toNumber(spec.width, 0)}" height="${toNumber(spec.height, 0)}" as="geometry"/>`,
    "</mxCell>",
  ].join("");
}

function docXmlContainsCellId(docXmlRaw, elementIdRaw) {
  const docXml = String(docXmlRaw || "");
  const elementId = escapeXml(toText(elementIdRaw));
  if (!elementId) return false;
  return new RegExp(`<mxCell\\b[^>]*\\bid\\s*=\\s*["']${elementId}["']`, "i").test(docXml);
}

export function promoteRuntimeElementIntoDrawioDoc(docXmlRaw, payloadRaw = {}) {
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
  const elementId = toText(payload.elementId || payload.id);
  if (!elementId) return toText(docXmlRaw);
  const cellXml = buildRuntimeCellXml({
    elementIdRaw: elementId,
    toolIdRaw: payload.toolId,
    pointRaw: payload.point,
  });
  if (!cellXml) return toText(docXmlRaw);

  const docXml = toText(docXmlRaw);
  const baseDocXml = docXml.startsWith("<mxfile") ? docXml : DRAWIO_EMPTY_DOC_XML;
  if (docXmlContainsCellId(baseDocXml, elementId)) return baseDocXml;

  if (/<root\b[\s\S]*<\/root>/i.test(baseDocXml)) {
    return baseDocXml.replace(/<\/root>/i, `${cellXml}</root>`);
  }
  if (/<mxGraphModel\b/i.test(baseDocXml)) {
    return baseDocXml.replace(
      /<\/mxGraphModel>/i,
      `<root><mxCell id="0"/><mxCell id="1" parent="0"/>${cellXml}</root></mxGraphModel>`,
    );
  }
  if (/<diagram\b/i.test(baseDocXml)) {
    return baseDocXml.replace(
      /<\/diagram>/i,
      `<mxGraphModel dx="960" dy="720" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cellXml}</root></mxGraphModel></diagram>`,
    );
  }
  return DRAWIO_EMPTY_DOC_XML.replace(/<\/root>/i, `${cellXml}</root>`);
}

export function drawioDocXmlContainsElementId(docXmlRaw, elementIdRaw) {
  return docXmlContainsCellId(docXmlRaw, elementIdRaw);
}

export function readDrawioDocXmlCellGeometry(docXmlRaw, elementIdRaw) {
  const docXml = toText(docXmlRaw);
  const elementId = toText(elementIdRaw);
  if (!docXml || !elementId) return null;
  const cellPattern = new RegExp(
    `<mxCell\\b[^>]*\\bid\\s*=\\s*["']${escapeRegExp(elementId)}["'][^>]*>([\\s\\S]*?)<\\/mxCell>`,
    "i",
  );
  const cellMatch = docXml.match(cellPattern);
  if (!cellMatch) return null;
  const geometryMatch = String(cellMatch[1] || "").match(/<mxGeometry\b([^>]*?)\/>/i);
  if (!geometryMatch) return null;
  const attrs = String(geometryMatch[1] || "");
  return {
    x: toNumber((attrs.match(/\bx\s*=\s*["']([^"']+)["']/i) || [])[1], 0),
    y: toNumber((attrs.match(/\by\s*=\s*["']([^"']+)["']/i) || [])[1], 0),
    width: toNumber((attrs.match(/\bwidth\s*=\s*["']([^"']+)["']/i) || [])[1], 0),
    height: toNumber((attrs.match(/\bheight\s*=\s*["']([^"']+)["']/i) || [])[1], 0),
  };
}

export function updateDrawioDocXmlCellValue(docXmlRaw, elementIdRaw, valueRaw) {
  const docXml = toText(docXmlRaw);
  const elementId = toText(elementIdRaw);
  if (!docXml || !elementId) return docXml;
  const escapedValue = escapeXml(String(valueRaw ?? ""));
  const tagPattern = new RegExp(
    `<mxCell\\b([^>]*?)\\bid\\s*=\\s*["']${escapeRegExp(elementId)}["']([^>]*?)(\\/?)>`,
    "i",
  );
  const match = docXml.match(tagPattern);
  if (!match) return docXml;
  return docXml.replace(tagPattern, (fullMatch) => {
    if (/\bvalue\s*=/.test(fullMatch)) {
      return fullMatch.replace(/\bvalue\s*=\s*("([^"]*)"|'([^']*)')/i, `value="${escapedValue}"`);
    }
    if (/\/>$/.test(fullMatch)) {
      return fullMatch.replace(/\/>$/, ` value="${escapedValue}"/>`);
    }
    return fullMatch.replace(/>$/, ` value="${escapedValue}">`);
  });
}

function parseCellStyle(styleRaw) {
  const tokens = String(styleRaw || "").split(";").map((row) => toText(row)).filter(Boolean);
  const out = new Map();
  tokens.forEach((token) => {
    const idx = token.indexOf("=");
    if (idx <= 0) return;
    const key = toText(token.slice(0, idx));
    const value = token.slice(idx + 1);
    if (!key) return;
    out.set(key, value);
  });
  return out;
}

function stringifyCellStyle(styleMap) {
  return `${Array.from(styleMap.entries()).map(([key, value]) => `${key}=${value}`).join(";")};`;
}

export function updateDrawioDocXmlCellStyle(docXmlRaw, elementIdRaw, patchRaw = {}) {
  const docXml = toText(docXmlRaw);
  const elementId = toText(elementIdRaw);
  const patch = patchRaw && typeof patchRaw === "object" ? patchRaw : {};
  if (!docXml || !elementId || Object.keys(patch).length === 0) return docXml;
  const tagPattern = new RegExp(
    `<mxCell\\b([^>]*?)\\bid\\s*=\\s*["']${escapeRegExp(elementId)}["']([^>]*?)(\\/?)>`,
    "i",
  );
  const match = docXml.match(tagPattern);
  if (!match) return docXml;
  return docXml.replace(tagPattern, (fullMatch) => {
    const styleAttrMatch = fullMatch.match(/\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i);
    const currentStyle = styleAttrMatch ? String(styleAttrMatch[2] || styleAttrMatch[3] || "") : "";
    const styleMap = parseCellStyle(currentStyle);
    Object.entries(patch).forEach(([key, value]) => {
      const styleKey = toText(key);
      if (!styleKey) return;
      if (value == null || value === "") {
        styleMap.delete(styleKey);
        return;
      }
      styleMap.set(styleKey, String(value));
    });
    const nextStyle = stringifyCellStyle(styleMap);
    if (styleAttrMatch) {
      return fullMatch.replace(/\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i, `style="${escapeXml(nextStyle)}"`);
    }
    if (/\/>$/.test(fullMatch)) {
      return fullMatch.replace(/\/>$/, ` style="${escapeXml(nextStyle)}"/>`);
    }
    return fullMatch.replace(/>$/, ` style="${escapeXml(nextStyle)}">`);
  });
}

export function updateDrawioDocXmlCellGeometry(docXmlRaw, elementIdRaw, patchRaw = {}) {
  const docXml = toText(docXmlRaw);
  const elementId = toText(elementIdRaw);
  const patch = patchRaw && typeof patchRaw === "object" ? patchRaw : {};
  const geometryPatch = {};
  if (patch.x != null) geometryPatch.x = toNumber(patch.x, 0);
  if (patch.y != null) geometryPatch.y = toNumber(patch.y, 0);
  if (patch.width != null) geometryPatch.width = toNumber(patch.width, 0);
  if (patch.height != null) geometryPatch.height = toNumber(patch.height, 0);
  if (!docXml || !elementId || Object.keys(geometryPatch).length === 0) return docXml;
  const cellPattern = new RegExp(
    `(<mxCell\\b[^>]*\\bid\\s*=\\s*["']${escapeRegExp(elementId)}["'][^>]*>)([\\s\\S]*?)(<\\/mxCell>)`,
    "i",
  );
  const match = docXml.match(cellPattern);
  if (!match) return docXml;
  return docXml.replace(cellPattern, (_fullMatch, openTag, innerRaw, closeTag) => {
    const inner = String(innerRaw || "");
    if (!/<mxGeometry\b/i.test(inner)) return `${openTag}${inner}${closeTag}`;
    const nextInner = inner.replace(/<mxGeometry\b([^>]*?)\/>/i, (geometryTag, attrsRaw) => {
      let nextAttrs = String(attrsRaw || "");
      Object.entries(geometryPatch).forEach(([key, value]) => {
        nextAttrs = nextAttrs.replace(
          new RegExp(`\\s${escapeRegExp(key)}\\s*=\\s*(\"([^\"]*)\"|'([^']*)')`, "i"),
          "",
        );
        nextAttrs = `${nextAttrs} ${key}="${escapeXml(value)}"`;
      });
      return `<mxGeometry${nextAttrs} />`;
    });
    return `${openTag}${nextInner}${closeTag}`;
  });
}
