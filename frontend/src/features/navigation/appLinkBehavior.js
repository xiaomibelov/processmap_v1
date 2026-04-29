import { buildProcessMapUrl } from "../../app/processMapRouteModel.js";

export function buildAppWorkspaceHref({ projectId = "", sessionId = "" } = {}) {
  return buildProcessMapUrl({ projectId, sessionId });
}

export function shouldHandleClientNavigation(event, target = "") {
  if (!event) return false;
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (target && target !== "_self") return false;
  return !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
}
