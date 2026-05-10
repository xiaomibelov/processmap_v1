import { useCallback, useEffect, useState } from "react";
import { apiAdminRagGetSettings, apiAdminRagPatchSettings } from "../../../lib/apiModules/adminApi.js";

export default function useAdminRagData({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    apiAdminRagGetSettings().then((r) => {
      if (cancelled) return;
      if (r.ok) setData(r.data);
      else setError(String(r.error || "Ошибка загрузки"));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  const save = useCallback(async (patch) => {
    setSaving(true);
    setSaveError("");
    const r = await apiAdminRagPatchSettings(patch);
    if (r.ok) {
      if (r.data?.settings) {
        setData((prev) => prev ? { ...prev, settings: { ...prev.settings, ...r.data.settings } } : r.data);
      }
      setSavedAt(Date.now());
    } else {
      setSaveError(String(r.error || "Ошибка сохранения"));
    }
    setSaving(false);
    return r;
  }, []);

  return { data, loading, error, saving, savedAt, saveError, save };
}
