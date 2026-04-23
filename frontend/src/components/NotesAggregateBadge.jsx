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
}) {
  const openCount = normalizeCount(count ?? aggregate?.open_notes_count);
  if (openCount <= 0) return null;

  const label = compact ? `Заметки ${openCount}` : `Открытые заметки: ${openCount}`;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-sky-300/70 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-800 ${className}`}
      title={label}
      aria-label={label}
    >
      <span>Заметки</span>
      <span className="tabular-nums">{openCount}</span>
    </span>
  );
}
