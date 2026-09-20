import { useEffect, useState } from "react";
import { apiAdminGetDashboard } from "../api/adminApi";

/**
 * Одноразовый snapshot GET /api/admin/dashboard для страниц-приёмников виджетов.
 * Backend под приёмники не расширяется — страница делает собственный fetch.
 */
export default function useAdminDashboardSnapshot({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setLoading(true);
    apiAdminGetDashboard().then((r) => {
      if (cancelled) return;
      if (r.ok && r.data) {
        setData(r.data);
      } else if (!r.ok) {
        setError(r.error || "dashboard request failed");
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { data, loading, error };
}
