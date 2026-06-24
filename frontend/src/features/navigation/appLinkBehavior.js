import {
  ANALYTICS_MODULE_ACTIONS,
  buildAnalyticsPath,
  buildProcessMapUrl,
} from "../../app/processMapRouteModel.js";

export function buildAppWorkspaceHref({ projectId = "", sessionId = "" } = {}) {
  return buildProcessMapUrl({ projectId, sessionId });
}

export function buildProductActionsRegistryHref({
  scope = "workspace",
  workspaceId = "",
  projectId = "",
  sessionId = "",
} = {}) {
  let effectiveScope = String(scope || "").trim().toLowerCase();
  if (effectiveScope === "current") effectiveScope = "session";
  const scopeId =
    effectiveScope === "session"
      ? sessionId
      : effectiveScope === "project"
        ? projectId
        : workspaceId;
  if (!scopeId) return "/analytics";
  return buildAnalyticsPath(effectiveScope, scopeId, ANALYTICS_MODULE_ACTIONS);
}

export function shouldHandleClientNavigation(event, target = "") {
  if (!event) return false;
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (target && target !== "_self") return false;
  return !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
}
