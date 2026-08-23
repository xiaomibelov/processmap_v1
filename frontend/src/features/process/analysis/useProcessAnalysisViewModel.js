import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGetSessionAnalysisViewModel } from "../../../lib/api.js";
import { mapProcessAnalysisViewModel } from "./processAnalysisModel.js";

export function useProcessAnalysisViewModel({ sessionId, externalViewModel, t }) {
  const [loading, setLoading] = useState(!externalViewModel);
  const [error, setError] = useState(null);
  const [viewModel, setViewModel] = useState(externalViewModel || null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    if (externalViewModel) {
      setViewModel(externalViewModel);
      setLoading(false);
      setError(null);
      return;
    }
    if (!sessionId) {
      setLoading(false);
      setError(null);
      setViewModel(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiGetSessionAnalysisViewModel(sessionId);
      if (!aliveRef.current) return;
      if (result?.ok) {
        setViewModel(result);
      } else {
        setError(result?.error || "load_failed");
        setViewModel(null);
      }
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err?.message || "load_failed");
      setViewModel(null);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [sessionId, externalViewModel]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  const retry = useCallback(() => {
    aliveRef.current = true;
    return load();
  }, [load]);

  const model = useMemo(() => {
    if (!viewModel) return null;
    return mapProcessAnalysisViewModel(viewModel, t);
  }, [viewModel, t]);

  return {
    loading,
    error,
    viewModel,
    model,
    retry,
  };
}
