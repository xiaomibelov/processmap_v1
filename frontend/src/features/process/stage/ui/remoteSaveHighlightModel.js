function toText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readAttr(tag = "", attr = "") {
  const attrName = String(attr || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${attrName}\\s*=\\s*"([^"]*)"`, "i");
  const match = re.exec(String(tag || ""));
  return toText(match?.[1]);
}

function collectBpmnElementIds(xmlRaw = "") {
  const xml = String(xmlRaw || "");
  const ids = new Set();
  const re = /<bpmn:[A-Za-z0-9_:-]+\b[^>]*\bid\s*=\s*"([^"]+)"/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const id = toText(match[1]);
    if (!id) continue;
    ids.add(id);
  }
  return ids;
}

function collectDiagramGeometry(xmlRaw = "") {
  const xml = String(xmlRaw || "");
  const map = new Map();
  const shapeRe = /<bpmndi:BPMNShape\b([^>]*)>([\s\S]*?)<\/bpmndi:BPMNShape>/gi;
  let match;
  while ((match = shapeRe.exec(xml)) !== null) {
    const attrs = String(match[1] || "");
    const body = String(match[2] || "");
    const bpmnElementId = readAttr(attrs, "bpmnElement");
    if (!bpmnElementId) continue;
    const boundsMatch = /<dc:Bounds\b([^>]*)\/?>/i.exec(body);
    const boundsAttrs = String(boundsMatch?.[1] || "");
    const signature = [
      readAttr(boundsAttrs, "x"),
      readAttr(boundsAttrs, "y"),
      readAttr(boundsAttrs, "width"),
      readAttr(boundsAttrs, "height"),
    ].join(",");
    map.set(bpmnElementId, `shape:${signature}`);
  }
  const edgeRe = /<bpmndi:BPMNEdge\b([^>]*)>([\s\S]*?)<\/bpmndi:BPMNEdge>/gi;
  while ((match = edgeRe.exec(xml)) !== null) {
    const attrs = String(match[1] || "");
    const body = String(match[2] || "");
    const bpmnElementId = readAttr(attrs, "bpmnElement");
    if (!bpmnElementId) continue;
    const points = [];
    const wpRe = /<di:waypoint\b([^>]*)\/?>/gi;
    let wpMatch;
    while ((wpMatch = wpRe.exec(body)) !== null) {
      const wpAttrs = String(wpMatch[1] || "");
      points.push(`${readAttr(wpAttrs, "x")}:${readAttr(wpAttrs, "y")}`);
    }
    map.set(bpmnElementId, `edge:${points.join("|")}`);
  }
  return map;
}

function hasBpmnXmlChange(changedKeysRaw = []) {
  const keys = asArray(changedKeysRaw)
    .map((item) => toText(item).toLowerCase())
    .filter(Boolean);
  if (!keys.length) return true;
  return keys.some((key) => (
    key === "bpmn_xml"
    || key === "xml"
    || key.startsWith("bpmn_xml")
    || key.startsWith("xml_")
  ));
}

export function deriveRemoteChangedElementIds({
  previousXmlRaw = "",
  nextXmlRaw = "",
  changedKeysRaw = [],
  maxIds = 16,
} = {}) {
  if (!hasBpmnXmlChange(changedKeysRaw)) return [];
  const previousXml = String(previousXmlRaw || "");
  const nextXml = String(nextXmlRaw || "");
  if (!previousXml.trim() || !nextXml.trim()) return [];
  if (previousXml === nextXml) return [];
  const limit = Math.max(1, Number(maxIds || 16));
  const out = [];
  const seen = new Set();
  const add = (idRaw) => {
    const id = toText(idRaw);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };

  const prevSemanticIds = collectBpmnElementIds(previousXml);
  const nextSemanticIds = collectBpmnElementIds(nextXml);
  nextSemanticIds.forEach((id) => {
    if (!prevSemanticIds.has(id)) add(id);
  });
  prevSemanticIds.forEach((id) => {
    if (!nextSemanticIds.has(id)) add(id);
  });

  const prevGeometry = collectDiagramGeometry(previousXml);
  const nextGeometry = collectDiagramGeometry(nextXml);
  nextGeometry.forEach((signature, id) => {
    const prev = prevGeometry.get(id);
    if (!prev || prev !== signature) add(id);
  });
  prevGeometry.forEach((_, id) => {
    if (!nextGeometry.has(id)) add(id);
  });

  return out.slice(0, limit);
}

export function buildRemoteSaveHighlightView({
  actorLabelRaw = "",
  changedElementIdsRaw = [],
  changedKeysRaw = [],
  atRaw = 0,
} = {}) {
  const changedElementIds = asArray(changedElementIdsRaw)
    .map((item) => toText(item))
    .filter(Boolean);
  const actorLabel = toText(actorLabelRaw) || "Другой пользователь";
  const at = Number(atRaw);
  let label = "";
  if (changedElementIds.length > 0) {
    const count = changedElementIds.length;
    const noun = count === 1 ? "элемент" : (count <= 4 ? "элемента" : "элементов");
    label = `Сессию обновил ${actorLabel}: ${count} ${noun}`;
  } else if (hasBpmnXmlChange(changedKeysRaw)) {
    label = `Сессию обновил ${actorLabel}`;
  } else {
    label = `Сессию обновил ${actorLabel}: изменены данные`;
  }
  let title = label;
  if (changedElementIds.length > 0) {
    title = `${label}. Изменены: ${changedElementIds.join(", ")}`;
  }
  if (Number.isFinite(at) && at > 0) {
    try {
      title = `${title}. ${new Date(at * 1000).toLocaleString("ru-RU")}`;
    } catch {
      // no-op
    }
  }
  return {
    visible: true,
    label,
    title,
    actorLabel,
    changedElementIds,
    changedKeys: asArray(changedKeysRaw).map((item) => toText(item)).filter(Boolean),
    at: Number.isFinite(at) && at > 0 ? Math.round(at) : 0,
    refreshLabel: "Обновить сессию",
    refreshHint: "Загрузить актуальное состояние после изменений другого участника.",
  };
}
