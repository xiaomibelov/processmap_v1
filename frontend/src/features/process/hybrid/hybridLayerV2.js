function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value || "").trim();
}

function asNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

export const HYBRID_V2_SCHEMA_VERSION = 2;
export const HYBRID_V2_DEFAULT_LAYER_ID = "L1";
export const HYBRID_V2_DEFAULT_LAYER_NAME = "Hybrid";

function normalizeLayer(raw, idx) {
  const layer = asObject(raw);
  const id = asText(layer.id) || `L${idx + 1}`;
  const opacityRaw = asNum(layer.opacity, 1);
  return {
    id,
    name: asText(layer.name) || (id === HYBRID_V2_DEFAULT_LAYER_ID ? HYBRID_V2_DEFAULT_LAYER_NAME : `Layer ${idx + 1}`),
    visible: layer.visible !== false,
    locked: !!layer.locked,
    opacity: clamp(opacityRaw, 0.1, 1),
  };
}

function normalizeStyle(raw, kind = "element") {
  const style = asObject(raw);
  const out = {};
  if (kind === "edge") {
    out.stroke = asText(style.stroke) || "#2563eb";
    out.width = clamp(Math.round(asNum(style.width, 2) * 10) / 10, 1, 8);
    return out;
  }
  out.stroke = asText(style.stroke) || "#334155";
  out.fill = asText(style.fill) || "#f8fafc";
  out.radius = clamp(Math.round(asNum(style.radius, 8) * 10) / 10, 0, 24);
  out.fontSize = clamp(Math.round(asNum(style.fontSize, 12)), 10, 24);
  return out;
}

function normalizeElement(raw, idx, knownLayers) {
  const el = asObject(raw);
  const id = asText(el.id) || `E${idx + 1}`;
  const typeRaw = asText(el.type).toLowerCase();
  const type = typeRaw === "rect" || typeRaw === "text" || typeRaw === "note" ? typeRaw : "note";
  const layerId = asText(el.layer_id || el.layerId) || HYBRID_V2_DEFAULT_LAYER_ID;
  const safeLayerId = knownLayers.has(layerId) ? layerId : HYBRID_V2_DEFAULT_LAYER_ID;
  const wDefault = type === "text" ? 180 : 200;
  const hDefault = type === "text" ? 34 : 70;
  return {
    id,
    layer_id: safeLayerId,
    type,
    x: Math.round(asNum(el.x, 120) * 10) / 10,
    y: Math.round(asNum(el.y, 120) * 10) / 10,
    w: clamp(Math.round(asNum(el.w, wDefault) * 10) / 10, 36, 2200),
    h: clamp(Math.round(asNum(el.h, hDefault) * 10) / 10, 20, 1200),
    text: asText(el.text),
    style: normalizeStyle(el.style, "element"),
  };
}

function normalizeEdgeEnd(raw) {
  const end = asObject(raw);
  return {
    element_id: asText(end.element_id || end.elementId),
    anchor: asText(end.anchor || "auto") || "auto",
  };
}

function normalizeWaypoints(raw) {
  return asArray(raw)
    .map((row) => {
      const item = asObject(row);
      const x = asNum(item.x, Number.NaN);
      const y = asNum(item.y, Number.NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
      };
    })
    .filter(Boolean);
}

function normalizeEdge(raw, idx, knownLayers, knownElements) {
  const edge = asObject(raw);
  const id = asText(edge.id) || `A${idx + 1}`;
  const type = asText(edge.type).toLowerCase() === "arrow" ? "arrow" : "arrow";
  const layerId = asText(edge.layer_id || edge.layerId) || HYBRID_V2_DEFAULT_LAYER_ID;
  const safeLayerId = knownLayers.has(layerId) ? layerId : HYBRID_V2_DEFAULT_LAYER_ID;
  const from = normalizeEdgeEnd(edge.from);
  const to = normalizeEdgeEnd(edge.to);
  if (!knownElements.has(from.element_id) || !knownElements.has(to.element_id)) return null;
  return {
    id,
    layer_id: safeLayerId,
    type,
    from,
    to,
    waypoints: normalizeWaypoints(edge.waypoints),
    style: normalizeStyle(edge.style, "edge"),
  };
}

