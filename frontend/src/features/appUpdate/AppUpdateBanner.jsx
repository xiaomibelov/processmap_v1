import { useEffect, useRef, useState } from "react";
import { ru } from "../../shared/i18n/ru.js";
import appUpdateIconRaw from "../../assets/icons/app-update.svg?raw";
import "./appUpdateToast.css";

// UX-UPDATE — тост «Вышло обновление ProcessMap» (документ владельца):
// НЕ модалка, fixed внизу, один раз на SHA за сессию; [Обновить] / [Позже]
// (snooze 30 мин); role="status" + aria-live="polite"; клавиатура (фокус на
// тост при появлении, кнопки нативные); transform 200ms, prefers-reduced-motion.
// A/B (fix/app-update-refresh-dead-end): blocked-состояние (conflict/failed/
// stale/unknown) → danger-модификатор, человекочитаемая причина, [Обновить]
// остаётся доступной для retry и добавляется двухшаговая [Обновить без
// сохранения] (armed → confirm) → onForceRefresh.
const t = ru.app_update;

const BLOCKED_REASON_BY_STATUS = {
  conflict: () => t.blockedReasonConflict,
  failed: () => t.blockedReasonFailed,
  stale: () => t.blockedReasonStale,
  unknown: () => t.blockedReasonUnknown,
};

export default function AppUpdateBanner({
  visible = false,
  runtime = null,
  refreshRisk = null,
  refreshBusy = false,
  refreshError = "",
  onRefresh,
  onDismiss,
  onForceRefresh,
}) {
  const toastRef = useRef(null);
  const [forceArmed, setForceArmed] = useState(false);

  useEffect(() => {
    if (visible) toastRef.current?.focus();
  }, [visible]);

  // Смена состояния/скрытие тоста сбрасывает armed-подтверждение force-пути:
  // подтверждение должно быть осознанным именно в текущем контексте.
  useEffect(() => {
    setForceArmed(false);
  }, [visible, String(refreshRisk?.status || "").trim().toLowerCase(), refreshBusy]);

  if (!visible) return null;
  const sha = String(runtime?.sha || "").trim();
  const riskStatus = String(refreshRisk?.status || "clean").trim().toLowerCase();
  const needsSafeSave = riskStatus === "dirty";
  const isSaving = riskStatus === "saving";
  const isBlocked = riskStatus === "conflict" || riskStatus === "failed" || riskStatus === "stale" || riskStatus === "unknown";
  const title = isBlocked ? t.titleBlocked : (needsSafeSave ? t.titleDirty : t.title);
  const blockedReason = isBlocked
    ? String((BLOCKED_REASON_BY_STATUS[riskStatus]?.() || refreshRisk?.message || "") || "").trim()
    : "";
  const description = isSaving
    ? t.descriptionSaving
    : `${t.description}${sha ? ` (${sha})` : ""}`;
  const actionLabel = refreshBusy
    ? t.refreshBusy
    : (needsSafeSave ? t.refreshDirty : t.refresh);
  // A/B: blocked НЕ дизейблит retry — пользователь может повторить попытку
  // (состояние могло разрешиться). Дизейбл только при активной работе.
  const actionDisabled = refreshBusy || isSaving;
  const errorText = String(
    refreshError
      || (isBlocked ? refreshRisk?.message : "")
      || "",
  ).trim();
  const showForce = isBlocked && !refreshBusy && !isSaving;

  const handleForceClick = () => {
    if (typeof onForceRefresh !== "function") return;
    if (!forceArmed) {
      setForceArmed(true);
      return;
    }
    setForceArmed(false);
    onForceRefresh();
  };

  return (
    <div
      ref={toastRef}
      className={isBlocked ? "appUpdateToast appUpdateToast--danger" : "appUpdateToast"}
      data-testid="app-update-toast"
      role="status"
      aria-live="polite"
      tabIndex={-1}
    >
      <span
        className="appUpdateToast__icon"
        aria-label={t.iconAria}
        // SVG из assets/icons/app-update.svg (currentColor), статичный файл проекта
        dangerouslySetInnerHTML={{ __html: appUpdateIconRaw }}
      />
      <div className="appUpdateToast__text">
        <div className="appUpdateToast__title">{title}</div>
        <div className="appUpdateToast__description">{description}</div>
        {blockedReason ? (
          <div className="appUpdateToast__reason" data-testid="app-update-reason">{blockedReason}</div>
        ) : null}
        {errorText ? (
          <div className="appUpdateToast__error" data-testid="app-update-error">{errorText}</div>
        ) : null}
      </div>
      <div className="appUpdateToast__actions">
        <button
          type="button"
          className="appUpdateToast__btn appUpdateToast__btn--primary"
          data-testid="app-update-refresh"
          onClick={onRefresh}
          disabled={actionDisabled}
        >
          {actionLabel}
        </button>
        {showForce ? (
          <button
            type="button"
            className={forceArmed
              ? "appUpdateToast__btn appUpdateToast__btn--danger appUpdateToast__btn--armed"
              : "appUpdateToast__btn appUpdateToast__btn--danger"}
            data-testid="app-update-force"
            data-armed={forceArmed ? "true" : undefined}
            title={t.forceRefreshTitle}
            onClick={handleForceClick}
          >
            {forceArmed ? t.forceConfirm : t.forceRefresh}
          </button>
        ) : null}
        <button
          type="button"
          className="appUpdateToast__btn"
          data-testid="app-update-dismiss"
          title={t.laterTitle}
          onClick={onDismiss}
        >
          {t.later}
        </button>
      </div>
    </div>
  );
}
