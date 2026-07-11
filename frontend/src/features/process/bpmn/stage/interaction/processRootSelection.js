// Process-level selection helpers (Camunda Modeler parity).
//
// Clicking empty canvas selects the root process-like element (bpmn:Process,
// or bpmn:Collaboration when the diagram is pooled) instead of leaving the
// sidebar empty. The root element id then flows through the regular — fully
// id-generic — property draft/save pipeline.

import { asArray, asObject, asText } from "../overlay/overlayUtils.js";

const PROCESS_LIKE_TYPE_RE = /(^|:)(process|collaboration)$/i;

export function isProcessLikeType(type) {
  return PROCESS_LIKE_TYPE_RE.test(asText(type));
}

export function isProcessLikeElement(el) {
  if (!el) return false;
  const bo = asObject(el?.businessObject);
  return isProcessLikeType(bo.$type || el?.type);
}

function getCanvas(inst) {
  try {
    return inst?.get?.("canvas") || null;
  } catch {
    return null;
  }
}

function getDefinitions(inst) {
  const canvas = getCanvas(inst);
  const rootBo = asObject(canvas?.getRootElement?.()?.businessObject);
  // The definitions node is the parent of any root element's businessObject.
  return asObject(rootBo.$parent || canvas?.getRootElement?.()?.businessObject?.$parent);
}

/**
 * Resolve the root process-like element for a bpmn instance.
 * Returns the plane root element when it is a bpmn:Process / bpmn:Collaboration,
 * otherwise falls back to definitions.rootElements[0] (bpmn:Process only).
 * Returns null for subprocess drill-down roots and when nothing qualifies.
 */
export function resolveProcessLikeRootElement(inst) {
  const canvas = getCanvas(inst);
  const root = canvas?.getRootElement?.() || null;
  if (root && isProcessLikeElement(root)) return root;

  const definitions = getDefinitions(inst);
  const firstRoot = asArray(definitions?.rootElements)[0];
  if (firstRoot && isProcessLikeType(firstRoot?.$type)) {
    // The definitions node is a moddle businessObject, not a diagram element.
    // Prefer the registry element so downstream code (decor, overlays, emit)
    // receives a real djs element; fall back to the moddle object itself.
    try {
      const registry = inst?.get?.("elementRegistry");
      const el = registry?.get?.(asText(firstRoot.id));
      if (el) return el;
    } catch {
      // ignore registry failures
    }
    return firstRoot;
  }
  return null;
}