function normalizeBinding(raw, knownHybridIds) {
  const binding = asObject(raw);
  const hybridId = asText(binding.hybrid_id || binding.hybridId);
  const bpmnId = asText(binding.bpmn_id || binding.bpmnId);
  const kindRaw = asText(binding.kind).toLowerCase();
  const kind = kindRaw === "edge" ? "edge" : "node";
  if (!hybridId || !bpmnId || !knownHybridIds.has(hybridId)) return null;
  return {
    hybrid_id: hybridId,
    bpmn_id: bpmnId,
    kind,
  };
}

function normalizeView(raw, layers) {
  const view = asObject(raw);
  const mode = asText(view.mode).toLowerCase() === "edit" ? "edit" : "view";
  const toolRaw = asText(view.tool).toLowerCase();
  const tool = ["select", "rect", "text", "arrow", "note"].includes(toolRaw) ? toolRaw : "select";
  const activeLayerIdRaw = asText(view.active_layer_id || view.activeLayerId) || HYBRID_V2_DEFAULT_LAYER_ID;
  const layerIds = new Set(layers.map((layer) => asText(layer.id)).filter(Boolean));
  const activeLayerId = layerIds.has(activeLayerIdRaw) ? activeLayerIdRaw : layers[0]?.id || HYBRID_V2_DEFAULT_LAYER_ID;
  return {
    mode,
    active_layer_id: activeLayerId,
    tool,
    peek: !!view.peek,
  };
}

export function normalizeHybridV2Doc(raw) {
  const source = asObject(raw);
  const layersRaw = asArray(source.layers);
  const layers = (layersRaw.length ? layersRaw : [{}]).map((row, idx) => normalizeLayer(row, idx));
  const layersById = new Set(layers.map((layer) => layer.id));

  const elements = asArray(source.elements)
    .map((row, idx) => normalizeElement(row, idx, layersById))
    .filter((row, idx, arr) => arr.findIndex((x) => x.id === row.id) === idx);
  const elementIds = new Set(elements.map((row) => row.id));

  const edges = asArray(source.edges)
    .map((row, idx) => normalizeEdge(row, idx, layersById, elementIds))
    .filter(Boolean)
    .filter((row, idx, arr) => arr.findIndex((x) => x.id === row.id) === idx);

  const hybridIds = new Set([...elements.map((row) => row.id), ...edges.map((row) => row.id)]);
  const bindings = asArray(source.bindings)
    .map((row) => normalizeBinding(row, hybridIds))
    .filter(Boolean)
    .filter((row, idx, arr) => arr.findIndex((x) => `${x.hybrid_id}:${x.bpmn_id}:${x.kind}` === `${row.hybrid_id}:${row.bpmn_id}:${row.kind}`) === idx);

  return {
    schema_version: HYBRID_V2_SCHEMA_VERSION,
    layers,
    elements,
    edges,
    bindings,
    view: normalizeView(source.view, layers),
  };
}

export function createEmptyHybridV2Doc() {
  return normalizeHybridV2Doc({});
}

export function makeHybridV2Id(prefix, sourceDocRaw) {
  const sourceDoc = normalizeHybridV2Doc(sourceDocRaw);
  const p = asText(prefix).toUpperCase() || "E";
  const used = new Set();
  sourceDoc.elements.forEach((row) => used.add(asText(row.id)));
  sourceDoc.edges.forEach((row) => used.add(asText(row.id)));
  let i = 1;
  while (used.has(`${p}${i}`)) i += 1;
  return `${p}${i}`;
}

