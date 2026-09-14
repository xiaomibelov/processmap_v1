import { useEffect, useState } from "react";
import { apiAdminRagGetIndexingPlan } from "../../../lib/apiModules/adminApi.js";

export default function useAdminRagIndexingPlan({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    apiAdminRagGetIndexingPlan().then((r) => {
      if (cancelled) return;
      if (r.ok) setData(r.data);
      else setError(String(r.error || "Ошибка загрузки"));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  return { data, loading, error };
}
