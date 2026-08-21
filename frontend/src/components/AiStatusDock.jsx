import { useEffect, useMemo, useRef, useState } from "react";
import { rerunAiTool, useAiStatus } from "../features/ai/aiExecutor";

function toText(v) {
  return String(v || "").trim();
}

function formatTime(iso) {
  const raw = toText(iso);
  if (!raw) return "—";
  try {
    return new Date(raw).toLocaleTimeString();
  } catch {
    return raw;
  }
}

function statusTitle(status) {
  const key = toText(status).toLowerCase();
  if (key === "running") return "running";
  if (key === "success") return "success";
  if (key === "cached") return "cached";
  if (key === "skipped") return "skipped";
  if (key === "error") return "error";
  return "idle";
}

export default function AiStatusDock() {
  const ai = useAiStatus();
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const [panelPos, setPanelPos] = useState({ top: 74, left: null, right: 16 });

  const items = useMemo(() => Array.isArray(ai?.byTool) ? ai.byTool : [], [ai]);
  const running = Number(ai?.running || 0);
  const hasError = items.some((item) => statusTitle(item?.status) === "error" || statusTitle(item?.status) === "skipped");
  const headline = running > 0 ? `AI RUNNING (${running})` : (hasError ? "AI WARN" : "AI OK");

  useEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const panelW = 420;
    const top = Math.max(56, Math.round(Number(r.bottom || 0) + 8));
    const left = Math.max(8, Math.min(window.innerWidth - panelW - 8, Math.round(Number(r.right || 0) - panelW)));
    setPanelPos({ top, left, right: null });
  }, [open, items.length, running]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const target = event?.target;
      if (!target) return;
      const insideBtn = btnRef.current && btnRef.current.contains(target);
      const insidePanel = panelRef.current && panelRef.current.contains(target);
      if (insideBtn || insidePanel) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  async function handleReplay(toolKey, mode) {
    const key = toText(toolKey);
    if (!key || busyKey) return;
    setBusyKey(key);
    try {
      await rerunAiTool(key, { mode });
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="aiDock">
      <button
        ref={btnRef}
        type="button"
        className={"aiDockBtn " + (running > 0 ? "is-running" : (hasError ? "is-warn" : "is-ok"))}
        aria-haspopup="dialog"
        aria-expanded={open ? "true" : "false"}
        onClick={() => setOpen((x) => !x)}
        title="Статусы AI инструментов"
      >
        <span className={"aiDockDot " + (running > 0 ? "running" : (hasError ? "warn" : "ok"))} />
        <span className="aiDockLabel">{headline}</span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          className="aiDockPanel"
          role="dialog"
          aria-label="AI history"
          style={{
            top: panelPos.top,
            left: panelPos.left ?? undefined,
            right: panelPos.right ?? undefined,
          }}
        >
          <div className="aiDockHead">
            <div className="aiDockTitle">AI инструменты</div>
            <button type="button" className="iconBtn aiDockClose" onClick={() => setOpen(false)} title="Закрыть">
              ✕
            </button>
          </div>

          {!items.length ? (
            <div className="muted small">История запусков пока пуста.</div>
          ) : (
            <div className="aiDockList">
              {items.map((item) => {
                const toolKey = toText(item?.toolKey);
                const status = statusTitle(item?.status);
                const rowBusy = busyKey === toolKey;
                const err = item?.lastError && typeof item.lastError === "object" ? item.lastError : null;
                return (
                  <div className="aiDockItem" key={toolKey || `${item?.toolId || "ai"}_${item?.sessionId || "-"}`}>
                    <div className="aiDockItemHead">
                      <div className="aiDockItemTitle">{toText(item?.label || item?.toolId) || "AI tool"}</div>
                      <span className={"badge aiDockState " + status}>{status}</span>
                    </div>
                    <div className="aiDockMeta small muted">
                      sid: {toText(item?.sessionId) || "—"} · updated: {formatTime(item?.lastFinishedAt || item?.lastStartedAt)}
                    </div>
                    <div className="aiDockMsg small">
                      {toText(item?.lastMessage) || (err?.message ? err.message : "—")}
                      {item?.cached ? " · cached" : ""}
                    </div>
                    {err?.message ? (
                      <div className="aiDockErr small muted">
                        {err.message}
                        {err.retriable ? " · можно повторить" : ""}
                      </div>
                    ) : null}
                    <div className="aiDockActions">
                      <button
                        type="button"
                        className="secondaryBtn smallBtn"
                        disabled={rowBusy || status === "running"}
                        onClick={() => {
                          void handleReplay(toolKey, "live");
                        }}
                      >
                        {rowBusy ? "..." : "Повторить"}
                      </button>
                      <button
                        type="button"
                        className="secondaryBtn smallBtn"
                        disabled={rowBusy || status === "running"}
                        onClick={() => {
                          void handleReplay(toolKey, "replay");
                        }}
                      >
                        Последний успешный
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