export function migrateHybridV1ToV2(hybridLayerByElementIdRaw, resolveNodeCenterById) {
  const map = asObject(hybridLayerByElementIdRaw);
  const elements = [];
  const bindings = [];
  Object.keys(map).forEach((elementIdRaw, idx) => {
    const bpmnId = asText(elementIdRaw);
    if (!bpmnId) return;
    const row = asObject(map[elementIdRaw]);
    const dx = asNum(row.dx ?? row.x, 0);
    const dy = asNum(row.dy ?? row.y, 0);
    const center = typeof resolveNodeCenterById === "function" ? asObject(resolveNodeCenterById(bpmnId)) : {};
    const cx = asNum(center.x, 220 + (idx * 28));
    const cy = asNum(center.y, 160 + (idx * 28));
    const id = `E${idx + 1}`;
    elements.push({
      id,
      layer_id: HYBRID_V2_DEFAULT_LAYER_ID,
      type: "note",
      x: Math.round((cx + dx) * 10) / 10,
      y: Math.round((cy + dy) * 10) / 10,
      w: 180,
      h: 56,
      text: bpmnId,
      style: normalizeStyle({}, "element"),
    });
    bindings.push({
      hybrid_id: id,
      bpmn_id: bpmnId,
      kind: "node",
    });
  });
  return normalizeHybridV2Doc({
    schema_version: HYBRID_V2_SCHEMA_VERSION,
    layers: [
      {
        id: HYBRID_V2_DEFAULT_LAYER_ID,
        name: HYBRID_V2_DEFAULT_LAYER_NAME,
        visible: true,
        locked: false,
        opacity: 1,
      },
    ],
    elements,
    edges: [],
    bindings,
    view: {
      mode: "view",
      active_layer_id: HYBRID_V2_DEFAULT_LAYER_ID,
      tool: "select",
      peek: false,
    },
  });
}

export function getHybridBindingsByBpmnId(docRaw) {
  const doc = normalizeHybridV2Doc(docRaw);
  const out = {};
  doc.bindings.forEach((row) => {
    const bpmnId = asText(row.bpmn_id);
    if (!bpmnId) return;
    const prev = asArray(out[bpmnId]);
    out[bpmnId] = [...prev, row];
  });
  return out;
}

