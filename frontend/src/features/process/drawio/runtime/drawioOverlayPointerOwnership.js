import { isExplicitDrawioCreateTool } from "./drawioCreateGuard.js";

export function isDrawioCreatePlacementActive({
  visible,
  effectiveMode,
  runtimeTool,
}) {
  return !!visible
    && String(effectiveMode || "") === "edit"
    && isExplicitDrawioCreateTool(runtimeTool);
}

export function resolveDrawioOverlaySvgPointerEvents(optionsRaw) {
  if (optionsRaw === true) return "auto";
  if (optionsRaw === false) return "none";
  const options = optionsRaw && typeof optionsRaw === "object" ? optionsRaw : {};
  const createPlacementActive = options.createPlacementActive === true;
  const hasRenderable = options.hasRenderable === true;
  const effectiveMode = String(options.effectiveMode || "").toLowerCase();
  // Placement mode (rect/text/container tool): SVG must capture pointer moves
  // for cursor tracking and placement preview — keep "auto".
  if (createPlacementActive) return "auto";
  // Edit mode without a placement tool: individual draw.io elements already have
  // pointer-events:auto set by applyDrawioNodeRenderState. The SVG itself must be
  // "none" so empty SVG areas are transparent — clicks on BPMN elements underneath
  // pass through and reach their targets. Clicks on draw.io elements still fire on
  // those elements, bubble through the SVG (pointer-events:none does not stop
  // bubbling), and reach the capture listener on the root div.
  return "none";
}
