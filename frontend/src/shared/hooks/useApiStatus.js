import { useCallback, useState } from "react";

export default function useApiStatus({ initialStatus = "idle", initialHint = "" } = {}) {
  const [backendStatus, setBackendStatus] = useState(initialStatus); // idle | ok | fail
  const [backendHint, setBackendHint] = useState(initialHint);

  const markOk = useCallback(() => {
    setBackendStatus("ok");
    setBackendHint("");
  }, []);

  const markFail = useCallback((msg) => {
    setBackendStatus("fail");
    setBackendHint(String(msg || "API недоступно или вернуло ошибку."));
  }, []);

  const reset = useCallback(() => {
    setBackendStatus("idle");
    setBackendHint("");
  }, []);

  return { backendStatus, backendHint, markOk, markFail, reset };
}
