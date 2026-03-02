import { useEffect, useRef, useState } from "react";

async function copyText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }
  return false;
}

export default function SidebarHeader({
  processTitle,
  projectTitle,
  sessionTitle,
  projectId,
  sessionId,
  selectedNodeId,
  aiBadgeCount,
  notesBadgeCount,
  actorsBadgeCount,
  tierLabel,
  onProjectBreadcrumbClick,
  onSessionBreadcrumbClick,
  onProcessBreadcrumbClick,
  onRenameProject,
  onDeleteProject,
  onRenameSession,
  onDeleteSession,
  onToggleCollapse,
  onCloseSidebar,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onPointerDown(event) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const onClose = onCloseSidebar || onToggleCollapse;
  const shortId = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.length <= 12) return raw;
    return `${raw.slice(0, 6)}…${raw.slice(-4)}`;
  };

  function IdChip({ label, value, copyTitle = "" }) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    return (
      <span className="sidebarContextChip" title={`${label}: ${raw}`}>
        <span className="sidebarContextChipLabel">{label}</span>
        <span className="sidebarContextChipValue">{shortId(raw)}</span>
        <button
          type="button"
          className="sidebarContextChipCopy"
          title={copyTitle || `Скопировать ${label}`}
          onClick={() => {
            void copyText(raw);
          }}
        >
          ⧉
        </button>
      </span>
    );
  }

  return (
    <div className="sidebarContextHeader sticky top-0 z-20 border-b border-border bg-panel/95 px-3 py-2.5 backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Контекст</div>
        <div className="relative inline-flex items-center gap-1">
          <button
            ref={buttonRef}
            type="button"
            className="sidebarIconBtn"
            title="Действия"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Действия"
            aria-expanded={menuOpen ? "true" : "false"}
          >
            ⋯
          </button>
          {menuOpen ? (
            <div ref={menuRef} className="sidebarHeaderMenu">
              <button type="button" className="sidebarHeaderMenuItem" onClick={() => { setMenuOpen(false); onRenameProject?.(); }}>
                Переименовать проект
              </button>
              <button type="button" className="sidebarHeaderMenuItem isDanger" onClick={() => { setMenuOpen(false); onDeleteProject?.(); }}>
                Удалить проект
              </button>
              <button type="button" className="sidebarHeaderMenuItem" onClick={() => { setMenuOpen(false); onRenameSession?.(); }}>
                Переименовать сессию
              </button>
              <button type="button" className="sidebarHeaderMenuItem isDanger" onClick={() => { setMenuOpen(false); onDeleteSession?.(); }}>
                Удалить сессию
              </button>
              <button
                type="button"
                className="sidebarHeaderMenuItem"
                onClick={() => {
                  setMenuOpen(false);
                  void copyText(sessionId);
                }}
              >
                Копировать session id
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="sidebarIconBtn"
            title="Скрыть панель"
            onClick={() => onClose?.()}
            aria-label="Скрыть панель"
          >
            <span className="font-mono">⟨</span>
          </button>
        </div>
      </div>

      <div className="sidebarBreadcrumbRow">
        <button
          type="button"
          className="sidebarBreadcrumbBtn"
          title={projectTitle || "Проект"}
          onClick={() => onProjectBreadcrumbClick?.()}
        >
          {projectTitle || "Проект"}
        </button>
        <span className="sidebarBreadcrumbSep">/</span>
        <button
          type="button"
          className="sidebarBreadcrumbBtn"
          title={sessionTitle || sessionId || "Сессия"}
          onClick={() => onSessionBreadcrumbClick?.()}
        >
          {sessionTitle || sessionId || "Сессия"}
        </button>
        <span className="sidebarBreadcrumbSep">/</span>
        <button
          type="button"
          className="sidebarBreadcrumbBtn"
          title={processTitle || "Процесс"}
          onClick={() => onProcessBreadcrumbClick?.()}
        >
          {processTitle || "Процесс"}
        </button>
      </div>

      <div className="sidebarContextChips mt-1">
        <IdChip label="PID" value={projectId} copyTitle="Скопировать project id" />
        <IdChip label="SID" value={sessionId} copyTitle="Скопировать session id" />
        <IdChip label="Node" value={selectedNodeId} copyTitle="Скопировать node id" />
        <span className="sidebarBadge">AI {Number(aiBadgeCount || 0)}</span>
        <span className="sidebarBadge">Notes {Number(notesBadgeCount || 0)}</span>
        <span className="sidebarBadge">Actors {Number(actorsBadgeCount || 0)}</span>
        {tierLabel ? <span className="sidebarBadge">Tier {tierLabel}</span> : null}
      </div>
    </div>
  );
}
