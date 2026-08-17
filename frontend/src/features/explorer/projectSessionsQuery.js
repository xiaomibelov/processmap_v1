/**
 * P2 [Б]: react-query contract для ленивой подгрузки сессий проекта в дереве
 * explorer (`GET /api/projects/{id}/sessions?view=summary`, лёгкий payload).
 *
 * Запрос активируется только у раскрытого проекта (строка ProjectSessionsRows
 * монтируется при expanded → useQuery с enabled) — свёрнутые проекты сеть
 * не трогают. staleTime 5min: повторное раскрытие/скролл без refetch.
 */

import { apiListProjectSessions } from "../../lib/api.js";

export const PROJECT_SESSIONS_STALE_TIME_MS = 5 * 60 * 1000;

export function projectSessionsQueryKey(projectId) {
  return ["project-sessions", String(projectId || "")];
}

export async function fetchProjectSessions({ queryKey }) {
  const [, projectId] = queryKey;
  const resp = await apiListProjectSessions(projectId);
  if (!resp?.ok) throw new Error(resp?.error || "Ошибка загрузки сессий проекта");
  return Array.isArray(resp?.sessions) ? resp.sessions : [];
}

export function projectSessionsQueryOptions(projectId) {
  return {
    queryKey: projectSessionsQueryKey(projectId),
    queryFn: fetchProjectSessions,
    staleTime: PROJECT_SESSIONS_STALE_TIME_MS,
  };
}
