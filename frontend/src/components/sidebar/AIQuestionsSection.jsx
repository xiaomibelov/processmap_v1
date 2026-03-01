import { useMemo, useState } from "react";
import SidebarSection from "./SidebarSection";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value || "").trim();
}

function normalizeAiStatus(raw) {
  return String(raw || "").trim().toLowerCase() === "done" ? "done" : "open";
}

export default function AIQuestionsSection({
  open,
  onToggle,
  selectedElementId,
  selectedElementAiQuestions,
  onGenerateAiQuestions,
  aiGenerateAvailable = true,
  aiGenerateReasonCode = "",
  aiGenerateHint,
  onGenerateAiCta,
  aiGenerateCtaLabel,
  aiBusyQid,
  aiSavedQid,
  aiErr,
  aiCommentDraft,
  onAiCommentDraftChange,
  onSaveElementAiQuestion,
  disabled,
}) {
  const list = asArray(selectedElementAiQuestions);
  const hasSelected = !!selectedElementId;
  const [showAll, setShowAll] = useState(false);
  const [missingOnly, setMissingOnly] = useState(false);

  const visibleList = useMemo(() => {
    const src = missingOnly ? list.filter((q) => normalizeAiStatus(q?.status) !== "done") : list;
    return showAll ? src : src.slice(0, 3);
  }, [list, missingOnly, showAll]);

  const openCount = useMemo(() => list.filter((q) => normalizeAiStatus(q?.status) !== "done").length, [list]);
  const doneCount = Math.max(0, list.length - openCount);
  const summary = hasSelected
    ? `${list.length} вопросов · missing ${openCount}`
    : "Выберите узел для вопросов";
  const blockedReason = asText(aiGenerateHint || "");
  const generateDisabled = !!disabled || !aiGenerateAvailable || !hasSelected;
  const generateLabel = aiGenerateReasonCode === "busy" ? "В процессе..." : "Сгенерировать вопросы";

  return (
    <SidebarSection
      sectionId="ai"
      title="AI-вопросы"
      summary={summary}
      badge={openCount > 0 ? "NEW" : doneCount > 0 ? "DONE" : ""}
      open={open}
      onToggle={onToggle}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid="sidebar-ai-generate-btn"
          className="primaryBtn h-8 flex-1 px-2 text-[11px]"
          onClick={() => {
            void onGenerateAiQuestions?.();
          }}
          disabled={generateDisabled}
          title={!aiGenerateAvailable ? blockedReason || "Генерация сейчас недоступна." : (!hasSelected ? "Выберите узел на диаграмме." : "Сгенерировать AI-вопросы")}
        >
          {generateLabel}
        </button>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={missingOnly}
            onChange={(event) => setMissingOnly(!!event.target.checked)}
            disabled={!list.length}
          />
          Только missing
        </label>
      </div>
      {!aiGenerateAvailable && blockedReason ? (
        <div data-testid="sidebar-ai-gating-message" className="mb-2 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-[11px] text-warning">
          <div>{blockedReason}</div>
          {typeof onGenerateAiCta === "function" && asText(aiGenerateCtaLabel) ? (
            <button
              type="button"
              data-testid="sidebar-ai-gating-cta"
              className="secondaryBtn mt-1 h-7 px-2 text-[11px]"
              onClick={() => onGenerateAiCta()}
            >
              {aiGenerateCtaLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {!hasSelected ? (
        <div className="sidebarEmptyHint">
          Выберите узел, чтобы посмотреть или закрыть AI-вопросы.
        </div>
      ) : list.length ? (
        <>
          <div className="mb-2 flex items-center gap-1.5 text-[11px]">
            <span className="sidebarBadge">DONE: {doneCount}</span>
            <span className="sidebarBadge">MISSING: {openCount}</span>
          </div>
          <div className="max-h-64 space-y-2 overflow-auto pr-1">
            {visibleList.map((question) => {
              const qid = asText(question?.qid);
              const busy = aiBusyQid === qid;
              const isDone = normalizeAiStatus(question?.status) === "done";
              const comment = asText(aiCommentDraft[qid] ?? question?.comment);
              return (
                <div
                  key={qid}
                  className={`rounded-lg border border-border bg-panel2 px-2 py-2 ${isDone ? "ring-1 ring-emerald-400/40" : ""}`}
                >
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={(event) => {
                        void onSaveElementAiQuestion?.(question, { status: event.target.checked ? "done" : "open" });
                      }}
                      disabled={!!disabled || busy}
                    />
                    <span className="text-xs text-fg">{question?.text}</span>
                  </label>
                  <textarea
                    className="input mt-2 text-xs"
                    rows={2}
                    placeholder="Комментарий/ответ..."
                    value={comment}
                    onChange={(event) => onAiCommentDraftChange?.(qid, event.target.value)}
                    onBlur={() => {
                      void onSaveElementAiQuestion?.(question, { comment });
                    }}
                    style={{ resize: "vertical" }}
                    disabled={!!disabled || busy}
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="secondaryBtn h-7 px-2 text-[11px]"
                      onClick={() => {
                        void onSaveElementAiQuestion?.(question, { comment });
                      }}
                      disabled={!!disabled || busy}
                    >
                      {busy ? "Сохраняю..." : "Сохранить"}
                    </button>
                    <span className="text-[11px] text-muted">
                      {aiSavedQid === qid ? "Сохранено" : isDone ? "DONE" : "MISSING"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {list.length > 3 ? (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={() => setShowAll((prev) => !prev)}
              >
                {showAll ? "Показать меньше" : "Показать все"}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="sidebarEmptyHint">
          Для выбранного узла вопросов нет. Нажмите «Сгенерировать вопросы».
        </div>
      )}
      {aiErr ? <div className="mt-2 text-[11px] text-danger">{aiErr}</div> : null}
    </SidebarSection>
  );
}
