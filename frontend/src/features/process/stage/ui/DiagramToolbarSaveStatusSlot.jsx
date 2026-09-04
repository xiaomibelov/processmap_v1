import { buildSaveStatusSlotView } from "./saveStatusSlotModel.js";

const STATE_TONE_CLASS = {
  conflict: "border-danger/40 bg-danger/10 text-danger",
  saving: "border-info/40 bg-info/10 text-info",
  failed: "border-danger/40 bg-danger/10 text-danger",
  stale: "border-warning/40 bg-warning/10 text-warning",
  dirty: "border-warning/40 bg-warning/10 text-warning",
  saved: "border-border/50 bg-panel2/40 text-muted",
};

function StateIcon({ state }) {
  if (state === "saving") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-3 w-3 animate-spin" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-6.2-8.56" />
      </svg>
    );
  }
  if (state === "saved") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/**
 * П3: видимый in-flow слот статуса сохранения в правом слоте хедера
 * (вместо невидимой 1px-метки-якоря). Виден на lg+ (наследует hidden lg:flex
 * у .diagramToolbarRightStatus). Idle — фоновая надпись «Сохранено»;
 * краткий success save-ack — индикация с иконкой (flash) вместо floating-тоста.
 */
export default function DiagramToolbarSaveStatusSlot({
  saveUploadStatus = null,
  saveSnapshot = null,
  flash = null,
} = {}) {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: saveUploadStatus,
    saveSnapshotRaw: saveSnapshot,
    flashRaw: flash,
  });
  const label = view.flashVisible ? view.flashLabel : view.label;
  if (!label) return null;
  const labelTestId = view.flashVisible || view.state !== "saved"
    ? undefined
    : "diagram-toolbar-save-status-empty";

  return (
    <span
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold leading-none ${STATE_TONE_CLASS[view.state] || STATE_TONE_CLASS.saved}`}
      data-testid="diagram-toolbar-save-status-slot"
      data-state={view.state}
      title={view.title}
    >
      {view.flashVisible || view.state !== "saved" ? (
        <span
          className="grid h-3.5 w-3.5 shrink-0 place-items-center"
          data-testid="diagram-toolbar-save-status-icon"
          aria-hidden="true"
        >
          <StateIcon state={view.state} />
        </span>
      ) : null}
      <span
        className="min-w-0 max-w-[180px] truncate"
        data-testid={labelTestId}
      >
        {label}
      </span>
    </span>
  );
}
