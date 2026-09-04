import { useCallback, useEffect, useRef, useState } from "react";

import { buildInfo } from "../../config/buildInfo.js";
import {
  getCurrentAppRefreshRisk,
  runSafeRefreshBeforeReload,
  subscribeAppSafeRefresh,
} from "./appSafeRefreshController.js";
import {
  APP_UPDATE_AUTO_RELOAD_DELAY_MS,
  APP_UPDATE_POLL_INTERVAL_MS,
  APP_UPDATE_VERSION_URL,
  getCurrentBuildSha,
  hasAutoReloadedForSha,
  markAutoReloadedForSha,
  normalizeVersionJson,
  hardReloadPage,
  setUpdateSnooze,
  shouldShowUpdateToast,
} from "./appUpdateModel.js";

// UX-UPDATE (документ владельца): поллинг GET /version.json (cache:'no-store')
// 5 мин + visibilitychange→visible; ошибки молча. SHA ≠ SHA бандла → тост
// (не модалка), один раз на SHA за сессию; [Обновить] → guard (грязная TO BE
// → requestTobeExit) → safe-flush → reload; [Позже] = snooze 30 мин.
// Принудительного reload НЕТ нигде.
const CURRENT_BUILD_SHA = getCurrentBuildSha({ VITE_BUILD_ID: buildInfo.buildId });

function isDocumentHidden() {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden";
}

export default function useAppUpdateAvailable({ refreshGuard = null } = {}) {
  const inFlightRef = useRef(false);
  const [availableRuntime, setAvailableRuntime] = useState(null);
  const [refreshRisk, setRefreshRisk] = useState(() => getCurrentAppRefreshRisk());
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  const checkForUpdate = useCallback(async (reason = "manual") => {
    if (reason === "interval" && isDocumentHidden()) return false;
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    try {
      const res = await fetch(`${APP_UPDATE_VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) {
        setAvailableRuntime(null);
        return false;
      }
      const runtime = normalizeVersionJson(await res.json().catch(() => null));
      if (shouldShowUpdateToast({ currentSha: CURRENT_BUILD_SHA, remoteSha: runtime?.sha })) {
        setAvailableRuntime(runtime);
        return true;
      }
      setAvailableRuntime(null);
      return false;
    } catch {
      // ошибки — молча (офлайн/старый nginx без version.json): тост не показываем
      setAvailableRuntime(null);
      return false;
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const syncRefreshRisk = () => {
      setRefreshRisk(getCurrentAppRefreshRisk());
    };
    syncRefreshRisk();
    return subscribeAppSafeRefresh(syncRefreshRisk);
  }, []);

  useEffect(() => {
    void checkForUpdate("boot");
    const intervalId = window.setInterval(() => {
      void checkForUpdate("interval");
    }, APP_UPDATE_POLL_INTERVAL_MS);

    function onVisibilityChange() {
      if (!isDocumentHidden()) {
        void checkForUpdate("visibility");
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkForUpdate]);

  // Авто-reload в «чистом» состоянии: один раз за сессию на remote SHA.
  // Если есть несохранённые изменения — оставляем ручной [Обновить] с guard.
  useEffect(() => {
    if (!availableRuntime?.sha) return undefined;
    if (refreshRisk?.status !== "clean") return undefined;
    const remoteSha = availableRuntime.sha;
    if (hasAutoReloadedForSha(remoteSha)) return undefined;
    const timer = window.setTimeout(() => {
      markAutoReloadedForSha(remoteSha);
      void hardReloadPage(window);
    }, APP_UPDATE_AUTO_RELOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [availableRuntime, refreshRisk]);

  // [Позже] = snooze 30 мин для текущего sha (новая семантика, не постоянный dismiss)
  const dismiss = useCallback(() => {
    if (availableRuntime?.sha) setUpdateSnooze(availableRuntime.sha);
    setAvailableRuntime(null);
    setRefreshError("");
  }, [availableRuntime]);

  const refresh = useCallback(async () => {
    if (refreshBusy) return { ok: false, status: "busy" };
    setRefreshBusy(true);
    setRefreshError("");
    try {
      // guard грязной TO BE: существующий requestTobeExit (#672), НЕ дублируем —
      // показывает «Сохранить перед обновлением?»; отмена → reload НЕ выполняется
      if (typeof refreshGuard === "function") {
        const guarded = await refreshGuard();
        if (guarded?.ok !== true) return guarded || { ok: false, status: "cancelled" };
      }
      const result = await runSafeRefreshBeforeReload({ reason: "app_update_refresh" });
      if (result?.ok === true) {
        void hardReloadPage(window);
        return result;
      }
      const message = String(
        result?.message
          || "Не удалось безопасно обновить приложение: есть несохранённые изменения или конфликт сохранения.",
      ).trim();
      setRefreshError(message);
      setRefreshRisk(getCurrentAppRefreshRisk());
      return result;
    } finally {
      setRefreshBusy(false);
    }
  }, [refreshBusy, refreshGuard]);

  const refreshViewRisk = visibleRuntimeRisk(refreshRisk);

  return {
    visible: !!availableRuntime,
    runtime: availableRuntime,
    refreshRisk: refreshViewRisk,
    refreshBusy,
    refreshError,
    dismiss,
    refresh,
    checkForUpdate,
  };
}

function visibleRuntimeRisk(riskRaw = null) {
  const status = String(riskRaw?.status || "clean").trim().toLowerCase();
  if (
    status === "dirty"
    || status === "saving"
    || status === "conflict"
    || status === "failed"
    || status === "stale"
    || status === "unknown"
  ) {
    return riskRaw;
  }
  return { status: "clean", message: "" };
}
