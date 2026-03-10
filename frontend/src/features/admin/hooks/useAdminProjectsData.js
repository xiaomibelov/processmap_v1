import useAdminDataQuery from "./useAdminDataQuery";
import { apiAdminListProjects } from "../api/adminApi";

export default function useAdminProjectsData({ enabled = true, q = "" } = {}) {
  return useAdminDataQuery({
    enabled,
    initialData: { items: [], count: 0 },
    deps: [q],
    fetcher: () => apiAdminListProjects({ q }),
  });
}
