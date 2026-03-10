/**
 * Explorer API — thin wrappers using the shared authenticated request client.
 */
import { apiRequest } from "../../lib/api.js";

function q(params) {
  const pairs = Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return pairs.length ? "?" + pairs.join("&") : "";
}

function call(path, opts = {}) {
  return apiRequest(path, opts);
}

export async function apiListWorkspaces() {
  return call("/api/workspaces");
}

export async function apiCreateWorkspace(name) {
  return call("/api/workspaces", { method: "POST", body: { name } });
}

export async function apiRenameWorkspace(workspaceId, name) {
  return call(`/api/workspaces/${encodeURIComponent(workspaceId)}`, { method: "PATCH", body: { name } });
}

export async function apiGetExplorerPage(workspaceId, folderId = "") {
  return call(`/api/explorer${q({ workspace_id: workspaceId, folder_id: folderId || "" })}`);
}

export async function apiCreateFolder(workspaceId, { name, parent_id = "", sort_order = 0 }) {
  return call(`/api/workspaces/${encodeURIComponent(workspaceId)}/folders`, {
    method: "POST",
    body: { name, parent_id, sort_order },
  });
}

export async function apiRenameFolder(workspaceId, folderId, name) {
  return call(`/api/folders/${encodeURIComponent(folderId)}${q({ workspace_id: workspaceId })}`, {
    method: "PATCH",
    body: { name },
  });
}

export async function apiMoveFolder(workspaceId, folderId, newParentId = "") {
  return call(`/api/folders/${encodeURIComponent(folderId)}/move${q({ workspace_id: workspaceId })}`, {
    method: "POST",
    body: { new_parent_id: newParentId || "" },
  });
}

export async function apiDeleteFolder(workspaceId, folderId, cascade = false) {
  return call(
    `/api/folders/${encodeURIComponent(folderId)}${q({ workspace_id: workspaceId, cascade: cascade ? "true" : "false" })}`,
    { method: "DELETE" }
  );
}

export async function apiCreateProject(workspaceId, folderId, { name, description = "", owner_user_id = "" }) {
  return call(
    `/api/folders/${encodeURIComponent(folderId)}/projects${q({ workspace_id: workspaceId })}`,
    { method: "POST", body: { name, description, owner_user_id } }
  );
}

export async function apiGetProjectPage(workspaceId, projectId) {
  return call(`/api/projects/${encodeURIComponent(projectId)}/explorer${q({ workspace_id: workspaceId })}`);
}

export async function apiCreateSession(workspaceId, projectId, { name, roles = [], start_role = "", mode = "quick_skeleton" }) {
  return call(
    `/api/projects/${encodeURIComponent(projectId)}/explorer/sessions${q({ workspace_id: workspaceId })}`,
    { method: "POST", body: { name, roles, start_role, mode } }
  );
}
