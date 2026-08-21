import { apiAdminListAgentRuns } from "../../../lib/api";
import useAdminDataQuery from "../hooks/useAdminDataQuery";

export default function useAdminAgentRunsData({ enabled = true } = {}) {
  return useAdminDataQuery({
    enabled,
    initialData: { runs: [], count: 0 },
    deps: [],
    fetcher: () => apiAdminListAgentRuns(),
  });
}
