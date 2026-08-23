import { apiAdminListAgentRuns } from "../../../lib/api";
import useAdminDataQuery from "../hooks/useAdminDataQuery";

export default function useAdminAgentRunsData({ enabled = true, userId = "" } = {}) {
  const uid = String(userId || "").trim();
  return useAdminDataQuery({
    enabled,
    initialData: { items: [], count: 0 },
    deps: [uid],
    fetcher: () => apiAdminListAgentRuns(uid ? { user_id: uid } : {}),
  });
}
