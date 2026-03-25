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
  if (createPlacementActive) return "auto";
  if (hasRenderable && effectiveMode === "edit") return "auto";
  return "none";
}
