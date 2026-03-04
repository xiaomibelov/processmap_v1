export default function TldrCard({
  summary = "",
  busy = false,
  error = "",
  status = "",
  disabled = false,
  onGenerate,
}) {
  return (
    <div className="mt-3 border-t border-border/70 pt-2" data-testid="notes-tldr-panel">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">TL;DR</div>
      {summary ? (
        <div className="mt-1 rounded-md border border-border bg-panel2 px-2 py-2 text-xs whitespace-pre-wrap" data-testid="notes-tldr-summary">
          {summary}
        </div>
      ) : (
        <div className="mt-1 rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted">
          Краткое резюме пока не сформировано.
        </div>
      )}
      <button
        type="button"
        className="primaryBtn mt-2 w-full"
        onClick={() => {
          void onGenerate?.();
        }}
        disabled={!!disabled || !!busy}
        data-testid="notes-tldr-generate"
      >
        {busy ? "Сжимаю..." : "Сжать заметку"}
      </button>
      {error ? <div className="mt-2 text-[11px] text-danger">{error}</div> : null}
      {!error && status ? <div className="mt-2 text-[11px] text-success">{status}</div> : null}
    </div>
  );
}
