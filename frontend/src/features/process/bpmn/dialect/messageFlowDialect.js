// messageFlow-inside-process/subProcess dialect (feature #43).
//
// The backend dialect keeps messageFlow elements INSIDE bpmn:process /
// bpmn:subProcess to store links from in-subprocess nodes to external
// dataStoreReference elements. bpmn-moddle (bpmn-js) cannot parse messageFlow
// there ("unparsable content") and silently drops it on importXML, so any
// saveXML roundtrip destroyed the link even without entering the subprocess.
//
// Roundtrip strategy (hoist / re-inject):
// - import: move dialect messageFlows out of process/subProcess into a
//   bpmn:collaboration (valid BPMN, moddle keeps them);
// - export: move them back into their original containers, so the server
//   dialect stays byte-compatible with what the backend expects.

const BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI";

const CREATED_COLLABORATION_ID = "Collaboration_messageflow_dialect";

function parseXml(xmlText) {
  if (typeof DOMParser !== "function" || !xmlText) return null;
  const doc = new DOMParser().parseFromString(String(xmlText), "text/xml");
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return null;
  return doc;
}

function serializeXml(doc) {
  return new XMLSerializer().serializeToString(doc);
}

function childrenByLocalName(el, localName) {
  return Array.from(el.children || []).filter(
    (ch) => ch.namespaceURI === BPMN_NS && ch.localName === localName
  );
}

function collectFlowContainers(definitions) {
  const containers = [];
  for (const process of childrenByLocalName(definitions, "process")) {
    containers.push(process);
    const walker = [process];
    while (walker.length) {
      const node = walker.pop();
      for (const ch of node.children || []) {
        if (ch.namespaceURI === BPMN_NS && ch.localName === "subProcess") {
          containers.push(ch);
        }
        walker.push(ch);
      }
    }
  }
  return containers;
}

function findCollaboration(definitions) {
  return (
    childrenByLocalName(definitions, "collaboration").find(
      (el) => el.getAttribute("id") === CREATED_COLLABORATION_ID
    ) || childrenByLocalName(definitions, "collaboration")[0] ||
    null
  );
}

function findById(root, id) {
  if (!id) return null;
  const walker = [root];
  while (walker.length) {
    const node = walker.pop();
    if (node.getAttribute && node.getAttribute("id") === id) return node;
    for (const ch of node.children || []) walker.push(ch);
  }
  return null;
}

export function hoistMessageFlowsFromContainers(xmlText) {
  const unchanged = { xml: xmlText, moved: [], changed: false, createdCollaborationId: null };
  const doc = parseXml(xmlText);
  if (!doc || !doc.documentElement) return unchanged;
  const definitions = doc.documentElement;
  if (definitions.namespaceURI !== BPMN_NS || definitions.localName !== "definitions") {
    return unchanged;
  }

  const detached = [];
  for (const container of collectFlowContainers(definitions)) {
    for (const flow of childrenByLocalName(container, "messageFlow")) {
      container.removeChild(flow);
      detached.push({ flow, containerId: container.getAttribute("id") || "" });
    }
  }
  if (detached.length === 0) return unchanged;

  let collaboration = findCollaboration(definitions);
  let createdCollaborationId = null;
  if (!collaboration) {
    collaboration = doc.createElementNS(BPMN_NS, "bpmn:collaboration");
    collaboration.setAttribute("id", CREATED_COLLABORATION_ID);
    const diagram = childrenByLocalName(definitions, "BPMNDiagram")[0];
    if (diagram && diagram.namespaceURI === BPMNDI_NS) {
      definitions.insertBefore(collaboration, diagram);
    } else {
      definitions.appendChild(collaboration);
    }
    createdCollaborationId = CREATED_COLLABORATION_ID;
  }
  const moved = [];
  for (const { flow, containerId } of detached) {
    collaboration.appendChild(flow);
    moved.push({ id: flow.getAttribute("id") || "", containerId });
  }
  return { xml: serializeXml(doc), moved, changed: true, createdCollaborationId };
}

export function reinjectMessageFlowsIntoContainers(xmlText, state) {
  if (!state || state.changed !== true || !Array.isArray(state.moved) || state.moved.length === 0) {
    return xmlText;
  }
  const doc = parseXml(xmlText);
  if (!doc || !doc.documentElement) return xmlText;
  const definitions = doc.documentElement;

  const collaboration =
    childrenByLocalName(definitions, "collaboration").find(
      (el) => el.getAttribute("id") === state.createdCollaborationId
    ) || findCollaboration(definitions);
  if (!collaboration) return xmlText;

  for (const { id, containerId } of state.moved) {
    const flow = childrenByLocalName(collaboration, "messageFlow").find(
      (el) => el.getAttribute("id") === id
    );
    if (!flow) continue;
    const container = findById(definitions, containerId);
    if (!container) continue; // container deleted in the editor: keep the flow in collaboration
    collaboration.removeChild(flow);
    container.appendChild(flow);
  }

  if (
    state.createdCollaborationId &&
    collaboration.getAttribute("id") === state.createdCollaborationId &&
    childrenByLocalName(collaboration, "messageFlow").length === 0 &&
    (collaboration.children || []).length === 0
  ) {
    collaboration.parentNode.removeChild(collaboration);
  }
  return serializeXml(doc);
}

// Import/export dialect state is shared per runtime instance scope: the stage
// loads one document at a time, so the last hoist is the reinject target.
let lastImportState = null;

export function applyMessageFlowImportDialect(xmlText) {
  const result = hoistMessageFlowsFromContainers(xmlText);
  lastImportState = result;
  return result.xml;
}

export function applyMessageFlowExportDialect(xmlText) {
  return reinjectMessageFlowsIntoContainers(xmlText, lastImportState);
}
