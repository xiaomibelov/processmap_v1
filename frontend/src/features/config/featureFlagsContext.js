import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiGetFeatureFlags } from "../../lib/api";

const FeatureFlagsContext = createContext({ flags: {}, loading: true });

export function FeatureFlagsProvider({ children }) {
  const [flags, setFlags] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetFeatureFlags().then((res) => {
      setFlags(res.ok ? res.flags : {});
      setLoading(false);
    });
  }, []);

  const value = useMemo(() => ({ flags, setFlags, loading }), [flags, loading]);
  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlag(key) {
  const { flags, loading } = useContext(FeatureFlagsContext);
  if (loading) {
    return typeof window !== "undefined" ? window.__FPC_LIGHTWEIGHT_OVERLAYS__ || false : false;
  }
  const val = flags[key];
  if (val === undefined) {
    return typeof window !== "undefined" ? window.__FPC_LIGHTWEIGHT_OVERLAYS__ || false : false;
  }
  return String(val).toLowerCase() === "true" || String(val).toLowerCase() === "1";
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}
