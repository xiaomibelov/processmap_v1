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

export async function apiMoveProject(workspaceId, projectId, folderId) {
  return call(`/api/projects/${encodeURIComponent(projectId)}/move${q({ workspace_id: workspaceId })}`, {
    method: "POST",
    body: { folder_id: folderId || "" },
  });
}

export async function apiGetProjectPage(workspaceId, projectId) {
  return call(`/api/projects/${encodeURIComponent(projectId)}/explorer${q({ workspace_id: workspaceId })}`);
}

function itemIdOf(item) {
  return String(item?.id || "").trim();
}

function pageHasProject(page, projectId) {
  const wanted = String(projectId || "").trim();
  if (!wanted) return false;
  const items = Array.isArray(page?.items) ? page.items : [];
  return items.some((item) => String(item?.type || "").trim() === "project" && itemIdOf(item) === wanted);
}

function childFolderIds(page) {
  const items = Array.isArray(page?.items) ? page.items : [];
  return items
    .filter((item) => String(item?.type || "").trim() === "folder")
    .map((item) => itemIdOf(item))
    .filter(Boolean);
}

async function searchProjectInWorkspace(workspaceId, projectId) {
  const targetWorkspaceId = String(workspaceId || "").trim();
  const targetProjectId = String(projectId || "").trim();
  if (!targetWorkspaceId || !targetProjectId) return "";

  const queue = [""];
  const visited = new Set();
  while (queue.length) {
    const folderId = String(queue.shift() || "").trim();
    if (visited.has(folderId)) continue;
    visited.add(folderId);
    const resp = await apiGetExplorerPage(targetWorkspaceId, folderId);
    if (!resp?.ok) continue;
    const page = resp?.data || resp;
    if (pageHasProject(page, targetProjectId)) {
      return targetWorkspaceId;
    }
    childFolderIds(page).forEach((childId) => {
      if (!visited.has(childId)) queue.push(childId);
    });
  }
  return "";
}

export async function apiFindProjectWorkspace(workspaceIds, projectId) {
  const ids = Array.isArray(workspaceIds) ? workspaceIds.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const targetProjectId = String(projectId || "").trim();
  if (!ids.length || !targetProjectId) return "";
  for (let i = 0; i < ids.length; i += 1) {
    const found = await searchProjectInWorkspace(ids[i], targetProjectId);
    if (found) return found;
  }
  return "";
}

export async function apiCreateSession(workspaceId, projectId, { name, roles = [], start_role = "", mode = "quick_skeleton" }) {
  return call(
    `/api/projects/${encodeURIComponent(projectId)}/explorer/sessions${q({ workspace_id: workspaceId })}`,
    { method: "POST", body: { name, roles, start_role, mode } }
  );
}