function xmlEscape(textRaw) {
  return String(textRaw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function styleToMxStyle(element) {
  const row = asObject(element);
  const style = asObject(row.style);
  if (row.type === "text") {
    return `text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=${Math.round(asNum(style.fontSize, 12))};`;
  }
  if (row.type === "note") {
    return `shape=note;whiteSpace=wrap;html=1;rounded=1;arcSize=${Math.round(asNum(style.radius, 8) * 5)};strokeColor=${xmlEscape(asText(style.stroke) || "#334155")};fillColor=${xmlEscape(asText(style.fill) || "#fff7d6")};fontSize=${Math.round(asNum(style.fontSize, 12))};`;
  }
  return `rounded=1;whiteSpace=wrap;html=1;arcSize=${Math.round(asNum(style.radius, 8) * 5)};strokeColor=${xmlEscape(asText(style.stroke) || "#334155")};fillColor=${xmlEscape(asText(style.fill) || "#f8fafc")};fontSize=${Math.round(asNum(style.fontSize, 12))};`;
}

export function exportHybridV2ToDrawioXml(docRaw) {
  const doc = normalizeHybridV2Doc(docRaw);
  const lines = [];
  lines.push("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
  lines.push("<mxfile host=\"ProcessMap\" version=\"v2\">");
  lines.push("  <diagram name=\"Hybrid\">");
  lines.push("    <mxGraphModel dx=\"1200\" dy=\"800\" grid=\"1\" gridSize=\"10\" guides=\"1\" tooltips=\"1\" connect=\"1\" arrows=\"1\" fold=\"1\" page=\"1\" pageScale=\"1\" pageWidth=\"1600\" pageHeight=\"1200\">");
  lines.push("      <root>");
  lines.push("        <mxCell id=\"0\"/>");
  lines.push("        <mxCell id=\"1\" parent=\"0\"/>");
  doc.layers.forEach((layer) => {
    lines.push(`        <mxCell id=\"${xmlEscape(layer.id)}\" value=\"${xmlEscape(layer.name)}\" parent=\"1\" vertex=\"1\" visible=\"${layer.visible ? "1" : "0"}\">`);
    lines.push("          <mxGeometry x=\"0\" y=\"0\" width=\"0\" height=\"0\" as=\"geometry\"/>");
    lines.push("        </mxCell>");
  });
  doc.elements.forEach((element) => {
    const layerId = asText(element.layer_id) || HYBRID_V2_DEFAULT_LAYER_ID;
    const value = xmlEscape(element.type === "text" ? (asText(element.text) || "Text") : (asText(element.text) || ""));
    lines.push(
      `        <mxCell id=\"${xmlEscape(element.id)}\" value=\"${value}\" style=\"${styleToMxStyle(element)}\" parent=\"${xmlEscape(layerId)}\" vertex=\"1\">`,
    );
    lines.push(
      `          <mxGeometry x=\"${Number(element.x)}\" y=\"${Number(element.y)}\" width=\"${Number(element.w)}\" height=\"${Number(element.h)}\" as=\"geometry\"/>`,
    );
    lines.push("        </mxCell>");
  });
  doc.edges.forEach((edge) => {
    const layerId = asText(edge.layer_id) || HYBRID_V2_DEFAULT_LAYER_ID;
    const style = asObject(edge.style);
    const edgeStyle = `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${xmlEscape(asText(style.stroke) || "#2563eb")};strokeWidth=${Number(asNum(style.width, 2))};endArrow=block;`;
    lines.push(
      `        <mxCell id=\"${xmlEscape(edge.id)}\" style=\"${edgeStyle}\" parent=\"${xmlEscape(layerId)}\" source=\"${xmlEscape(asText(edge.from?.element_id))}\" target=\"${xmlEscape(asText(edge.to?.element_id))}\" edge=\"1\">`,
    );
    lines.push("          <mxGeometry relative=\"1\" as=\"geometry\">");
    const waypoints = asArray(edge.waypoints);
    if (waypoints.length) {
      lines.push("            <Array as=\"points\">");
      waypoints.forEach((point) => {
        lines.push(`              <mxPoint x=\"${Number(asNum(point.x, 0))}\" y=\"${Number(asNum(point.y, 0))}\"/>`);
      });
      lines.push("            </Array>");
    }
    lines.push("          </mxGeometry>");
    lines.push("        </mxCell>");
  });
  lines.push("      </root>");
  lines.push("    </mxGraphModel>");
  lines.push("  </diagram>");
  lines.push("</mxfile>");
  return lines.join("\n");
}

function parseMxStyle(styleRaw) {
  const style = {};
  String(styleRaw || "").split(";").forEach((entryRaw) => {
    const entry = String(entryRaw || "").trim();
    if (!entry) return;
    const [k, v] = entry.split("=");
    if (!k) return;
    style[String(k).trim()] = String(v ?? "").trim();
  });
  return style;
}

function decodeXmlEntities(textRaw) {
  return String(textRaw || "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseXmlAttrs(fragmentRaw) {
  const attrs = {};
  String(fragmentRaw || "").replace(/([a-zA-Z0-9_:-]+)\s*=\s*"([^"]*)"/g, (_, keyRaw, valueRaw) => {
    attrs[String(keyRaw || "")] = decodeXmlEntities(valueRaw);
    return "";
  });
  return attrs;
}

function parseDrawioSubsetWithoutDomParser(xmlTextRaw) {
  const xmlText = String(xmlTextRaw || "");
  const layers = [];
  const elements = [];
  const edges = [];
  const skipped = [];
  const layerIds = new Set();

  const cellRegex = /<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
  let match = cellRegex.exec(xmlText);
  while (match) {
    const attrs = parseXmlAttrs(match[1] || "");
    const inner = String(match[2] || "");
    const id = asText(attrs.id);
    const parent = asText(attrs.parent);
    const isVertex = attrs.vertex === "1";
    const isEdge = attrs.edge === "1";
    if (!id || id === "0" || id === "1") {
      match = cellRegex.exec(xmlText);
      continue;
    }

    if (isVertex && parent === "1") {
      if (!layerIds.has(id)) {
        layerIds.add(id);
        layers.push({
          id,
          name: asText(attrs.value) || id,
          visible: attrs.visible !== "0",
          locked: false,
          opacity: 1,
        });
      }
      match = cellRegex.exec(xmlText);
      continue;
    }

    if (isVertex) {
      const geomMatch = inner.match(/<mxGeometry\b([^>]*?)\/>/);
      const geomAttrs = parseXmlAttrs(geomMatch?.[1] || "");
      const styleMap = parseMxStyle(attrs.style);
      const type = resolveElementTypeFromMxCell(
        { getAttribute: (k) => (k === "vertex" ? attrs.vertex : "") },
        styleMap,
      );
      if (!type) {
        skipped.push(`vertex_unsupported:${id}`);
        match = cellRegex.exec(xmlText);
        continue;
      }
      elements.push({
        id,
        layer_id: parent || HYBRID_V2_DEFAULT_LAYER_ID,
        type,
        x: asNum(geomAttrs.x, 0),
        y: asNum(geomAttrs.y, 0),
        w: asNum(geomAttrs.width, 160),
        h: asNum(geomAttrs.height, 60),
        text: asText(attrs.value),
        style: {
          stroke: asText(styleMap.strokeColor) || "#334155",
          fill: asText(styleMap.fillColor) || (type === "note" ? "#fff7d6" : "#f8fafc"),
          radius: 8,
          fontSize: asNum(styleMap.fontSize, 12),
        },
      });
      match = cellRegex.exec(xmlText);
      continue;
    }

    if (isEdge) {
      const source = asText(attrs.source);
      const target = asText(attrs.target);
      if (!source || !target) {
        skipped.push(`edge_missing_endpoints:${id}`);
        match = cellRegex.exec(xmlText);
        continue;
      }
      const styleMap = parseMxStyle(attrs.style);
      const points = [];
      const pointRegex = /<mxPoint\b([^>]*?)\/>/g;
      let pm = pointRegex.exec(inner);
      while (pm) {
        const pAttrs = parseXmlAttrs(pm[1] || "");
        const x = asNum(pAttrs.x, Number.NaN);
        const y = asNum(pAttrs.y, Number.NaN);
        if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
        pm = pointRegex.exec(inner);
      }
      edges.push({
        id,
        layer_id: parent || HYBRID_V2_DEFAULT_LAYER_ID,
        type: "arrow",
        from: { element_id: source, anchor: "auto" },
        to: { element_id: target, anchor: "auto" },
        waypoints: points,
        style: {
          stroke: asText(styleMap.strokeColor) || "#2563eb",
          width: asNum(styleMap.strokeWidth, 2),
        },
      });
      match = cellRegex.exec(xmlText);
      continue;
    }

    skipped.push(`unsupported_cell:${id}`);
    match = cellRegex.exec(xmlText);
  }

  const normalized = normalizeHybridV2Doc({
    schema_version: HYBRID_V2_SCHEMA_VERSION,
    layers: layers.length ? layers : [{ id: HYBRID_V2_DEFAULT_LAYER_ID, name: HYBRID_V2_DEFAULT_LAYER_NAME }],
    elements,
    edges,
    bindings: [],
    view: {
      mode: "view",
      active_layer_id: layers[0]?.id || HYBRID_V2_DEFAULT_LAYER_ID,
      tool: "select",
      peek: false,
    },
  });
  return {
    doc: normalized,
    skipped,
  };
}

function parseCellGeometry(geomEl) {
  const el = geomEl && geomEl.getAttribute ? geomEl : null;
  if (!el) return null;
  return {
    x: asNum(el.getAttribute("x"), 0),
    y: asNum(el.getAttribute("y"), 0),
    w: asNum(el.getAttribute("width"), 160),
    h: asNum(el.getAttribute("height"), 60),
  };
}

function resolveElementTypeFromMxCell(cellEl, styleMap) {
  const style = asObject(styleMap);
  if (style.text === "1" || style.shape === "text") return "text";
  if (style.shape === "note") return "note";
  if ((cellEl?.getAttribute?.("vertex") || "") === "1") return "rect";
  return "";
}

export function importHybridV2FromDrawioXml(xmlTextRaw) {
  const xmlText = String(xmlTextRaw || "").trim();
  if (!xmlText) {
    return {
      doc: createEmptyHybridV2Doc(),
      skipped: ["empty_xml"],
    };
  }
  if (typeof DOMParser === "undefined") return parseDrawioSubsetWithoutDomParser(xmlText);
  const parser = new DOMParser();
  const docXml = parser.parseFromString(xmlText, "text/xml");
  const parseErr = docXml.getElementsByTagName("parsererror");
  if (parseErr.length) {
    return {
      doc: createEmptyHybridV2Doc(),
      skipped: ["parser_error"],
    };
  }

  const cells = Array.from(docXml.getElementsByTagName("mxCell"));
  const layers = [];
  const elements = [];
  const edges = [];
  const skipped = [];
  const layerIds = new Set();
  const elementIds = new Set();

  cells.forEach((cell) => {
    const id = asText(cell.getAttribute("id"));
    if (!id || id === "0" || id === "1") return;
    const parent = asText(cell.getAttribute("parent"));
    const isVertex = cell.getAttribute("vertex") === "1";
    const isEdge = cell.getAttribute("edge") === "1";
    const styleMap = parseMxStyle(cell.getAttribute("style"));

    if (isVertex && parent === "1") {
      if (layerIds.has(id)) return;
      layerIds.add(id);
      layers.push({
        id,
        name: asText(cell.getAttribute("value")) || id,
        visible: cell.getAttribute("visible") !== "0",
        locked: false,
        opacity: 1,
      });
      return;
    }

    if (isVertex) {
      const geom = parseCellGeometry(cell.querySelector("mxGeometry"));
      if (!geom) {
        skipped.push(`vertex_no_geometry:${id}`);
        return;
      }
      const type = resolveElementTypeFromMxCell(cell, styleMap);
      if (!type) {
        skipped.push(`vertex_unsupported:${id}`);
        return;
      }
      const layerId = parent || HYBRID_V2_DEFAULT_LAYER_ID;
      elements.push({
        id,
        layer_id: layerId,
        type,
        x: geom.x,
        y: geom.y,
        w: geom.w,
        h: geom.h,
        text: asText(cell.getAttribute("value")),
        style: {
          stroke: asText(styleMap.strokeColor) || "#334155",
          fill: asText(styleMap.fillColor) || (type === "note" ? "#fff7d6" : "#f8fafc"),
          radius: 8,
          fontSize: asNum(styleMap.fontSize, 12),
        },
      });
      elementIds.add(id);
      return;
    }

    if (isEdge) {
      const source = asText(cell.getAttribute("source"));
      const target = asText(cell.getAttribute("target"));
      if (!source || !target) {
        skipped.push(`edge_missing_endpoints:${id}`);
        return;
      }
      const geom = cell.querySelector("mxGeometry");
      const waypoints = geom
        ? Array.from(geom.querySelectorAll("Array[as='points'] > mxPoint"))
          .map((pointEl) => ({
            x: asNum(pointEl.getAttribute("x"), Number.NaN),
            y: asNum(pointEl.getAttribute("y"), Number.NaN),
          }))
          .filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y))
        : [];
      edges.push({
        id,
        layer_id: parent || HYBRID_V2_DEFAULT_LAYER_ID,
        type: "arrow",
        from: { element_id: source, anchor: "auto" },
        to: { element_id: target, anchor: "auto" },
        waypoints,
        style: {
          stroke: asText(styleMap.strokeColor) || "#2563eb",
          width: asNum(styleMap.strokeWidth, 2),
        },
      });
      return;
    }

    skipped.push(`unsupported_cell:${id}`);
  });

  const normalized = normalizeHybridV2Doc({
    schema_version: HYBRID_V2_SCHEMA_VERSION,
    layers: layers.length ? layers : [{ id: HYBRID_V2_DEFAULT_LAYER_ID, name: HYBRID_V2_DEFAULT_LAYER_NAME }],
    elements,
    edges,
    bindings: [],
    view: {
      mode: "view",
      active_layer_id: layers[0]?.id || HYBRID_V2_DEFAULT_LAYER_ID,
      tool: "select",
      peek: false,
    },
  });

  return {
    doc: normalized,
    skipped,
  };
}

export function docToComparableJson(docRaw) {
  const doc = normalizeHybridV2Doc(docRaw);
  const sorted = {
    schema_version: doc.schema_version,
    layers: [...doc.layers].sort((a, b) => String(a.id).localeCompare(String(b.id), "ru")),
    elements: [...doc.elements].sort((a, b) => String(a.id).localeCompare(String(b.id), "ru")),
    edges: [...doc.edges].sort((a, b) => String(a.id).localeCompare(String(b.id), "ru")),
    bindings: [...doc.bindings].sort((a, b) => {
      const ak = `${a.hybrid_id}:${a.bpmn_id}:${a.kind}`;
      const bk = `${b.hybrid_id}:${b.bpmn_id}:${b.kind}`;
      return ak.localeCompare(bk, "ru");
    }),
    view: doc.view,
  };
  return JSON.stringify(cloneJson(sorted));
}
