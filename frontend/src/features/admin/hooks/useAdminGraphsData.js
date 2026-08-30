import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiAdminGraphsGetAnalytics,
  apiAdminGraphsGetCurrentSnapshot,
  apiAdminGraphsGetRebuildStatus,
  apiAdminGraphsListSnapshots,
  apiAdminGraphsRebuild,
  apiAdminGraphsUploadSnapshot,
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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
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

    // 404 from current/analytics means "no snapshot yet" — this is a normal
    // empty state, not an error. Only snapshots list failure or 5xx is real error.
    const currentMissing = !currentR.ok && currentR.status === 404;
    const analyticsMissing = !analyticsR.ok && analyticsR.status === 404;

    const hasRealError = !snapshotsR.ok || (!currentR.ok && !currentMissing) || (!analyticsR.ok && !analyticsMissing);

    if (!hasRealError) {
      setData({
        snapshots: snapshotsR.items || [],
        current: currentMissing ? null : (currentR.data || null),
        analytics: analyticsMissing ? null : (analyticsR.data || null),
      });
    } else {
      const firstError = [snapshotsR, currentR, analyticsR].find((r) => !r.ok && r.status !== 404);
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

  const uploadSnapshot = useCallback(async (formData) => {
    setUploading(true);
    setUploadError("");
    setUploadSuccess(false);
    const r = await apiAdminGraphsUploadSnapshot(formData);
    if (!mountedRef.current) return r;
    if (!r.ok) {
      setUploading(false);
      setUploadError(String(r.error || "Не удалось загрузить снапшот"));
      return r;
    }
    setUploadSuccess(true);
    setUploading(false);
    await load();
    return r;
  }, [load]);

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
    uploading,
    uploadError,
    uploadSuccess,
    uploadSnapshot,
  };
}
