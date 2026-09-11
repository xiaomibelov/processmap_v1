/**
 * Shared react-query contract for the explorer page payload
 * (`GET /api/explorer?workspace_id=...&folder_id=...`).
 *
 * Used by ExplorerPane (useQuery) and WorkspaceSidebar (prefetch on hover)
 * so that switching workspaces renders instantly from cache
 * (`placeholderData: keepPreviousData`) instead of flashing a skeleton.
 */

import { apiGetExplorerPage } from "./explorerApi.js";

export const EXPLORER_PAGE_STALE_TIME_MS = 5 * 60 * 1000;

export function explorerPageQueryKey(workspaceId, folderId = "", stageKey = "") {
  return ["explorer-page", String(workspaceId || ""), String(folderId || ""), String(stageKey || "")];
}

export async function fetchExplorerPage({ queryKey }) {
  const [, workspaceId, folderId, stageKey] = queryKey;
  const stage = String(stageKey || "")
    .split("+")
    .filter((value) => value === "as_is" || value === "to_be");
  const resp = await apiGetExplorerPage(workspaceId, folderId || "", { stage });
  if (!resp?.ok) throw new Error(resp?.error || "Ошибка загрузки");
  return resp?.data || resp;
}

export function explorerPageQueryOptions(workspaceId, folderId = "", stageKey = "") {
  return {
    queryKey: explorerPageQueryKey(workspaceId, folderId, stageKey),
    queryFn: fetchExplorerPage,
    staleTime: EXPLORER_PAGE_STALE_TIME_MS,
  };
}
