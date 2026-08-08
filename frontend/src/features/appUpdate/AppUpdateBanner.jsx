import { useEffect, useRef } from "react";
import { ru } from "../../shared/i18n/ru.js";
import appUpdateIconRaw from "../../assets/icons/app-update.svg?raw";
import "./appUpdateToast.css";

// UX-UPDATE — тост «Вышло обновление ProcessMap» (документ владельца):
// НЕ модалка, fixed внизу, один раз на SHA за сессию; [Обновить] / [Позже]
// (snooze 30 мин); role="status" + aria-live="polite"; клавиатура (фокус на
// тост при появлении, кнопки нативные); transform 200ms, prefers-reduced-motion.
const t = ru.app_update;

export default function AppUpdateBanner({
  visible = false,
  runtime = null,
  refreshRisk = null,
  refreshBusy = false,
  refreshError = "",
  onRefresh,
  onDismiss,
}) {
  const toastRef = useRef(null);

  useEffect(() => {
    if (visible) toastRef.current?.focus();
  }, [visible]);

  if (!visible) return null;
  const sha = String(runtime?.sha || "").trim();
  const riskStatus = String(refreshRisk?.status || "clean").trim().toLowerCase();
  const needsSafeSave = riskStatus === "dirty";
  const isSaving = riskStatus === "saving";
  const isBlocked = riskStatus === "conflict" || riskStatus === "failed" || riskStatus === "stale" || riskStatus === "unknown";
  const title = needsSafeSave ? t.titleDirty : t.title;
  const description = isSaving
    ? t.descriptionSaving
    : `${t.description}${sha ? ` (${sha})` : ""}`;
  const actionLabel = refreshBusy
    ? t.refreshBusy
    : (needsSafeSave ? t.refreshDirty : t.refresh);
  const actionDisabled = refreshBusy || isSaving || isBlocked;
  const errorText = String(
    refreshError
      || (isBlocked ? refreshRisk?.message : "")
      || "",
  ).trim();

  return (
    <div
      ref={toastRef}
      className="appUpdateToast"
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
