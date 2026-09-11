import { useEffect, useMemo, useState } from "react";
import Modal from "../../../shared/ui/Modal";
import { apiGetDeploymentNotice } from "../../../lib/apiModules/adminApi";
import {
  NOTICE_POLL_INTERVAL_MS,
  createNoticePollingSchedule,
} from "../deploymentNoticePolling";

const HIDDEN_KEY_PREFIX = "deployment_notice_hidden:";

function formatCountdown(seconds) {
  if (seconds <= 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

function isHidden(noticeId) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${HIDDEN_KEY_PREFIX}${noticeId}`) === "1";
  } catch {
    return false;
  }
}

function markHidden(noticeId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${HIDDEN_KEY_PREFIX}${noticeId}`, "1");
  } catch {
    // ignore
  }
}

export default function DeploymentNoticeModal() {
  const [notice, setNotice] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState(null);

  const fetchNotice = async () => {
    try {
      setError(null);
      const res = await apiGetDeploymentNotice();
      if (!res.ok) {
        setError(res.error || "fetch_failed");
        setNotice(null);
        return false;
      }
      const data = res.data && typeof res.data === "object" ? res.data : null;
      if (data?.id && isHidden(data.id)) {
        setNotice(null);
        return true;
      }
      setNotice(data);
      return true;
    } catch (e) {
      setError(e?.message || "fetch_failed");
      setNotice(null);
      return false;
    }
  };

  useEffect(() => {
    const schedule = createNoticePollingSchedule({ intervalMs: NOTICE_POLL_INTERVAL_MS });
    let cancelled = false;
    let pollTimer = null;
    let inFlight = false;

    const scheduleNextTick = () => {
      if (cancelled) return;
      pollTimer = setTimeout(() => {
        pollTimer = null;
        void runTick();
      }, schedule.nextDelayMs());
    };

    const runTick = async () => {
      if (cancelled) return;
      if (schedule.shouldSkipHiddenTick(document.hidden) || inFlight) {
        scheduleNextTick();
        return;
      }
      inFlight = true;
      let ok = false;
      try {
        ok = await fetchNotice();
      } finally {
        inFlight = false;
      }
      if (cancelled) return;
      if (ok) {
        schedule.noteSuccess();
      } else {
        schedule.noteFailure();
      }
      scheduleNextTick();
    };

    const runImmediateCheck = () => {
      if (cancelled || document.hidden || inFlight) return;
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      void runTick();
    };

    void runTick();
    document.addEventListener("visibilitychange", runImmediateCheck);
    window.addEventListener("focus", runImmediateCheck);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", runImmediateCheck);
      window.removeEventListener("focus", runImmediateCheck);
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const expiresAt = useMemo(() => {
    if (!notice) return 0;
    const durationMin = Number(notice.display_duration_minutes || 0);
    const scheduledMs = Number(notice.scheduled_at || 0) * 1000;
    if (durationMin <= 0) return 0;
    return scheduledMs + durationMin * 60_000;
  }, [notice]);

  const remainingSeconds = useMemo(() => {
    if (!notice) return 0;
    if (expiresAt > 0) {
      return Math.max(0, Math.ceil((expiresAt - now) / 1000));
    }
    return 0;
  }, [notice, expiresAt, now]);

  const isExpired = useMemo(() => {
    if (!notice) return true;
    if (expiresAt > 0 && now >= expiresAt) return true;
    return false;
  }, [notice, expiresAt, now]);

  const handleClose = () => {
    if (notice?.id) markHidden(notice.id);
    setNotice(null);
  };

  if (!notice || isExpired) return null;

  return (
    <Modal
      open
      title="Внимание"
      onClose={handleClose}
      cardClassName="deploymentNoticeModalCard"
      overlayClassName="deploymentNoticeModalOverlay"
      footer={(
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            {expiresAt > 0 ? `До завершения: ${formatCountdown(remainingSeconds)}` : "Бессрочное уведомление"}
          </span>
          <button type="button" className="primaryBtn" onClick={handleClose}>
            Понятно
          </button>
        </div>
      )}
    >
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
        {notice.message || "Запланированное техническое уведомление."}
      </div>
      {error ? <div className="mt-3 text-xs text-rose-400">{error}</div> : null}
    </Modal>
  );
}
