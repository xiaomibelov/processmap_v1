import { useEffect, useMemo, useState } from "react";
import { apiGetSessionAnalysisViewModel } from "../../../lib/api.js";
import { mapProcessAnalysisViewModel } from "./processAnalysisModel.js";

export function useProcessAnalysisViewModel({ sessionId, externalViewModel, t }) {
  const [loading, setLoading] = useState(!externalViewModel);
  const [error, setError] = useState(null);
  const [viewModel, setViewModel] = useState(externalViewModel || null);

  useEffect(() => {
    if (externalViewModel) {
      setViewModel(externalViewModel);
      setLoading(false);
      setError(null);
      return undefined;
    }
    if (!sessionId) {
      setLoading(false);
      setError("missing session_id");
      return undefined;
    }
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await apiGetSessionAnalysisViewModel(sessionId);
        if (!alive) return;
        if (result?.ok) {
          setViewModel(result);
        } else {
          setError(result?.error || "load_failed");
          setViewModel(null);
        }
      } catch (err) {
        if (!alive) return;
        setError(err?.message || "load_failed");
        setViewModel(null);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [sessionId, externalViewModel]);

  const model = useMemo(() => {
    if (!viewModel) return null;
    return mapProcessAnalysisViewModel(viewModel, t);
  }, [viewModel, t]);

  return {
    loading,
    error,
    viewModel,
    model,
  };
}
