import useAdminDataQuery from "./useAdminDataQuery";
import { apiAdminListAudit } from "../api/adminApi";

export default function useAdminAuditData({
  enabled = true,
  q = "",
  status = "",
  action = "",
  sessionId = "",
  projectId = "",
  updatedFrom = 0,
  updatedTo = 0,
  limit = 20,
  offset = 0,
} = {}) {
  return useAdminDataQuery({
    enabled,
    initialData: { summary: {}, items: [], count: 0, page: { limit: 20, offset: 0, total: 0 } },
    deps: [q, status, action, sessionId, projectId, updatedFrom, updatedTo, limit, offset],
    fetcher: () => apiAdminListAudit({
      q,
      status,
      action,
      session_id: sessionId,
      project_id: projectId,
      updated_from: updatedFrom,
      updated_to: updatedTo,
      limit,
      offset,
    }),
  });
}
