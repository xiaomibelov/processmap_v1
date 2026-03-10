import useAdminDataQuery from "./useAdminDataQuery";
import { apiAdminListAudit } from "../api/adminApi";

export default function useAdminAuditData({
  enabled = true,
  q = "",
  status = "",
  action = "",
  sessionId = "",
  projectId = "",
} = {}) {
  return useAdminDataQuery({
    enabled,
    initialData: { summary: {}, items: [], count: 0 },
    deps: [q, status, action, sessionId, projectId],
    fetcher: () => apiAdminListAudit({
      q,
      status,
      action,
      session_id: sessionId,
      project_id: projectId,
      limit: 300,
    }),
  });
}
