import useAdminDataQuery from "./useAdminDataQuery";
import { apiAdminListOrgs } from "../api/adminApi";

export default function useAdminOrgsData({ enabled = true } = {}) {
  return useAdminDataQuery({
    enabled,
    initialData: { items: [], count: 0 },
    deps: [],
    fetcher: () => apiAdminListOrgs(),
  });
}
