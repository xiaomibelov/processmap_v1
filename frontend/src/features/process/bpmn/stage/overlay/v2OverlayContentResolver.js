import {
  extractOverlayProperties,
  isOverlayMetaProperty,
  parseOverlayFromProperties,
} from "../../../../../components/process/utils/bpmnOverlayParser.js";
import { asArray, asObject, asText } from "./overlayUtils.js";

function dedupePropertiesByExactValue(props) {
  if (!Array.isArray(props)) return [];
  const seen = new Set();
  return props.filter((prop) => {
    const name = asText(prop?.name);
    if (!name) return true;
    const signature = `${name}\u0000${asText(prop?.value)}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function buildAutoOverlayDescriptor(elementId, title, colorKey, geometry, properties) {
  return {
    node_id: elementId,
    text: title,
    x: geometry?.x ?? 0,
    y: geometry?.y ?? -40,
    width: geometry?.width ?? 180,
    height: geometry?.height ?? 30,
    style: {},
    meta: { title },
    colorKey: colorKey || "property",
    auto: true,
    showProperties: true,
    properties,
  };
}

export function resolveV2OverlayContent({ elementId, inst, previewMap, forceShow = false }) {
  const id = asText(elementId);
  if (!id) return null;

  const normalizedPreviewMap = asObject(previewMap);
  const hasPreviewEntry = Object.prototype.hasOwnProperty.call(normalizedPreviewMap, id);

  const registry = inst?.get?.("elementRegistry");
  const el = typeof registry?.get === "function" ? registry.get(id) : null;
  const bo = asObject(el?.businessObject);
  const elementName = String(bo.name || el?.name || "").trim();
  const elementType = String(bo.$type || el?.type || "").trim();

  if (hasPreviewEntry) {
    const preview = normalizedPreviewMap[id];
    const enabled = preview?.enabled !== false;
    const items = enabled
      ? asArray(preview?.items).filter((item) => asText(item?.key ?? item?.label) && asText(item?.value) !== "")
      : [];
    const properties = items.map((item) => ({
      name: asText(item?.key ?? item?.label),
      value: asText(item?.value),
    }));

    if (properties.length) {
      const title = `${properties.length} element properties`;
      return { ...buildAutoOverlayDescriptor(id, title, properties[0]?.name || "property", undefined, properties), source: "preview" };
    }

    // An empty or disabled preview entry means "this element has no properties
    // to show via the selection preview". When V2 global rendering is active
    // (forceShow) the selection-driven preview must NOT suppress the element's
    // own BPMN-derived card — otherwise selecting an element would remove its
    // V2 overlay. Fall through to BPMN extraction.
    // When forceShow is off (per-element mode), keep the "intentionally
    // property-less" suppression so stale BPMN cards are not shown.
    if (!forceShow) return null;
  }

  const props = extractOverlayProperties(bo);
  const overlay = parseOverlayFromProperties(props, id, elementName, elementType, forceShow);
  if (!overlay) return null;

  const businessProperties = dedupePropertiesByExactValue(
    props.filter((p) => !isOverlayMetaProperty(p?.name) && asText(p?.value) !== "")
  );

  return {
    ...overlay,
    source: "bpmn",
    properties: businessProperties,
  };
}

export function mergeV2OverlaysWithPropertyPreview(inst, overlayList, previewMap, { forceShow = false } = {}) {
  const normalizedPreviewMap = asObject(previewMap);
  const previewKeys = Object.keys(normalizedPreviewMap);
  if (!previewKeys.length) return overlayList;

  const extractedByNodeId = new Map(
    asArray(overlayList).map((ovl) => [asText(ovl?.node_id || ovl?.nodeId), ovl])
  );
  const merged = [];

  previewKeys.forEach((elementId) => {
    const content = resolveV2OverlayContent({ elementId, inst, previewMap: normalizedPreviewMap, forceShow });
    if (!content) return;

    const existing = extractedByNodeId.get(elementId);
    if (existing) {
      merged.push({ ...existing, properties: content.properties });
    } else {
      merged.push(content);
    }
  });

  asArray(overlayList).forEach((ovl) => {
    const nodeId = asText(ovl?.node_id || ovl?.nodeId);
    if (!normalizedPreviewMap[nodeId]) {
      merged.push(ovl);
    }
  });

  return merged;
}
