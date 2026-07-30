// WS1.2 — умная панель параметров рабочего места: режимы dock (закреплена
// справа) / float (перетаскиваемая), позиция/режим в localStorage.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import "./WorkspacePanel.css";

const LS_KEY = "fpc_ws1_panel";

function loadState() {
  try {
    const raw = window.localStorage?.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch { /* ignore */ }
  return { mode: "dock", x: 80, y: 90 };
}

export default function WorkspacePanel({ title, tabs, activeTab, onTabChange, children }) {
  const [state, setState] = useState(loadState);

  useEffect(() => {
    try { window.localStorage?.setItem(LS_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);

  const toggleMode = useCallback(() => {
    setState((prev) => ({ ...prev, mode: prev.mode === "dock" ? "float" : "dock" }));
  }, []);

  const onHeaderPointerDown = useCallback((e) => {
    if (state.mode !== "float") return;
    const startX = e.clientX;
    const startY = e.clientY;
    const initX = state.x;
    const initY = state.y;
    let dragging = true;
    const onMove = (ev) => {
      if (!dragging) return;
      setState((prev) => ({
        ...prev,
        x: Math.max(0, initX + (ev.clientX - startX)),
        y: Math.max(0, initY + (ev.clientY - startY)),
      }));
    };
    const onUp = () => {
      dragging = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [state.mode, state.x, state.y]);

  const style = state.mode === "float" ? { left: state.x, top: state.y } : undefined;

  return (
    <aside
      className={`ws-panel ws-panel--${state.mode}`}
      style={style}
      data-testid="workspace-panel"
      data-mode={state.mode}
    >
      <header className="ws-panel__head" data-testid="panel-drag-handle" onPointerDown={onHeaderPointerDown}>
        <span className="ws-panel__title">{title || t("ws.panel")}</span>
        <button
          type="button"
          className="ws-panel__mode"
          data-testid="panel-mode-toggle"
          title={state.mode === "dock" ? t("ws.panelUndock") : t("ws.panelDock")}
          onClick={toggleMode}
        >
          {state.mode === "dock" ? "⇱" : "⇲"}
        </button>
      </header>
      {tabs && tabs.length > 0 ? (
        <div className="ws-panel__tabs" data-testid="panel-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`ws-panel__tab${activeTab === tab.id ? " ws-panel__tab--active" : ""}`}
              data-testid={`panel-tab-${tab.id}`}
              onClick={() => onTabChange?.(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="ws-panel__body">{children}</div>
    </aside>
  );
}
