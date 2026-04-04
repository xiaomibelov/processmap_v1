import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import resolveContextMenuModalPortalRoot from "./modal/resolveContextMenuModalPortalRoot";

function toText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function DetailLines({
  title,
  lines,
}) {
  const rows = asArray(lines).map((line) => toText(line)).filter(Boolean);
  if (!rows.length) return null;
  return (
    <div className="mt-1.5">
      <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</div>
      <div className="space-y-0.5 text-[10px] text-muted">
        {rows.map((line) => (
          <div key={`${title}_${line}`} className="rounded border border-border/45 bg-panel2/45 px-1.5 py-1">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BpmnSubprocessPreviewModal({
  preview,
  onClose,
  onOpenProperties,
}) {
  const [portalRoot, setPortalRoot] = useState(null);

  useEffect(() => {
    setPortalRoot(resolveContextMenuModalPortalRoot());
  }, []);

  useEffect(() => {
    if (!preview || typeof preview !== "object") return undefined;
    const onKeyDown = (event) => {
      if (String(event?.key || "") !== "Escape") return;
      event.preventDefault();
      onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, preview]);

  const content = useMemo(() => {
    if (!preview || typeof preview !== "object") return null;
    const items = asArray(preview?.items);
    const summary = preview?.summary && typeof preview.summary === "object" ? preview.summary : {};

    return (
      <div
        className="fixed inset-0 z-[180] bg-black/45 p-4 backdrop-blur-[1px]"
        data-testid="bpmn-open-inside-preview-modal"
        onMouseDown={(event) => {
          event.stopPropagation();
          if (event.target === event.currentTarget) {
            onClose?.();
          }
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="mx-auto mt-[7vh] w-full max-w-[640px] rounded-xl border border-border bg-panel p-3 shadow-panel"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-fg" data-testid="bpmn-open-inside-preview-title">
                {toText(preview?.title) || "Подпроцесс"}
              </div>
              <div className="text-[11px] text-muted" data-testid="bpmn-open-inside-preview-kind">
                {toText(preview?.kindLabel) || "Подпроцесс"}
              </div>
            </div>
            <button
              type="button"
              className="secondaryBtn h-6 px-1.5 text-[10px]"
              onClick={() => onClose?.()}
              data-testid="bpmn-open-inside-preview-close"
            >
              Закрыть
            </button>
          </div>

          <div className="mb-2 rounded-md border border-border/70 bg-panel2/35 p-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Краткая информация</div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <div className="rounded border border-border/60 bg-panel px-2 py-1">Внутренний ID: <span className="text-fg">{toText(preview?.internalId) || "-"}</span></div>
              <div className="rounded border border-border/60 bg-panel px-2 py-1">Количество шагов: <span className="text-fg">{Number(summary?.stepCount || 0)}</span></div>
              <div className="rounded border border-border/60 bg-panel px-2 py-1">Количество переходов: <span className="text-fg">{Number(summary?.transitionCount || 0)}</span></div>
              <div className="rounded border border-border/60 bg-panel px-2 py-1">Есть старт: <span className="text-fg">{summary?.hasStart ? "Да" : "Нет"}</span></div>
              <div className="rounded border border-border/60 bg-panel px-2 py-1">Есть завершение: <span className="text-fg">{summary?.hasEnd ? "Да" : "Нет"}</span></div>
              <div className="rounded border border-border/60 bg-panel px-2 py-1">Есть шлюзы: <span className="text-fg">{summary?.hasGateway ? "Да" : "Нет"}</span></div>
            </div>
          </div>

          <div className="mb-2 rounded-md border border-border/70 bg-panel2/35 p-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Содержимое</div>
            {items.length > 0 ? (
              <div className="max-h-[320px] space-y-1.5 overflow-auto pr-1">
                {items.map((item) => (
                  <div
                    key={`inside_item_${toText(item?.id)}_${Number(item?.order)}`}
                    className="rounded border border-border/60 bg-panel px-2 py-1.5 text-[11px]"
                    data-testid="bpmn-open-inside-item"
                  >
                    <div>
                      <span className="font-semibold text-fg">{Number(item?.order)}. {toText(item?.name) || "Без названия"}</span>
                      <span className="ml-1 text-muted">— {toText(item?.typeLabel) || "Элемент"}</span>
                    </div>
                    <DetailLines title="BPMN атрибуты" lines={item?.keyBpmnAttrs} />
                    <DetailLines title="Параметры выполнения" lines={item?.executionAttrs} />
                    <DetailLines title="Робот-мета" lines={item?.robotMeta} />
                    <DetailLines title="Пользовательские свойства" lines={item?.customProperties} />
                    <DetailLines title="Свойства расширений" lines={item?.extensionProperties} />
                    <DetailLines title="Таймеры и слушатели" lines={item?.timerAndListeners} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded border border-dashed border-border px-2 py-2 text-[11px] text-muted">
                Внутри пока нет элементов
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              className="secondaryBtn h-6 px-1.5 text-[10px]"
              onClick={() => onOpenProperties?.()}
              data-testid="bpmn-open-inside-preview-open-properties"
            >
              Открыть полные свойства
            </button>
            <button
              type="button"
              className="secondaryBtn h-6 px-1.5 text-[10px]"
              onClick={() => onClose?.()}
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    );
  }, [onClose, onOpenProperties, preview]);

  if (!content) return null;
  if (!portalRoot) return content;
  return createPortal(content, portalRoot);
}
