const BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI";

export async function buildTemplateBpmnTransfer({ modeler, elements } = {}) {
  const copyPaste = modeler?.get?.("copyPaste");
  const selection = Array.isArray(elements) ? elements.filter(Boolean) : [];
  if (!selection.length) {
    return { ok: false, error: "empty_selection" };
  }
  if (!copyPaste || typeof copyPaste.createTree !== "function") {
    return { ok: false, error: "copy_paste_unavailable" };
  }
  try {
    const nativeTree = copyPaste.createTree(selection);
    const sourceDescriptorIds = collectDescriptorIds(nativeTree);
    const saved = await modeler.saveXML({ format: true });
    const bpmnXml = await buildFragmentXmlFromFullXml(saved?.xml || "", sourceDescriptorIds);
    return {
      ok: true,
      transfer: {
        schema: "fpc.bpmn.template.xml.v1",
        captureMode: "bpmn_xml_native_tree",
        nativeTree,
        sourceDescriptorIds,
        bpmnXml,
        warnings: [],
      },
    };
  } catch {
    return { ok: false, error: "template_transfer_capture_failed" };
  }
}

export function collectDescriptorIds(nativeTree) {
  const ids = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.id) ids.push(String(node.id));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(nativeTree);
  return Array.from(new Set(ids));
}

export async function buildFragmentXmlFromFullXml(fullXml, selectedIds) {
  const parser = new DOMParser();
  const sourceDoc = parser.parseFromString(fullXml, "application/xml");
  if (
    !sourceDoc.documentElement
    || sourceDoc.documentElement.localName === "parsererror"
    || sourceDoc.getElementsByTagName("parsererror").length > 0
  ) {
    throw new Error("source_xml_parse_failed");
  }
  // Carry over all xmlns:* declarations from the source root so imported
  // semantic elements keep their prefixes bound (zeebe/camunda/pm/xsi/...).
  const extraNs = Array.from(sourceDoc.documentElement.attributes)
    .filter((attr) => (attr.name === "xmlns" || attr.name.startsWith("xmlns:"))
      && attr.name !== "xmlns:bpmn" && attr.name !== "xmlns:bpmndi")
    .map((attr) => `${attr.name}="${attr.value}"`)
    .join(" ");
  const fragmentDoc = parser.parseFromString(
    `<bpmn:definitions xmlns:bpmn="${BPMN_NS}" xmlns:bpmndi="${BPMNDI_NS}" ${extraNs} id="TemplateFragment" targetNamespace="http://processmap.ai/template"/>`,
    "application/xml",
  );
  const fragmentRoot = fragmentDoc.documentElement;
  const idSet = new Set((selectedIds || []).map(String));
  const includedIds = new Set();
  const semanticSelector = Array.from(sourceDoc.documentElement.getElementsByTagNameNS(BPMN_NS, "*"))
    .filter((el) => idSet.has(el.getAttribute("id")));
  if (!semanticSelector.length) {
    throw new Error("no_selected_semantics");
  }
  for (const el of semanticSelector) {
    const clone = fragmentDoc.importNode(el, true);
    includedIds.add(el.getAttribute("id"));
    const parentLocal = el.parentElement?.localName;
    if (parentLocal === "definitions") {
      fragmentRoot.appendChild(clone);
      continue;
    }
    let container = Array.from(fragmentRoot.children).find((child) => child.localName === parentLocal);
    if (!container) {
      container = fragmentDoc.createElementNS(BPMN_NS, `bpmn:${parentLocal || "process"}`);
      fragmentRoot.appendChild(container);
    }
    container.appendChild(clone);
  }
  // Non-graphical data associations attached to selected semantic elements.
  const dataAssociations = Array.from(sourceDoc.documentElement.getElementsByTagNameNS(BPMN_NS, "*"))
    .filter((el) => {
      const local = el.localName;
      if (local !== "dataInputAssociation" && local !== "dataOutputAssociation") return false;
      if (includedIds.has(el.getAttribute("id"))) return false;
      const refIds = Array.from(el.children)
        .filter((child) => child.localName === "sourceRef" || child.localName === "targetRef")
        .map((child) => child.textContent);
      return refIds.some((refId) => idSet.has(String(refId || "").trim()));
    });
  for (const el of dataAssociations) {
    const clone = fragmentDoc.importNode(el, true);
    includedIds.add(el.getAttribute("id"));
    const parentLocal = el.parentElement?.localName;
    let container = Array.from(fragmentRoot.children).find((child) => child.localName === parentLocal);
    if (!container) {
      container = fragmentDoc.createElementNS(BPMN_NS, `bpmn:${parentLocal || "process"}`);
      fragmentRoot.appendChild(container);
    }
    container.appendChild(clone);
  }
  const diNodes = sourceDoc.documentElement.getElementsByTagNameNS(BPMNDI_NS, "*");
  const diParent = fragmentDoc.createElementNS(BPMNDI_NS, "bpmndi:BPMNDiagram");
  const diPlane = fragmentDoc.createElementNS(BPMNDI_NS, "bpmndi:BPMNPlane");
  diPlane.setAttribute("id", "TemplateFragment_Plane");
  diParent.appendChild(diPlane);
  let diCount = 0;
  for (const el of diNodes) {
    if (!idSet.has(el.getAttribute("bpmnElement"))) continue;
    diPlane.appendChild(fragmentDoc.importNode(el, true));
    diCount += 1;
  }
  if (diCount) fragmentRoot.appendChild(diParent);
  return new XMLSerializer().serializeToString(fragmentRoot);
}

export function isParseableBpmnXml(xmlRaw) {
  const text = String(xmlRaw || "").trim();
  if (!text) return true;
  if (typeof DOMParser !== "function") return true;
  try {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    return !!doc.documentElement
      && doc.documentElement.localName !== "parsererror"
      && doc.getElementsByTagName("parsererror").length === 0;
  } catch {
    return false;
  }
}
