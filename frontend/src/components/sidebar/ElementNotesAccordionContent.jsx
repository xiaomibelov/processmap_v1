import SidebarTrustStatus from "./SidebarTrustStatus";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function noteText(value) {
  return String(value?.text || value?.notes || value || "").trim();
}

function noteAuthor(value) {
  return String(
    value?.author_label
    || value?.author
    || value?.user
    || value?.created_by
    || "you",
  ).trim() || "you";
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

const ELEMENT_NOTES_STATUS_META = {
  saved: {
    label: "Сохранено",
    helper: "Заметка сохранена.",
    tone: "saved",
    cta: null,
  },
  local: {
    label: "Есть локальные изменения",
    helper: "Текст заметки изменён локально.",
    tone: "local",
    cta: null,
  },
  syncing: {
    label: "Синхронизация…",
    helper: "Заметка сохраняется.",
    tone: "syncing",
    cta: null,
  },
  error: {
    label: "Ошибка",
    helper: "Не удалось сохранить заметку. Текст остался в редакторе.",
    tone: "error",
    cta: "Повторить",
  },
};

const REVIEW_STATUS_META = {
  draft: {
    label: "Черновик",
    tone: "muted",
  },
  in_review: {
    label: "На ревью",
    tone: "syncing",
  },
  changes_requested: {
    label: "Нужны правки",
    tone: "error",
  },
  approved: {
    label: "Одобрено",
    tone: "saved",
  },
};

const REVIEW_STATUS_OPTIONS = [
  { value: "draft", label: "Черновик" },
  { value: "in_review", label: "На ревью" },
  { value: "changes_requested", label: "Нужны правки" },
  { value: "approved", label: "Одобрено" },
];

function normalizeReviewStatus(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "review") return "in_review";
  if (value === "ready") return "approved";
  if (value === "in_progress") return "changes_requested";
  if (Object.prototype.hasOwnProperty.call(REVIEW_STATUS_META, value)) return value;
  return "draft";
}

function normalizeReviewCommentStatus(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "reopened") return "open";
  if (value === "resolved") return "resolved";
  return "open";
}

function formatAnchorLabel(comment) {
  const anchorType = String(comment?.anchor_type || "").trim();
  const anchorId = String(comment?.anchor_id || comment?.anchorId || "").trim();
  const anchorLabel = String(comment?.anchor_label || comment?.anchorLabel || "").trim();
  const prefix = anchorType === "sequence_flow" ? "Flow" : "Node";
  if (anchorLabel) return `${prefix}: ${anchorLabel}`;
  if (anchorId) return `${prefix}: ${anchorId}`;
  return "Anchor";
}

function isAnchorKnown(knownAnchorIds, comment) {
  const anchorId = String(comment?.anchor_id || comment?.anchorId || "").trim();
  if (!anchorId) return false;
  if (knownAnchorIds instanceof Set) return knownAnchorIds.has(anchorId);
  if (Array.isArray(knownAnchorIds)) return knownAnchorIds.includes(anchorId);
  return false;
}

