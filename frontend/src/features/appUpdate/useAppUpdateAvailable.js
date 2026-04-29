import { useCallback, useEffect, useRef, useState } from "react";

import { appVersionInfo } from "../../config/appVersion.js";
import { apiMeta } from "../../lib/api.js";
import {
  APP_UPDATE_POLL_INTERVAL_MS,
  getRuntimeDismissId,
  normalizeRuntimeMeta,
  reloadPage,
  setDismissedRuntimeId,
  shouldShowUpdateBanner,
} from "./appUpdateModel.js";

const CURRENT_APP_VERSION = String(import.meta?.env?.VITE_APP_VERSION || appVersionInfo.currentVersion || "").trim();
const CURRENT_BUILD_ID = String(import.meta?.env?.VITE_BUILD_ID || "").trim();

function isDocumentHidden() {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden";
}

export default function useAppUpdateAvailable() {
  const inFlightRef = useRef(false);
  const [availableRuntime, setAvailableRuntime] = useState(null);

  const checkForUpdate = useCallback(async (reason = "manual") => {
    if (reason === "interval" && isDocumentHidden()) return false;
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    try {
      const res = await apiMeta();
      if (!res?.ok) {
        setAvailableRuntime(null);
        return false;
      }
      const runtime = normalizeRuntimeMeta(res.meta);
      if (shouldShowUpdateBanner({
        currentVersion: CURRENT_APP_VERSION,
        currentBuildId: CURRENT_BUILD_ID,
        runtime,
      })) {
        setAvailableRuntime(runtime);
        return true;
      }
      setAvailableRuntime(null);
      return false;
    } catch {
      setAvailableRuntime(null);
      return false;
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void checkForUpdate("boot");
    const intervalId = window.setInterval(() => {
      void checkForUpdate("interval");
    }, APP_UPDATE_POLL_INTERVAL_MS);

    function onFocus() {
      void checkForUpdate("focus");
    }

    function onVisibilityChange() {
      if (!isDocumentHidden()) {
        void checkForUpdate("visibility");
      }
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkForUpdate]);

  const dismiss = useCallback(() => {
    const runtimeId = getRuntimeDismissId(availableRuntime);
    setDismissedRuntimeId(runtimeId);
    setAvailableRuntime(null);
  }, [availableRuntime]);

  const refresh = useCallback(() => {
    reloadPage(window);
  }, []);

  return {
    visible: !!availableRuntime,
    runtime: availableRuntime,
    dismiss,
    refresh,
    checkForUpdate,
  };
}
