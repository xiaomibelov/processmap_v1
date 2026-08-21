/**
 * P2 [Б]: react-query contract для ленивой подгрузки сессий проекта в дереве
 * explorer (`GET /api/projects/{id}/explorer?root_only=true&include_children_meta=true`).
 *
 * root_only=true гарантирует, что в раскрытом проекте отображаются только
 * корневые сессии; подпроцессы подгружаются отдельно по шеврону через
 * `apiGetSessionChildren` (SessionTreeRows). include_children_meta=true
 * заполняет has_children/children_count для шевронов.
 *
 * Запрос активируется только у раскрытого проекта (строка ProjectSessionsRows
 * монтируется при expanded → useQuery с enabled) — свёрнутые проекты сеть
 * не трогают. staleTime 5min: повторное раскрытие/скролл без refetch.
 */

import { apiGetProjectPage } from "./explorerApi.js";

export const PROJECT_SESSIONS_STALE_TIME_MS = 5 * 60 * 1000;

export function projectSessionsQueryKey(projectId) {
  return ["project-sessions", String(projectId || "")];
}

export async function fetchProjectSessions(workspaceId, projectId) {
  const resp = await apiGetProjectPage(workspaceId, projectId, {
    rootOnly: true,
    includeChildrenMeta: true,
  });
  if (!resp?.ok) throw new Error(resp?.error || "Ошибка загрузки сессий проекта");
  return Array.isArray(resp?.data?.sessions) ? resp.data.sessions : [];
}

export function projectSessionsQueryOptions(workspaceId, projectId) {
  return {
    queryKey: projectSessionsQueryKey(projectId),
    queryFn: () => fetchProjectSessions(workspaceId, projectId),
    staleTime: PROJECT_SESSIONS_STALE_TIME_MS,
  };
}
