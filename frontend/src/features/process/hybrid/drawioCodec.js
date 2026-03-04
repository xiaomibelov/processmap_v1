import {
  createEmptyHybridV2Doc,
  exportHybridV2ToDrawioXml as exportHybridV2ToDrawioXmlRaw,
  importHybridV2FromDrawioXml as importHybridV2FromDrawioXmlRaw,
  normalizeHybridV2Doc,
} from "./hybridLayerV2.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value || "").trim();
}

function looksLikeMxGraphModel(textRaw) {
  return /^\s*<mxGraphModel[\s>]/i.test(String(textRaw || ""));
}

function unwrapCdata(textRaw) {
  const text = String(textRaw || "").trim();
  const cdataMatch = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return cdataMatch ? String(cdataMatch[1] || "") : text;
}

function extractFirstDiagramPayload(xmlTextRaw) {
  const xmlText = String(xmlTextRaw || "");
  const match = xmlText.match(/<diagram\b[^>]*>([\s\S]*?)<\/diagram>/i);
  if (!match) return "";
  return unwrapCdata(match[1] || "");
}

function base64ToBytes(base64Raw) {
  const base64 = String(base64Raw || "").replace(/\s+/g, "");
  if (!base64) return new Uint8Array();
  if (typeof atob === "function") {
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(base64, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  throw new Error("base64_decoder_unavailable");
}

async function inflateRawBytes(bytesRaw) {
  const bytes = bytesRaw instanceof Uint8Array ? bytesRaw : new Uint8Array();
  if (typeof DecompressionStream !== "function") {
    throw new Error("decompression_stream_unavailable");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function tryDecodeUriComponent(textRaw) {
  const text = String(textRaw || "");
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

async function decodeEncodedDiagramPayload(payloadRaw) {
  const payload = String(payloadRaw || "").replace(/\s+/g, "");
  if (!payload) return { xml: "", warnings: ["drawio_payload_empty"] };
  const warnings = [];
  try {
    const encodedBytes = base64ToBytes(payload);
    let inflatedText = "";
    try {
      const inflatedBytes = await inflateRawBytes(encodedBytes);
      inflatedText = new TextDecoder().decode(inflatedBytes);
      const uriDecoded = tryDecodeUriComponent(inflatedText);
      if (looksLikeMxGraphModel(uriDecoded)) return { xml: uriDecoded, warnings };
      if (looksLikeMxGraphModel(inflatedText)) return { xml: inflatedText, warnings };
      warnings.push("drawio_payload_inflate_non_mxgraphmodel");
    } catch {
      warnings.push("drawio_payload_inflate_failed");
    }
    const directDecoded = new TextDecoder().decode(encodedBytes);
    if (looksLikeMxGraphModel(directDecoded)) {
      warnings.push("drawio_payload_plain_base64_detected");
      return { xml: directDecoded, warnings };
    }
    return { xml: "", warnings: [...warnings, "drawio_payload_decode_failed"] };
  } catch {
    return { xml: "", warnings: ["drawio_payload_base64_invalid"] };
  }
}

export function detectDrawioFormat(xmlOrFileTextRaw) {
  const text = String(xmlOrFileTextRaw || "").trim();
  if (!text) return { format: "empty", diagramPayload: "" };
  const diagramPayload = extractFirstDiagramPayload(text);
  if (diagramPayload) {
    if (looksLikeMxGraphModel(diagramPayload)) {
      return { format: "raw_diagram_xml", diagramPayload };
    }
    return { format: "encoded_diagram_payload", diagramPayload };
  }
  if (looksLikeMxGraphModel(text)) {
    return { format: "mxgraphmodel_root", diagramPayload: text };
  }
  return { format: "unknown", diagramPayload: "" };
}

function mergeBindingsFromBaseDoc(importedDocRaw, baseDocRaw) {
  const importedDoc = normalizeHybridV2Doc(importedDocRaw);
  const baseDoc = normalizeHybridV2Doc(baseDocRaw);
  const validHybridIds = new Set([
    ...importedDoc.elements.map((row) => asText(row.id)).filter(Boolean),
    ...importedDoc.edges.map((row) => asText(row.id)).filter(Boolean),
  ]);
  const keptBindings = baseDoc.bindings.filter((row) => validHybridIds.has(asText(row.hybrid_id)));
  if (!keptBindings.length) return importedDoc;
  const existing = new Set(importedDoc.bindings.map((row) => `${row.hybrid_id}:${row.bpmn_id}:${row.kind}`));
  const mergedBindings = [
    ...importedDoc.bindings,
    ...keptBindings.filter((row) => !existing.has(`${row.hybrid_id}:${row.bpmn_id}:${row.kind}`)),
  ];
  return normalizeHybridV2Doc({
    ...importedDoc,
    bindings: mergedBindings,
  });
}

export function exportHybridToDrawio(hybridV2Raw) {
  return exportHybridV2ToDrawioXmlRaw(normalizeHybridV2Doc(hybridV2Raw));
}

export function exportHybridV2ToDrawioXml(hybridV2Raw) {
  return exportHybridToDrawio(hybridV2Raw);
}

export async function importDrawioToHybrid(xmlOrFileTextRaw, optionsRaw = {}) {
  const options = asObject(optionsRaw);
  const formatInfo = detectDrawioFormat(xmlOrFileTextRaw);
  const warnings = [];
  let parseInput = String(xmlOrFileTextRaw || "");
  if (formatInfo.format === "raw_diagram_xml" || formatInfo.format === "mxgraphmodel_root") {
    parseInput = formatInfo.diagramPayload || parseInput;
  } else if (formatInfo.format === "encoded_diagram_payload") {
    const decoded = await decodeEncodedDiagramPayload(formatInfo.diagramPayload);
    warnings.push(...asArray(decoded.warnings));
    parseInput = decoded.xml || "";
  } else if (formatInfo.format === "unknown") {
    warnings.push("drawio_format_unknown");
  }

  const imported = importHybridV2FromDrawioXmlRaw(parseInput);
  const skipped = [...asArray(imported.skipped), ...asArray(parseInput ? [] : ["drawio_import_empty_after_decode"])];
  let hybridV2 = normalizeHybridV2Doc(imported.doc);
  if (options.preserveBindings !== false) {
    hybridV2 = mergeBindingsFromBaseDoc(hybridV2, options.baseDoc);
  }
  if (hybridV2.elements.length === 0 && hybridV2.edges.length === 0 && formatInfo.format !== "empty") {
    warnings.push("drawio_import_no_supported_cells");
  }
  return {
    hybridV2,
    skipped,
    warnings,
    format: formatInfo.format,
  };
}

export function importDrawioToHybridSync(xmlOrFileTextRaw, optionsRaw = {}) {
  const options = asObject(optionsRaw);
  const formatInfo = detectDrawioFormat(xmlOrFileTextRaw);
  if (formatInfo.format === "encoded_diagram_payload") {
    return {
      hybridV2: options.preserveBindings === false ? createEmptyHybridV2Doc() : mergeBindingsFromBaseDoc(createEmptyHybridV2Doc(), options.baseDoc),
      skipped: ["encoded_payload_requires_async_import"],
      warnings: ["drawio_payload_async_required"],
      format: formatInfo.format,
    };
  }
  const imported = importHybridV2FromDrawioXmlRaw(
    formatInfo.format === "raw_diagram_xml" || formatInfo.format === "mxgraphmodel_root"
      ? formatInfo.diagramPayload
      : String(xmlOrFileTextRaw || ""),
  );
  let hybridV2 = normalizeHybridV2Doc(imported.doc);
  if (options.preserveBindings !== false) {
    hybridV2 = mergeBindingsFromBaseDoc(hybridV2, options.baseDoc);
  }
  return {
    hybridV2,
    skipped: asArray(imported.skipped),
    warnings: formatInfo.format === "unknown" ? ["drawio_format_unknown"] : [],
    format: formatInfo.format,
  };
}

export async function importDrawioXmlToHybridV2(xmlOrFileTextRaw, optionsRaw = {}) {
  return importDrawioToHybrid(xmlOrFileTextRaw, optionsRaw);
}
