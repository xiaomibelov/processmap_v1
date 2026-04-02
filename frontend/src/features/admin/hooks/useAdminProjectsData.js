import useAdminDataQuery from "./useAdminDataQuery";
import { apiAdminListProjects } from "../api/adminApi";

export default function useAdminProjectsData({
  enabled = true,
  q = "",
  limit = 20,
  offset = 0,
} = {}) {
  return useAdminDataQuery({
    enabled,
    initialData: { items: [], count: 0, page: { limit: 20, offset: 0, total: 0 } },
    deps: [q, limit, offset],
    fetcher: () => apiAdminListProjects({ q, limit, offset }),
  });
}
