/**
 * Stable signature builders for decor guard checks.
 * Used by BpmnStage to skip redundant clear+rebuild of SVG markers
 * when the element set has not changed between commandStack.changed events.
 */

function asText(value) {
  return String(value || "");
}

export function buildTaskTypeSignature(registry, isShapeElement) {
  const parts = [];
  registry.filter((el) => isShapeElement(el)).forEach((el) => {
    const t = asText(el?.businessObject?.$type).trim();
    if (t) parts.push(el.id + ":" + t);
  });
  parts.sort();
  return parts.join("|");
}

export function buildLinkEventSignature(registry, isShapeElement, helpers) {
  const { hasLinkEventDefinition, readLinkEventRole, readLinkEventPairName, normalizeLinkPairKey } = helpers;
  const parts = [];
  registry.filter((el) => isShapeElement(el)).forEach((el) => {
    const bo = el?.businessObject && typeof el.businessObject === "object" ? el.businessObject : {};
    if (!hasLinkEventDefinition(bo)) return;
    const role = readLinkEventRole(el);
    if (role !== "catch" && role !== "throw") return;
    const pairKey = normalizeLinkPairKey(readLinkEventPairName(el));
    parts.push(el.id + ":" + role + ":" + (pairKey || ""));
  });
  parts.sort();
  return parts.join("|");
}
