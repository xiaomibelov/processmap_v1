import useAdminDataQuery from "./useAdminDataQuery";
import { apiAdminListSessions } from "../api/adminApi";

export default function useAdminSessionsData({
  enabled = true,
  q = "",
  status = "",
  ownerIds = "",
} = {}) {
  return useAdminDataQuery({
    enabled,
    initialData: { items: [], count: 0, org: {} },
    deps: [q, status, ownerIds],
    fetcher: () => apiAdminListSessions({ q, status, owner_ids: ownerIds }),
  });
}
