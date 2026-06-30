import { useAdminQuery } from "./useAdminQuery";
import { apiAdminListOrgs } from "../api/adminApi";

export default function useAdminOrgsData({ enabled = true } = {}) {
  const fetchOrgs = async () => {
    const res = await apiAdminListOrgs();
    if (!res.ok) {
      throw new Error(res.error || "admin_data_failed");
    }
    return res.data && typeof res.data === "object" ? res.data : { items: [], count: 0 };
  };

  const { data, isLoading, error, refetch } = useAdminQuery({
    queryKey: ["adminOrgs"],
    fetcher: fetchOrgs,
    enabled,
  });

  return {
    loading: isLoading,
    error: error?.message || "",
    data: data || { items: [], count: 0 },
    reload: refetch,
  };
}
