import {
  normalizeTemplatePack,
  readTemplatePackBBox,
} from "./applyBpmnFragmentTemplatePlacement.js";

function toText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasUnsupportedFragmentNode(nodeRaw) {
  const type = toText(nodeRaw?.type || nodeRaw?.$type).toLowerCase();
  if (!type) return false;
  if (type.includes("boundaryevent")) return true;
  if (type.includes("subprocess")) return true;
  return false;
}

export async function buildBpmnFragmentTemplate(captureTemplatePack, meta = {}) {
  if (typeof captureTemplatePack !== "function") {
    return { ok: false, error: "capture_api_unavailable", template: null };
  }
  const captureResult = await Promise.resolve(captureTemplatePack({
    title: toText(meta.title),
  }));
  if (!captureResult?.ok) {
    return {
      ok: false,
      error: toText(captureResult?.error || "fragment_capture_failed"),
      template: null,
    };
  }
  const pack = normalizeTemplatePack(captureResult?.pack);
  if (!pack) {
    return { ok: false, error: "invalid_pack", template: null };
  }
  const unsupported = asArray(pack.fragment?.nodes)
    .filter((node) => hasUnsupportedFragmentNode(node))
    .map((node) => toText(node?.type || node?.$type))
    .filter(Boolean);
  if (unsupported.length) {
    return {
      ok: false,
      error: "unsupported_fragment_nodes",
      warning: `Unsupported BPMN node types: ${unsupported.join(", ")}`,
      template: null,
    };
  }
  const bbox = readTemplatePackBBox(pack);
  const nodes = asArray(pack.fragment?.nodes);
  const title = toText(meta.title)
    || (toText(pack.title) ? toText(pack.title) : `BPMN fragment ${nodes.length || 1}`);
  const template = {
    id: toText(meta.id),
    title,
    scope: toText(meta.scope || "personal") || "personal",
    template_type: "bpmn_fragment_v1",
    bpmn_element_ids: [],
    selection_count: nodes.length,
    source_session_id: toText(meta.sourceSessionId),
    notes: toText(meta.notes),
    payload: {
      pack,
      fragment: pack.fragment,
      bbox,
      entry_node_id: toText(pack.entryNodeId),
      exit_node_id: toText(pack.exitNodeId),
      hints: pack.hints && typeof pack.hints === "object" ? pack.hints : {},
      source: "bpmn_fragment_capture",
    },
    meta: {
      source: "bpmn_fragment_capture",
    },
  };
  return { ok: true, error: "", warning: "", template };
}

