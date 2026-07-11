import { useState } from "react";

function text(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numericTime(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 100000000000 ? n * 1000 : n;
}

function formatDate(value) {
  const n = numericTime(value);
  if (!n) return "";
  try {
    return new Date(n).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function authorLabel(...candidates) {
  for (const candidate of candidates) {
    const value = text(candidate);
    if (value) return value;
  }
  return "—";
}

/**
 * Compact thread card for the sidebar ("FB помощник").
 * The thread's first comment is the note body; the rest are replies.
 */
export default function ThreadCompactCard({ thread, onAddComment }) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  const comments = asArray(thread?.comments).filter((comment) => !comment?.is_deleted);
  const firstComment = comments[0] || null;
  const replies = comments.slice(1);
  const resolved = text(thread?.status) === "resolved";
  const attention = thread?.requires_attention === true && !resolved;

  const submitReply = async () => {
    const body = text(reply);
    if (!body || replyBusy || typeof onAddComment !== "function") return;
    setReplyBusy(true);
    const result = await onAddComment(thread?.id, body);
    setReplyBusy(false);
    if (result?.ok === false) return;
    setReply("");
    setExpanded(true);
  };

  return (
    <div
      className="rounded-lg border border-border bg-bg/60 px-2.5 py-2 shadow-sm transition hover:-translate-y-px hover:shadow-md"
      data-testid="fb-helper-thread-card"
      data-thread-id={text(thread?.id)}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
        <span className="font-medium text-fg">
          {authorLabel(thread?.created_by_full_name, thread?.created_by_email, thread?.created_by)}
        </span>
        {formatDate(thread?.updated_at || thread?.created_at) ? (
          <span className="text-muted">{formatDate(thread?.updated_at || thread?.created_at)}</span>
        ) : null}
        {resolved ? (
          <span className="rounded-full border border-success/40 bg-success/10 px-1.5 py-px text-[10px] font-semibold text-success">
            ✓ Решено
          </span>
        ) : null}
        {attention ? (
          <span className="rounded-full border border-warning/45 bg-warning/10 px-1.5 py-px text-[10px] font-semibold text-warning">
            ⚠ Важно
          </span>
        ) : null}
      </div>

      <div className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg">
        {text(firstComment?.body) || "Без текста"}
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          className="text-[11px] text-muted transition hover:text-fg"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "Свернуть" : (replies.length ? `${replies.length} ответ(ов)` : "Ответить")}
        </button>
      </div>

      {expanded ? (
        <div className="mt-2 grid gap-1.5 border-t border-dashed border-border pt-2">
          {replies.map((comment) => (
            <div key={comment?.id} className="rounded-md bg-panel/70 px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-muted">
                <span className="font-medium text-fg">
                  {authorLabel(comment?.author_full_name, comment?.author_email, comment?.author_user_id)}
                </span>
                {formatDate(comment?.created_at) ? <span>{formatDate(comment?.created_at)}</span> : null}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-fg">
                {text(comment?.body)}
              </div>
            </div>
          ))}
          <div className="flex items-end gap-2">
            <textarea
              className="input min-h-[44px] w-full min-w-0 rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed"
              placeholder="Ответить…"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={1}
              style={{ resize: "vertical" }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void submitReply();
                }
              }}
              disabled={replyBusy}
            />
            <button
              type="button"
              className="secondaryBtn h-8 shrink-0 px-2.5 text-[11px]"
              onClick={() => void submitReply()}
              disabled={replyBusy || !text(reply)}
            >
              {replyBusy ? "…" : "Отправить"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
