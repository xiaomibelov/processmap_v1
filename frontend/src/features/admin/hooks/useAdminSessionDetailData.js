import useAdminDataQuery from "./useAdminDataQuery";
import { apiAdminGetSession } from "../api/adminApi";

export default function useAdminSessionDetailData({
  enabled = true,
  sessionId = "",
} = {}) {
  return useAdminDataQuery({
    enabled: Boolean(enabled && String(sessionId || "").trim()),
    initialData: { item: null },
    deps: [sessionId],
    fetcher: () => apiAdminGetSession(sessionId),
  });
}
