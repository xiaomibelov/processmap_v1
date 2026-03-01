import { useEffect, useMemo, useState } from "react";
import SidebarSection from "./SidebarSection";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function noteText(value) {
  return String(value?.text || value?.notes || value || "").trim();
}

function noteAuthor(value) {
  return String(value?.author || value?.user || value?.created_by || "you").trim() || "you";
}

function compactTime(value) {
  const ts = Number(value || 0);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  try {
    return new Date(ts).toLocaleString("ru-RU", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function NotesSection({
  open,
  onToggle,
  isElementMode,
  selectedElementName,
  selectedElementId,
  selectedElementNotes,
  elementText,
  onElementTextChange,
  onSendElementNote,
  elementBusy,
  elementErr,
  onNodeEditorRef,
  disabled,
  noteCount,
  notes,
  text,
  onTextChange,
  onSendGlobalNote,
  busy,
  err,
  coverage,
  coverageRows,
  coverageOpen,
  onCoverageToggle,
  onCoverageOpen,
  batchMode,
  onBatchModeToggle,
  batchText,
  onBatchTextChange,
  batchPlan,
  batchBusy,
  batchErr,
  batchResult,
  onBatchApply,
}) {
  const HISTORY_LIMIT = 10;
  const notesList = asArray(selectedElementNotes);
  const globalNotes = asArray(notes);
  const nodeHistory = [...notesList].slice(-HISTORY_LIMIT).reverse();
  const globalHistory = [...globalNotes].slice(0, HISTORY_LIMIT);
  const [tab, setTab] = useState(isElementMode ? "node" : "global");
  const hasUnsavedNode = String(elementText || "").trim().length > 0;
  const hasUnsavedGlobal = String(text || "").trim().length > 0;

  useEffect(() => {
    if (!isElementMode && tab !== "global") setTab("global");
  }, [isElementMode, tab]);

  const summary = useMemo(() => {
    if (!isElementMode) return `Общие: ${noteCount}`;
    return `К узлу: ${notesList.length} · Общие: ${noteCount}`;
  }, [isElementMode, noteCount, notesList.length]);

  return (
    <SidebarSection
      sectionId="notes"
      title="Заметки"
      summary={summary}
      open={open}
      onToggle={onToggle}
      badge={hasUnsavedNode || hasUnsavedGlobal ? "DRAFT" : ""}
    >
      <div className="sidebarNotesBody">
        {isElementMode ? (
          <div className="sidebarTabs mb-2">
            <button
              type="button"
              className={`sidebarTabBtn ${tab === "node" ? "isActive" : ""}`}
              onClick={() => setTab("node")}
            >
              К узлу
            </button>
            <button
              type="button"
              className={`sidebarTabBtn ${tab === "global" ? "isActive" : ""}`}
              onClick={() => setTab("global")}
            >
              Общие
            </button>
          </div>
        ) : null}

        {tab === "node" && isElementMode ? (
          <>
            <div className="mb-2 text-[11px] text-muted">
              Узел: <span className="text-fg">{selectedElementName || selectedElementId}</span>
            </div>
            {nodeHistory.length ? (
              <div className="sidebarMiniList">
                {nodeHistory.map((item, idx) => (
                  <div key={item?.id || `node_note_${idx + 1}`} className="sidebarMiniItem">
                    <div className="sidebarMiniItemText">{noteText(item)}</div>
                    <div className="sidebarMiniItemMeta">
                      {noteAuthor(item)}
                      {compactTime(item?.updatedAt || item?.createdAt || item?.ts || item?.created_at) ? ` · ${compactTime(item?.updatedAt || item?.createdAt || item?.ts || item?.created_at)}` : ""}
                      <span className="ml-1 text-[10px] text-muted/80">#{Math.max(1, notesList.length - idx)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sidebarEmptyHint">
                Пока нет заметок для выбранного узла.
              </div>
            )}

            {elementErr ? <div className="mt-2 text-[11px] text-danger">{elementErr}</div> : null}
            <textarea
              ref={(node) => onNodeEditorRef?.(node)}
              className="input mt-2"
              placeholder="Заметка для выбранного узла..."
              value={elementText}
              onChange={(event) => onElementTextChange?.(event.target.value)}
              rows={3}
              style={{ resize: "vertical" }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void onSendElementNote?.();
                }
              }}
              disabled={!!disabled || !!elementBusy}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted">
                {hasUnsavedNode ? "Есть несохранённые изменения" : "Сохранено"}
              </span>
              <button
                type="button"
                className="primaryBtn h-8 px-3 text-[11px]"
                onClick={() => {
                  void onSendElementNote?.();
                }}
                disabled={!!disabled || !!elementBusy}
              >
                {elementBusy ? "Сохраняю..." : "Сохранить заметку"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-1 rounded-md border border-border bg-panel2/70 px-2.5 py-2.5 text-xs text-muted">
              История общих заметок: <span className="text-fg">{noteCount}</span>
            </div>
            {globalHistory.length ? (
              <div className="sidebarMiniList mt-2">
                {globalHistory.map((item, idx) => (
                  <div key={item?.id || idx} className="sidebarMiniItem">
                    <div className="sidebarMiniItemText">{noteText(item).slice(0, 240)}</div>
                    <div className="sidebarMiniItemMeta">
                      {noteAuthor(item)}
                      {compactTime(item?.ts || item?.updatedAt || item?.createdAt || item?.created_at) ? ` · ${compactTime(item?.ts || item?.updatedAt || item?.createdAt || item?.created_at)}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sidebarEmptyHint mt-2">Общих заметок пока нет.</div>
            )}
            {err ? <div className="mt-2 text-[11px] text-danger">{err}</div> : null}
            <textarea
              className="input mt-2"
              placeholder="Общая заметка..."
              value={text}
              onChange={(event) => onTextChange?.(event.target.value)}
              rows={4}
              style={{ resize: "vertical" }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void onSendGlobalNote?.();
                }
              }}
              disabled={!!disabled || !!busy}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted">
                {hasUnsavedGlobal ? "Есть несохранённые изменения" : "Сохранено"}
              </span>
              <button
                type="button"
                className="primaryBtn h-8 px-3 text-[11px]"
                onClick={() => {
                  void onSendGlobalNote?.();
                }}
                disabled={!!disabled || !!busy}
              >
                {busy ? "Сохраняю..." : "Сохранить заметку"}
              </button>
            </div>
          </>
        )}

        <details className="sidebarDetails mt-3" open={coverageOpen}>
          <summary className="sidebarDetailsSummary">
            <span>Покрытие</span>
            <span className="text-[11px] text-muted">
              total {Number(coverage?.summary?.total || 0)}
            </span>
          </summary>
          <div className="mt-2 rounded-lg border border-border/75 bg-panel2/45 p-2" data-testid="notes-coverage-card">
          <div className="mb-2 flex items-center justify-between gap-1.5">
            <div className="text-[11px] text-muted">
              notes: <b className="text-fg">{Number(coverage?.summary?.missingNotes || 0)}</b>
              <span> · AI: <b className="text-fg">{Number(coverage?.summary?.missingAiQuestions || 0)}</b></span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={onCoverageToggle}
                data-testid="notes-coverage-toggle"
              >
                {coverageOpen ? "Скрыть" : "Показать"}
              </button>
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={() => onCoverageOpen?.({ source: "notes_panel_button" })}
                data-testid="notes-coverage-open-diagram"
              >
                В Diagram
              </button>
            </div>
          </div>
          {coverageOpen ? (
            <div className="max-h-36 space-y-1 overflow-auto pr-1">
              {asArray(coverageRows).length ? (
                asArray(coverageRows).slice(0, 12).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full rounded-md border border-border bg-panel2 px-2 py-1.5 text-left text-[11px] hover:border-borderStrong"
                    onClick={() => onCoverageOpen?.({ source: "notes_panel_row", focusElementId: item.id })}
                    data-testid="notes-coverage-item"
                    data-element-id={item.id}
                  >
                    <div className="truncate text-fg">{item.title}</div>
                    <div className="text-muted">
                      {item.missingNotes ? "notes " : ""}
                      {item.missingAiQuestions ? "ai_questions " : ""}
                      {item.missingDurationQuality ? "duration/quality" : ""}
                    </div>
                  </button>
                ))
              ) : (
                <div className="sidebarEmptyHint">Пробелов не найдено.</div>
              )}
            </div>
          ) : null}
          </div>
        </details>

        <details className="sidebarDetails mt-2">
          <summary className="sidebarDetailsSummary">
            <span>Batch</span>
            <span className="text-[11px] text-muted">режим массовых ops</span>
          </summary>
          <div className="mt-2 rounded-lg border border-border/75 bg-panel2/45 p-2" data-testid="notes-batch-card">
          <div className="mb-2 flex items-center justify-between gap-1.5">
            <div className="text-xs font-semibold text-fg">Batch</div>
            <button
              type="button"
              className={batchMode ? "primaryBtn h-7 px-2 text-[11px]" : "secondaryBtn h-7 px-2 text-[11px]"}
              onClick={onBatchModeToggle}
              data-testid="notes-batch-toggle"
            >
              Batch: {batchMode ? "ON" : "OFF"}
            </button>
          </div>
          {batchMode ? (
            <>
              <textarea
                className="input"
                placeholder="Переименуй: Task_1 -> Подготовить тару"
                value={batchText}
                onChange={(event) => onBatchTextChange?.(String(event.target.value || ""))}
                rows={5}
                style={{ resize: "vertical" }}
                disabled={!!disabled || !!batchBusy}
                data-testid="notes-batch-input"
              />
              <div className="mt-2 text-[11px] text-muted" data-testid="notes-batch-preview-total">
                Будет изменено: <b className="text-fg">{Number(batchPlan?.preview?.total || 0)}</b>
              </div>
              {asArray(batchPlan?.preview?.items).length ? (
                <div className="mt-1 space-y-1 text-[11px] text-muted">
                  {asArray(batchPlan.preview.items).map((item, idx) => (
                    <div key={`${idx}_${item?.label || ""}`} className="truncate">
                      - {String(item?.label || "")}
                    </div>
                  ))}
                </div>
              ) : null}
              {batchErr ? <div className="mt-2 text-[11px] text-danger">{batchErr}</div> : null}
              {batchResult ? <div className="mt-2 text-[11px] text-success">{batchResult}</div> : null}
              <div className="mt-2 flex items-center justify-end">
                <button
                  type="button"
                  className="primaryBtn"
                  onClick={() => {
                    void onBatchApply?.();
                  }}
                  disabled={!!disabled || !!batchBusy || !asArray(batchPlan?.ops).length || asArray(batchPlan?.errors).length > 0}
                  data-testid="notes-batch-apply"
                >
                  {batchBusy ? "Применяю..." : "Применить"}
                </button>
              </div>
            </>
          ) : (
            <div className="text-[11px] text-muted">Включите Batch для массовых изменений.</div>
          )}
          </div>
        </details>
      </div>
    </SidebarSection>
  );
}
