import useAdminDataQuery from "./useAdminDataQuery";
import { apiAdminGetAgentRun } from "../api/adminApi";

export default function useAdminAgentRunDetailData({
  enabled = true,
  runId = "",
} = {}) {
  return useAdminDataQuery({
    enabled: Boolean(enabled && String(runId || "").trim()),
    initialData: { run_id: "", contour_id: "", agents: [], markers: {} },
    deps: [runId],
    fetcher: () => apiAdminGetAgentRun(runId),
  });
}
