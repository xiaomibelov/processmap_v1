import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import BpmnPropertiesOverlayGrid from "./BpmnPropertiesOverlayGrid";

function toText(value) {
  return String(value || "").trim();
}

function resolvePortalRoot() {
  if (typeof document === "undefined") return null;
  return document.body;
}

export default function BpmnPropertiesOverlayModal({
  open = false,
  schema = null,
  draftByRowId = {},
  savingRowId = "",
  error = "",
  onClose,
  onDraftChange,
  onSubmit,
  onCancel,
}) {
  const portalRoot = useMemo(() => resolvePortalRoot(), []);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (String(event?.key || "") !== "Escape") return;
      onClose?.();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open || !portalRoot) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm"
      data-testid="bpmn-properties-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="flex w-[min(620px,94vw)] max-h-[80vh] min-h-[220px] flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b border-border/70 bg-panel2/75 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-fg" data-testid="bpmn-properties-overlay-title">
              {toText(schema?.elementName) || "Элемент BPMN"}
            </div>
            <div className="truncate text-[11px] text-muted" data-testid="bpmn-properties-overlay-type">
              {toText(schema?.bpmnType) || "Тип не определён"}
            </div>
          </div>
          <button
            type="button"
            className="secondaryBtn h-7 px-2 text-[11px]"
            onClick={onClose}
            data-testid="bpmn-properties-overlay-close"
          >
            Закрыть
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
          <BpmnPropertiesOverlayGrid
            schema={schema}
            draftByRowId={draftByRowId}
            savingRowId={savingRowId}
            onDraftChange={onDraftChange}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
          {toText(error) ? (
            <div className="mt-2 rounded-md border border-danger/45 bg-danger/10 px-2 py-1 text-xs text-danger" data-testid="bpmn-properties-overlay-error">
              {toText(error)}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    portalRoot,
  );
}
