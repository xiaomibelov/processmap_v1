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

export function resolveDrawioOverlaySvgPointerEvents(createPlacementActive) {
  return createPlacementActive ? "auto" : "none";
}
