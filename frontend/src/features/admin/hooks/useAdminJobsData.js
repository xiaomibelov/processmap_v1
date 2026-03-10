import useAdminDataQuery from "./useAdminDataQuery";
import { apiAdminListJobs } from "../api/adminApi";

export default function useAdminJobsData({ enabled = true } = {}) {
  return useAdminDataQuery({
    enabled,
    initialData: { summary: {}, queue_health: {}, items: [], count: 0 },
    deps: [],
    fetcher: () => apiAdminListJobs(),
  });
}
