import React from "react";

function toText(value) {
  return String(value || "").trim();
}

const TOOL_ROWS = [
  { id: "select", icon: "⌖", label: "Выбор", hint: "1" },
  { id: "rect", icon: "▭", label: "Прямоугольник", hint: "2" },
  { id: "text", icon: "T", label: "Текст", hint: "3" },
  { id: "container", icon: "▣", label: "Контейнер", hint: "4" },
];

export default function HybridToolsPalette({
  open,
  popoverRef,
  state,
  drawioState,
  onToggleVisible,
  onSetTool,
  onSetMode,
  onOpenDrawioEditor,
  onToggleDrawioVisible,
  onSetDrawioOpacity,
  onToggleDrawioLock,
  onImportDrawio,
  onExportDrawio,
  onClose,
}) {
  if (!open) return null;
  const visible = !!state?.visible;
  const mode = toText(state?.mode || "view").toLowerCase() === "edit" ? "edit" : "view";
  const tool = toText(state?.tool || "select").toLowerCase() || "select";
  const drawioEnabled = !!drawioState?.enabled;
  const drawioLocked = !!drawioState?.locked;
  const drawioOpacity = Math.max(0.05, Math.min(1, Number(drawioState?.opacity || 1)));
  const hasDrawioDoc = toText(drawioState?.doc_xml).length > 0;
  const hasDrawioPreview = toText(drawioState?.svg_cache).length > 0;
  return (
    <div
      className="diagramActionPopover min-w-[260px]"
      ref={popoverRef}
      data-testid="diagram-action-hybrid-tools-popover"
    >
      <div className="diagramActionPopoverHead">
        <span>Инструменты Draw.io</span>
        <button
          type="button"
          className="secondaryBtn h-7 px-2 text-[11px]"
          onClick={onClose}
        >
          Закрыть
        </button>
      </div>
      <div className="diagramIssueRows">
        <div className="diagramIssueRow">
          <span>Полный Draw.io</span>
          <div className="diagramActionPopoverActions mt-0">
            <button
              type="button"
              className={`secondaryBtn h-7 px-2 text-[11px] ${drawioEnabled ? "ring-1 ring-accent/60" : ""}`}
              onClick={() => onToggleDrawioVisible?.()}
              data-testid="diagram-action-drawio-enabled"
            >
              {drawioEnabled ? "Показать" : "Скрыт"}
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => onOpenDrawioEditor?.()}
              disabled={drawioLocked}
              data-testid="diagram-action-drawio-open-editor"
            >
              Редактор
            </button>
          </div>
        </div>
        <div className="diagramIssueRow">
          <span>Overlay</span>
          <span className="diagramIssueChip">{hasDrawioPreview ? "preview ready" : (hasDrawioDoc ? "save нужен" : "empty")}</span>
        </div>
        <div className="diagramIssueRow">
          <span>Opacity</span>
          <input
            className="accent-accent"
            type="range"
            min="5"
            max="100"
            step="5"
            value={Math.round(drawioOpacity * 100)}
            onChange={(event) => onSetDrawioOpacity?.(Number(event.target.value) / 100)}
            data-testid="diagram-action-drawio-opacity"
          />
        </div>
        <div className="diagramIssueRow">
          <span>Lock</span>
          <div className="diagramActionPopoverActions mt-0">
            <button
              type="button"
              className={`secondaryBtn h-7 px-2 text-[11px] ${drawioLocked ? "ring-1 ring-accent/60" : ""}`}
              onClick={() => onToggleDrawioLock?.()}
              data-testid="diagram-action-drawio-lock"
            >
              {drawioLocked ? "Locked" : "Unlocked"}
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => onImportDrawio?.()}
              disabled={drawioLocked}
              data-testid="diagram-action-drawio-import"
            >
              Импорт
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => onExportDrawio?.()}
              disabled={!hasDrawioDoc}
              data-testid="diagram-action-drawio-export"
            >
              Экспорт
            </button>
          </div>
        </div>
        <div className="diagramIssueRow">
          <span>Слой</span>
          <div className="diagramActionPopoverActions mt-0">
            <button
              type="button"
              className={`secondaryBtn h-7 px-2 text-[11px] ${visible ? "ring-1 ring-accent/60" : ""}`}
              onClick={() => onToggleVisible?.()}
              data-active={visible ? "true" : "false"}
              data-testid="diagram-action-hybrid-tools-visible"
            >
              {visible ? "Вкл" : "Выкл"}
            </button>
          </div>
        </div>
        <div className="diagramIssueRow">
          <span>Режим</span>
          <div className="diagramActionPopoverActions mt-0">
            {[
              { id: "view", label: "Просмотр" },
              { id: "edit", label: "Редактирование" },
            ].map((row) => (
              <button
                key={`hybrid_tools_mode_${row.id}`}
                type="button"
                className={`secondaryBtn h-7 px-2 text-[11px] ${mode === row.id ? "ring-1 ring-accent/60" : ""}`}
                onClick={() => onSetMode?.(row.id)}
                data-active={mode === row.id ? "true" : "false"}
                data-testid={`diagram-action-hybrid-tools-mode-${row.id}`}
              >
                {row.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2" data-testid="diagram-action-hybrid-tools-grid">
        {TOOL_ROWS.map((row) => {
          const active = tool === row.id;
          return (
            <button
              key={`hybrid_tools_palette_${row.id}`}
              type="button"
              className={`secondaryBtn flex min-h-[64px] flex-col items-start justify-between rounded-xl px-3 py-2 text-left text-[11px] ${active ? "ring-1 ring-accent/60 bg-accentSoft/60" : ""}`}
              onClick={() => onSetTool?.(row.id)}
              data-active={active ? "true" : "false"}
              data-testid={`diagram-action-hybrid-tools-tool-${row.id}`}
            >
              <span className="text-lg leading-none" aria-hidden="true">{row.icon}</span>
              <span className="font-medium">{row.label}</span>
              <span className="muted text-[10px]">Клавиша {row.hint}</span>
            </button>
          );
        })}
      </div>
      <div className="muted mt-2 text-[10px]" data-testid="diagram-action-hybrid-tools-hints">
        1 Выбор, 2 Прямоугольник, 3 Текст, 4 Контейнер, Esc Просмотр
      </div>
    </div>
  );
}
