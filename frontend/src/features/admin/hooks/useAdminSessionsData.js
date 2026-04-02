import useAdminDataQuery from "./useAdminDataQuery";
import { apiAdminListSessions } from "../api/adminApi";

export default function useAdminSessionsData({
  enabled = true,
  q = "",
  status = "",
  ownerIds = "",
  updatedFrom = 0,
  updatedTo = 0,
  needsAttention = -1,
  limit = 20,
  offset = 0,
} = {}) {
  return useAdminDataQuery({
    enabled,
    initialData: { items: [], count: 0, org: {}, page: { limit: 20, offset: 0, total: 0 } },
    deps: [q, status, ownerIds, updatedFrom, updatedTo, needsAttention, limit, offset],
    fetcher: () => apiAdminListSessions({
      q,
      status,
      owner_ids: ownerIds,
      updated_from: updatedFrom,
      updated_to: updatedTo,
      needs_attention: needsAttention,
      limit,
      offset,
    }),
  });
}
