export function buildAppWorkspaceHref({ projectId = "", sessionId = "" } = {}) {
  const pid = String(projectId || "").trim();
  const sid = String(sessionId || "").trim();
  const params = new URLSearchParams();
  if (pid) params.set("project", pid);
  if (sid) params.set("session", sid);
  const search = params.toString();
  return search ? `/app?${search}` : "/app";
}

export function shouldHandleClientNavigation(event, target = "") {
  if (!event) return false;
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (target && target !== "_self") return false;
  return !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
}
