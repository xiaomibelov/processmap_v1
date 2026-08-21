import useAdminDataQuery from "./useAdminDataQuery";
import { apiAdminGetDashboard } from "../api/adminApi";

export default function useAdminDashboardData({ enabled = true } = {}) {
  return useAdminDataQuery({
    enabled,
    initialData: {},
    deps: [],
    fetcher: () => apiAdminGetDashboard(),
  });
}
