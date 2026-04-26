function normalizeCount(value) {
  const count = Number(value || 0);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
}

export default function NotesAggregateBadge({
  aggregate = null,
  count,
  className = "",
  compact = false,
  compactNumericOnly = false,
  label = "Заметки",
}) {
  const openCount = normalizeCount(count ?? aggregate?.open_notes_count);
  const attentionCount = normalizeCount(aggregate?.attention_discussions_count);
  const hasAttention = Boolean(aggregate?.has_attention_discussions || attentionCount > 0);
  if (openCount <= 0 && !hasAttention) return null;

  const chipLabel = String(label || "Заметки").trim() || "Заметки";
  const ariaLabel = hasAttention
    ? `Требуют внимания ${chipLabel.toLowerCase()}: ${attentionCount || 1}. Открытые: ${openCount}`
    : `Открытые ${chipLabel.toLowerCase()}: ${openCount}`;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${hasAttention ? "border-rose-300 bg-rose-50 text-rose-900" : "border-sky-300/70 bg-sky-500/10 text-sky-800"} ${compactNumericOnly ? "pointer-events-none shrink-0" : ""} ${className}`}
      title={ariaLabel}
      aria-label={ariaLabel}
      data-attention-discussions={hasAttention ? "true" : undefined}
    >
      {compact && compactNumericOnly ? null : <span>{chipLabel}</span>}
      {hasAttention ? (
        <span className="inline-grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black leading-none text-white" aria-hidden="true">
          !
        </span>
      ) : null}
      {openCount > 0 ? <span className="tabular-nums">{openCount}</span> : null}
    </span>
  );
}
