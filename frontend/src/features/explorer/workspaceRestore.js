function asText(value) {
  return String(value || "").trim();
}

function workspaceIdOf(item) {
  return asText(item?.id);
}

export function resolveExplorerWorkspaceId({ workspaces, activeWorkspaceId = "", requestProjectWorkspaceId = "" } = {}) {
  const list = Array.isArray(workspaces) ? workspaces : [];
  const requested = asText(requestProjectWorkspaceId);
  const current = asText(activeWorkspaceId);

  if (requested && list.some((item) => workspaceIdOf(item) === requested)) {
    return requested;
  }
  if (current && list.some((item) => workspaceIdOf(item) === current)) {
    return current;
  }
  return workspaceIdOf(list[0]);
}

export function canRestoreRequestedProject({
  requestProjectId = "",
  requestProjectWorkspaceId = "",
  activeWorkspaceId = "",
} = {}) {
  const projectId = asText(requestProjectId);
  if (!projectId) return false;

  const requestedWorkspaceId = asText(requestProjectWorkspaceId);
  if (!requestedWorkspaceId) return true;

  return asText(activeWorkspaceId) === requestedWorkspaceId;
}

export function normalizeRequestedProjectWorkspace({
  requestProjectId = "",
  requestProjectWorkspaceId = "",
  resolvedWorkspaceId = "",
  activeWorkspaceId = "",
} = {}) {
  const projectId = asText(requestProjectId);
  if (!projectId) return "";
  return asText(requestProjectWorkspaceId) || asText(resolvedWorkspaceId) || asText(activeWorkspaceId);
}
