import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiGetCanvasGeometry, apiGetFeatureFlags } from "../../lib/api";
import { initCanvasGeometry } from "../process/bpmn/layout/canvasGeometry.js";

const FeatureFlagsContext = createContext({ flags: {}, loading: true });

export function FeatureFlagsProvider({ children }) {
  const [flags, setFlags] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Настройки геометрии канваса: при недоступности/битости ответа
    // initCanvasGeometry оставляет дефолты канона (fallback в самом модуле).
    apiGetCanvasGeometry().then((res) => {
      if (res.ok && res.settings) initCanvasGeometry(res.settings);
    });
    apiGetFeatureFlags().then((res) => {
      setFlags(res.ok ? res.flags : {});
      setLoading(false);
    });
  }, []);

  const value = useMemo(() => ({ flags, setFlags, loading }), [flags, loading]);
  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

function readWindowFlag(key) {
  if (typeof window === "undefined") return false;
  const direct = window[key];
  if (direct === true || direct === "true" || direct === "1") return true;
  if (direct === false || direct === "false" || direct === "0") return false;
  const legacy = window.__FPC_LIGHTWEIGHT_OVERLAYS__;
  if (legacy === true || legacy === "true" || legacy === "1") return true;
  return false;
}

export function useFeatureFlag(key) {
  const { flags, loading } = useContext(FeatureFlagsContext);
  if (loading) {
    return readWindowFlag(key);
  }
  const val = flags[key];
  if (val === undefined) {
    return readWindowFlag(key);
  }
  return String(val).toLowerCase() === "true" || String(val).toLowerCase() === "1";
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}
