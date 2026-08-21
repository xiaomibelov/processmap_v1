import React from "react";

function toText(value) {
  return String(value || "").trim();
}

export default function HybridContextMenu({
  menu,
  selectionCount,
  canRename,
  onClose,
  onDelete,
  onRename,
  onHide,
  onLock,
}) {
  if (!menu) return null;
  return (
    <div
      className="diagramActionPopover"
      style={{
        position: "fixed",
        left: `${Math.round(Number(menu.clientX || 0))}px`,
        top: `${Math.round(Number(menu.clientY || 0))}px`,
        zIndex: 40,
        minWidth: "168px",
      }}
      data-testid="hybrid-context-menu"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="diagramActionPopoverHead">
        <span>Hybrid</span>
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
          <span>Выбрано</span>
          <span className="diagramIssueChip">
            {selectionCount > 1 ? `${selectionCount} шт.` : (toText(menu.targetId) || "—")}
          </span>
        </div>
      </div>
      <div className="diagramActionPopoverActions mt-2">
        <button
          type="button"
          className="secondaryBtn h-7 px-2 text-[11px]"
          onClick={onDelete}
          disabled={selectionCount <= 0}
          data-testid="hybrid-context-delete"
        >
          Удалить
        </button>
        <button
          type="button"
          className="secondaryBtn h-7 px-2 text-[11px]"
          onClick={onRename}
          disabled={!canRename}
          data-testid="hybrid-context-rename"
        >
          Переименовать
        </button>
        <button
          type="button"
          className="secondaryBtn h-7 px-2 text-[11px]"
          onClick={onHide}
          disabled={selectionCount <= 0}
          data-testid="hybrid-context-hide"
        >
          Скрыть
        </button>
        <button
          type="button"
          className="secondaryBtn h-7 px-2 text-[11px]"
          onClick={onLock}
          disabled={selectionCount <= 0}
          data-testid="hybrid-context-lock"
        >
          Заблокировать
        </button>
      </div>
    </div>
  );
}
