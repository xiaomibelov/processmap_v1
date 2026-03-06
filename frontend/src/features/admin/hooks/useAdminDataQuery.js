import { useEffect, useRef, useState } from "react";

import { toText } from "../adminUtils";

export default function useAdminDataQuery({
  enabled = true,
  initialData = null,
  deps = [],
  fetcher,
}) {
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");
  const [data, setData] = useState(initialData);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError("");
      return;
    }
    if (typeof fetcher !== "function") {
      setLoading(false);
      setError("admin_fetcher_missing");
      return;
    }
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    setLoading(true);
    setError("");
    Promise.resolve(fetcher())
      .then((res) => {
        if (seqRef.current !== seq) return;
        if (!res?.ok) {
          setError(toText(res?.error || "admin_data_failed"));
          setData(initialData);
          return;
        }
        setData(res.data ?? initialData);
      })
      .catch((err) => {
        if (seqRef.current !== seq) return;
        setError(toText(err?.message || err || "admin_data_failed"));
        setData(initialData);
      })
      .finally(() => {
        if (seqRef.current === seq) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { loading, error, data };
}
