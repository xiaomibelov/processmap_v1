import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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

function sanitizeAiStatusMessage(msg) {
  const raw = toText(msg);
  if (!raw) return "";
  if (raw.includes("Нажмите «Проверить AI»")) return "";
  return raw;
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

export default function AiToolsModal({
  open,
  onClose,
  llmHasApiKey,
  llmBaseUrl,
  llmSaving,
  llmErr,
  llmVerifyState,
  llmVerifyMsg,
  llmVerifyAt,
  llmVerifyBusy,
  onSaveLlmSettings,
  onVerifyLlmSettings,
}) {
  const ai = useAiStatus();
  const [busyKey, setBusyKey] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmBaseUrlDraft, setLlmBaseUrlDraft] = useState(llmBaseUrl || "https://api.deepseek.com");
  const [llmLocalErr, setLlmLocalErr] = useState("");

  const items = useMemo(() => (Array.isArray(ai?.byTool) ? ai.byTool : []), [ai]);
  const running = Number(ai?.running || 0);
  const verifyState = String(llmVerifyState || "off");
  const verifyLabel =
    verifyState === "ok"
      ? "AI READY"
      : verifyState === "checking"
        ? "AI CHECK..."
        : verifyState === "fail"
          ? "AI ERROR"
          : verifyState === "unknown"
            ? "AI ?"
            : "AI OFF";
  const verifyAtText = llmVerifyAt ? new Date(llmVerifyAt).toLocaleTimeString() : "";
  const safeVerifyMsg = sanitizeAiStatusMessage(llmVerifyMsg);

  useEffect(() => {
    if (!open) return;
    setLlmBaseUrlDraft(llmBaseUrl || "https://api.deepseek.com");
  }, [open, llmBaseUrl]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

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

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI инструменты"
        className="flex max-h-[min(90vh,980px)] w-[min(980px,96vw)] min-h-[220px] min-w-[320px] flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-panel"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border bg-panel2 px-4 py-3">
          <div className="text-base font-extrabold text-fg">AI инструменты</div>
          <button type="button" className="iconBtn h-8 w-8 min-w-8 p-0" onClick={onClose} title="Закрыть">
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto px-4 py-3 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-panel2/55 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-fg">История запусков</div>
              <span className={"badge " + (running > 0 ? "warn" : "ok")}>
                {running > 0 ? `running: ${running}` : "idle"}
              </span>
            </div>
            {!items.length ? (
              <div className="muted small">История запусков пока пуста.</div>
            ) : (
              <div className="grid max-h-[56vh] gap-2 overflow-auto pr-1">
                {items.map((item) => {
                  const toolKey = toText(item?.toolKey);
                  const status = statusTitle(item?.status);
                  const rowBusy = busyKey === toolKey;
                  const err = item?.lastError && typeof item.lastError === "object" ? item.lastError : null;
                  return (
                    <div className="rounded-lg border border-border bg-panel px-2.5 py-2" key={toolKey || `${item?.toolId || "ai"}_${item?.sessionId || "-"}`}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-fg">{toText(item?.label || item?.toolId) || "AI tool"}</div>
                        <span className={"badge " + (status === "error" || status === "skipped" ? "err" : (status === "cached" ? "warn" : "ok"))}>{status}</span>
                      </div>
                      <div className="small muted">sid: {toText(item?.sessionId) || "—"} · updated: {formatTime(item?.lastFinishedAt || item?.lastStartedAt)}</div>
                      <div className="small mt-1 text-fg/90">
                        {toText(item?.lastMessage) || (err?.message ? err.message : "—")}
                        {item?.cached ? " · cached" : ""}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
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

          <div className="rounded-xl border border-border bg-panel2/55 p-3">
            <div className="mb-2 text-sm font-semibold text-fg">Провайдер AI (DeepSeek)</div>
            <div className="grid gap-2">
              <input
                className="input min-w-0"
                type="password"
                placeholder="DeepSeek API key"
                value={llmApiKey}
                onChange={(e) => {
                  setLlmApiKey(e.target.value);
                  setLlmLocalErr("");
                }}
                autoComplete="off"
              />
              <input className="input min-w-0" placeholder="https://api.deepseek.com" value={llmBaseUrlDraft} onChange={(e) => setLlmBaseUrlDraft(e.target.value)} />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="primaryBtn h-9 whitespace-nowrap px-3 text-xs"
                  disabled={!!llmSaving}
                  onClick={async () => {
                    setLlmLocalErr("");
                    const key = String(llmApiKey || "").trim();
                    const base = String(llmBaseUrlDraft || "").trim() || "https://api.deepseek.com";
                    if (!key) {
                      setLlmLocalErr("Вставьте API key.");
                      return;
                    }
                    const r = await onSaveLlmSettings?.({ api_key: key, base_url: base });
                    if (r && r.ok === false) {
                      setLlmLocalErr(String(r.error || "Не удалось сохранить"));
                      return;
                    }
                    setLlmApiKey("");
                  }}
                >
                  {llmSaving ? "Сохраняю..." : "Сохранить AI"}
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-9 whitespace-nowrap px-3 text-xs"
                  disabled={!!llmVerifyBusy || !llmHasApiKey}
                  title={!llmHasApiKey ? "Сначала сохраните API key" : "Проверить, что DeepSeek отвечает"}
                  onClick={async () => {
                    await onVerifyLlmSettings?.({ base_url: llmBaseUrlDraft });
                  }}
                >
                  {llmVerifyBusy ? "Проверка..." : "Проверить AI"}
                </button>
              </div>
              <span className={"small " + (verifyState === "ok" ? "text-success" : (verifyState === "fail" ? "text-danger" : "text-muted"))}>
                {(safeVerifyMsg || "Статус проверки отсутствует") + ` · ${verifyLabel}`}
                {verifyAtText ? ` · ${verifyAtText}` : ""}
              </span>
              {llmLocalErr ? <span className="badge err">{llmLocalErr}</span> : null}
              {llmErr ? <span className="badge err">{llmErr}</span> : null}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
