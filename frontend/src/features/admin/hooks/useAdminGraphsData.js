import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiAdminGraphsGetAnalytics,
  apiAdminGraphsGetCurrentSnapshot,
  apiAdminGraphsGetRebuildStatus,
  apiAdminGraphsListSnapshots,
  apiAdminGraphsRebuild,
} from "../../../lib/apiModules/adminApi.js";

const STATUS_POLL_INTERVAL_MS = 2000;
const STATUS_POLL_FOREVER = ["pending", "running"];

export default function useAdminGraphsData({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildError, setRebuildError] = useState("");
  const [activeJobId, setActiveJobId] = useState("");
  const [activeStatus, setActiveStatus] = useState(null);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [snapshotsR, currentR, analyticsR] = await Promise.all([
      apiAdminGraphsListSnapshots(),
      apiAdminGraphsGetCurrentSnapshot(),
      apiAdminGraphsGetAnalytics(),
    ]);
    if (!mountedRef.current) return;
    if (snapshotsR.ok && currentR.ok && analyticsR.ok) {
      setData({
        snapshots: snapshotsR.items || [],
        current: currentR.data || null,
        analytics: analyticsR.data || null,
      });
    } else {
      const firstError = [snapshotsR, currentR, analyticsR].find((r) => !r.ok);
      setError(String(firstError?.error || "Ошибка загрузки графа"));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    load();
    return () => {
      mountedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [enabled, load]);

  const pollStatus = useCallback((jobId) => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!jobId) return;
    const tick = async () => {
      const r = await apiAdminGraphsGetRebuildStatus(jobId);
      if (!mountedRef.current) return;
      if (!r.ok) {
        setRebuildError(String(r.error || "Ошибка проверки статуса"));
        setRebuilding(false);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        return;
      }
      const status = String(r.data?.status || "").toLowerCase();
      setActiveJobId(jobId);
      setActiveStatus(r.data || null);
      if (!STATUS_POLL_FOREVER.includes(status)) {
        setRebuilding(false);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        if (status === "success") {
          load();
        } else if (status === "timeout") {
          setRebuildError("Пересборка прервана по таймауту");
        } else if (status === "failed") {
          setRebuildError(String(r.data?.error || "Пересборка завершилась с ошибкой"));
        }
      }
    };
    tick();
    pollRef.current = setInterval(tick, STATUS_POLL_INTERVAL_MS);
  }, [load]);

  const rebuild = useCallback(async () => {
    setRebuilding(true);
    setRebuildError("");
    const r = await apiAdminGraphsRebuild();
    if (!mountedRef.current) return r;
    if (!r.ok) {
      setRebuilding(false);
      setRebuildError(String(r.error || "Не удалось запустить пересборку"));
      return r;
    }
    const jobId = String(r.data?.job_id || "").trim();
    if (jobId) {
      setActiveJobId(jobId);
      setActiveStatus({ job_id: jobId, status: "pending", log: [] });
      pollStatus(jobId);
    } else {
      setRebuilding(false);
    }
    return r;
  }, [pollStatus]);

  return {
    data,
    loading,
    error,
    reload: load,
    rebuilding,
    rebuildError,
    activeJobId,
    activeStatus,
    rebuild,
  };
}
