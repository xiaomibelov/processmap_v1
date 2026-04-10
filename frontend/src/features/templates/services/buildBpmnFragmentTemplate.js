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
  return false;
}

function uniqueText(itemsRaw) {
  return Array.from(new Set(asArray(itemsRaw).map((row) => toText(row)).filter(Boolean)));
}

function buildCaptureWarning(captureResult) {
  const diagnostics = captureResult?.diagnostics && typeof captureResult.diagnostics === "object"
    ? captureResult.diagnostics
    : {};
  const rawSelection = asArray(diagnostics.rawSelection);
  const normalizedSelection = asArray(diagnostics.normalizedSelection);
  const unsupportedSelectionTypes = uniqueText(diagnostics.unsupportedSelectionTypes);
  if (toText(captureResult?.error) === "no_selection" && rawSelection.length) {
    const rawTypes = uniqueText(rawSelection.map((row) => row?.type));
    return `В выделении нет поддерживаемых BPMN узлов. Raw selection: ${rawTypes.join(", ") || "-"}`;
  }
  if (unsupportedSelectionTypes.length) {
    return `Неподдерживаемые BPMN типы в выделении: ${unsupportedSelectionTypes.join(", ")}`;
  }
  if (normalizedSelection.length === 0 && rawSelection.length === 0) {
    return "В текущем выделении нет BPMN элементов для шаблона.";
  }
  return "";
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
      warning: buildCaptureWarning(captureResult),
      diagnostics: captureResult?.diagnostics && typeof captureResult.diagnostics === "object"
        ? captureResult.diagnostics
        : {},
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
      warning: `Неподдерживаемые BPMN типы в шаблоне: ${unsupported.join(", ")}`,
      diagnostics: {
        ...(captureResult?.diagnostics && typeof captureResult.diagnostics === "object" ? captureResult.diagnostics : {}),
        unsupportedNodeTypes: unsupported,
      },
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
  return {
    ok: true,
    error: "",
    warning: "",
    diagnostics: captureResult?.diagnostics && typeof captureResult.diagnostics === "object"
      ? captureResult.diagnostics
      : {},
    template,
  };
}