export default function ElementNotesAccordionContent({
  selectedElementId,
  selectedElementName,
  selectedElementType,
  selectedElementNotes,
  noteCount,
  elementText,
  elementSyncState = "saved",
  onElementTextChange,
  onSendElementNote,
  elementBusy,
  elementErr,
  reviewStatus = "draft",
  reviewStatusBusy = false,
  reviewComments = [],
  reviewOpenCommentsCount = 0,
  selectedAnchorReviewComments = [],
  reviewCommentText = "",
  onReviewCommentTextChange,
  onSendReviewComment,
  reviewBusy = false,
  reviewErr = "",
  reviewActionBusyId = "",
  onSetReviewCommentLifecycle,
  onSetSessionReviewStatus,
  onOpenReviewAnchor,
  knownAnchorIds,
  currentUserId = "",
  currentUserLabel = "",
  onNodeEditorRef,
  disabled,
}) {
  const list = [...asArray(selectedElementNotes)]
    .filter((item) => String(item?.kind || "").trim().toLowerCase() !== "review_comment")
    .slice(-10)
    .reverse();
  const statusMeta = ELEMENT_NOTES_STATUS_META[String(elementSyncState || "").trim().toLowerCase()] || ELEMENT_NOTES_STATUS_META.saved;
  const normalizedReviewStatus = normalizeReviewStatus(reviewStatus);
  const reviewMeta = REVIEW_STATUS_META[normalizedReviewStatus] || REVIEW_STATUS_META.draft;
  const allReviewComments = [...asArray(reviewComments)].sort((a, b) => Number(b?.updated_at || b?.updatedAt || 0) - Number(a?.updated_at || a?.updatedAt || 0));
  const selectedReviewComments = [...asArray(selectedAnchorReviewComments)].sort((a, b) => Number(b?.updated_at || b?.updatedAt || 0) - Number(a?.updated_at || a?.updatedAt || 0));

  if (!selectedElementId) {
    return <div className="sidebarEmptyHint">Выберите узел для заметок.</div>;
  }

  return (
    <div className="sidebarControlStack">
      <SidebarTrustStatus
        title={<span>Заметки</span>}
        label={statusMeta.label}
        helper={statusMeta.helper}
        tone={statusMeta.tone}
        ctaLabel={statusMeta.cta}
        onCta={onSendElementNote}
        ctaDisabled={!!disabled || !!elementBusy}
        testIdPrefix="element-notes-status"
      />
      <div className="text-[11px] text-muted">
        Узел: <span className="text-fg">{selectedElementName || selectedElementId}</span>
      </div>
      <SidebarTrustStatus
        title={<span>Review v1</span>}
        label={reviewMeta.label}
        helper={Number(reviewOpenCommentsCount || 0) > 0 ? `Открытых комментариев: ${Number(reviewOpenCommentsCount || 0)}` : "Открытых комментариев нет."}
        tone={reviewMeta.tone}
        testIdPrefix="review-v1-status"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11px] text-muted">Статус ревью:</label>
        <select
          className="input h-8 min-h-0 max-w-[220px] py-0 text-[12px]"
          value={normalizedReviewStatus}
          onChange={(event) => {
            void onSetSessionReviewStatus?.(event.target.value);
          }}
          disabled={!!disabled || !!reviewStatusBusy}
          data-testid="review-v1-status-select"
        >
          {REVIEW_STATUS_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="text-[11px] text-muted">
        Anchored comments на этом якоре: <span className="text-fg">{selectedReviewComments.length}</span>
      </div>
      {selectedReviewComments.length ? (
        <div className="sidebarMiniList" data-testid="review-v1-selected-anchor-list">
          {selectedReviewComments.map((comment, idx) => {
            const commentId = String(comment?.id || "").trim() || `review_anchor_${idx + 1}`;
            const isResolved = normalizeReviewCommentStatus(comment?.status) === "resolved";
            return (
              <div key={commentId} className="sidebarMiniItem">
                <div className="sidebarMiniItemText">{noteText(comment?.body || comment?.text)}</div>
                <div className="sidebarMiniItemMeta">
                  {noteAuthor(comment)}
                  {compactTime(comment?.updated_at || comment?.updatedAt || comment?.created_at || comment?.createdAt)
                    ? ` · ${compactTime(comment?.updated_at || comment?.updatedAt || comment?.created_at || comment?.createdAt)}`
                    : ""}
                  <span className="ml-1 text-[10px] text-muted/80">{isResolved ? "resolved" : "open"}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    className="secondaryBtn tinyBtn"
                    onClick={() => {
                      void onSetReviewCommentLifecycle?.(commentId, isResolved ? "open" : "resolved");
                    }}
                    disabled={!!disabled || !!reviewActionBusyId}
                  >
                    {isResolved ? "Reopen" : "Resolve"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="sidebarEmptyHint">Для выбранного якоря review-комментариев пока нет.</div>
      )}
      <textarea
        className="input min-w-0"
        placeholder={`Review комментарий для ${/sequenceflow/i.test(String(selectedElementType || "")) ? "потока" : "узла"}...`}
        value={reviewCommentText}
        onChange={(event) => onReviewCommentTextChange?.(event.target.value)}
        rows={3}
        style={{ resize: "vertical" }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            void onSendReviewComment?.();
          }
        }}
        disabled={!!disabled || !!reviewBusy}
        data-testid="review-v1-comment-input"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">Автор: {currentUserLabel || currentUserId || "you"}</span>
        <button
          type="button"
          className="primaryBtn h-8 px-3 text-[11px]"
          onClick={() => {
            void onSendReviewComment?.();
          }}
          disabled={!!disabled || !!reviewBusy}
          data-testid="review-v1-comment-submit"
        >
          {reviewBusy ? "Сохраняю..." : "Добавить review comment"}
        </button>
      </div>
      {reviewErr ? <div className="selectedNodeFieldError">{reviewErr}</div> : null}
      {allReviewComments.length ? (
        <div className="sidebarMiniList" data-testid="review-v1-session-comments">
          {allReviewComments.map((comment, idx) => {
            const commentId = String(comment?.id || "").trim() || `review_session_${idx + 1}`;
            const isResolved = normalizeReviewCommentStatus(comment?.status) === "resolved";
            const missingAnchor = !isAnchorKnown(knownAnchorIds, comment);
            return (
              <div key={commentId} className="sidebarMiniItem">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="secondaryBtn tinyBtn"
                    onClick={() => onOpenReviewAnchor?.(comment)}
                    title={formatAnchorLabel(comment)}
                    disabled={!!disabled}
                  >
                    {formatAnchorLabel(comment)}
                  </button>
                  <span className={`text-[10px] ${isResolved ? "text-success" : "text-warning"}`}>
                    {isResolved ? "resolved" : "open"}
                  </span>
                </div>
                <div className="sidebarMiniItemText">{noteText(comment?.body || comment?.text)}</div>
                <div className="sidebarMiniItemMeta">
                  {noteAuthor(comment)}
                  {compactTime(comment?.updated_at || comment?.updatedAt || comment?.created_at || comment?.createdAt)
                    ? ` · ${compactTime(comment?.updated_at || comment?.updatedAt || comment?.created_at || comment?.createdAt)}`
                    : ""}
                  {missingAnchor ? <span className="ml-1 text-danger">· anchor missing</span> : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    className="secondaryBtn tinyBtn"
                    onClick={() => {
                      void onSetReviewCommentLifecycle?.(commentId, isResolved ? "open" : "resolved");
                    }}
                    disabled={!!disabled || !!reviewActionBusyId}
                  >
                    {isResolved ? "Reopen" : "Resolve"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="sidebarEmptyHint">Session review comments пока пусты.</div>
      )}
      {list.length ? (
        <div className="sidebarMiniList">
          {list.map((item, idx) => (
            <div key={item?.id || `node_note_${idx + 1}`} className="sidebarMiniItem">
              <div className="sidebarMiniItemText">{noteText(item)}</div>
              <div className="sidebarMiniItemMeta">
                {noteAuthor(item)}
                {compactTime(item?.updatedAt || item?.createdAt || item?.ts || item?.created_at)
                  ? ` · ${compactTime(item?.updatedAt || item?.createdAt || item?.ts || item?.created_at)}`
                  : ""}
                <span className="ml-1 text-[10px] text-muted/80">#{Math.max(1, Number(noteCount || 0) - idx)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="sidebarEmptyHint">Пока нет заметок для выбранного узла.</div>
      )}

      {elementErr ? <div className="selectedNodeFieldError">{elementErr}</div> : null}
      <textarea
        ref={(node) => onNodeEditorRef?.(node)}
        className="input min-w-0"
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
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">Ctrl/Cmd + Enter для сохранения</span>
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
    </div>
  );
}
