function shortHash(value) {
  const s = String(value || "").trim();
  return s.length > 8 ? s.slice(0, 8) : s;
}

function formatKb(len) {
  const n = Number(len || 0);
  if (n === 0) return "0 B";
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

function formatSnapshotTs(ts) {
  const d = new Date(Number(ts || 0));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function snapshotLabel(item) {
  const comment = String(item?.comment || "").trim();
  const rev = Number(item?.revisionNumber || item?.rev || 0);
  if (comment) return comment;
  if (rev > 0) return `Версия ${rev}`;
  return "Без названия";
}

function resolveBadge(item, currentVersionId, latestId) {
  const id = String(item?.id || "");
  if (id === String(currentVersionId || "")) return { label: "текущая", tone: "info" };
  if (id === String(latestId || "")) return { label: "последняя", tone: "ok" };
  return { label: "устаревшая", tone: "muted" };
}

function DiffSummary({ text }) {
  if (!text) return null;
  return <div className="truncate text-[11px] text-muted">{text}</div>;
}

export default function BpmnVersionList({
  versions,
  selectedId,
  currentVersionId,
  busy,
  loadState,
  loadError,
  emptyMessage,
  onSelect,
  onDownload,
  onRestore,
  onDiffWithCurrent,
  onDiffAB,
  onSaveSession,
}) {
  const list = Array.isArray(versions) ? versions : [];
  const latestId = String(list[0]?.id || "");
  const hasEnoughForDiff = list.length >= 2;

  if (loadState === "loading") {
    return (
      <div className="grid h-40 place-items-center" data-testid="bpmn-versions-loading">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
      </div>
    );
  }

  if (loadState === "failed") {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" data-testid="bpmn-versions-error">
        Не удалось загрузить историю версий: {String(loadError || "ошибка загрузки")}
      </div>
    );
  }

  if (loadState === "empty" || list.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-panel px-3 py-4" data-testid="bpmn-versions-empty">
        <div className="text-sm text-muted">
          {String(emptyMessage || "История версий пуста. Сохраните сессию, чтобы создать первую версию.")}
        </div>
        {onSaveSession ? (
          <button type="button" className="primaryBtn h-8 px-3 text-xs" onClick={onSaveSession}>
            Сохранить сейчас
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted">Версии: {list.length}</span>
        <button
          type="button"
          className="secondaryBtn h-7 px-2 text-[11px]"
          onClick={onDiffAB}
          disabled={busy || !hasEnoughForDiff}
          title={hasEnoughForDiff ? "" : "Нужно минимум 2 версии для сравнения"}
          data-testid="bpmn-versions-open-diff"
        >
          Сравнить А/В
        </button>
      </div>
      <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
        {list.map((item) => {
          const id = String(item?.id || "");
          const active = id === String(selectedId || "");
          const badge = resolveBadge(item, currentVersionId, latestId);
          const authorName = String(item?.authorName || item?.authorEmail || item?.authorId || "").trim();

          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect?.(item)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                active
                  ? "border-accent bg-accentSoft/35"
                  : "border-border bg-panel hover:bg-accentSoft/20"
              }`}
              data-testid="bpmn-version-item"
              data-snapshot-id={id}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg">
                  {snapshotLabel(item)}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <span className={`badge text-[10px] ${badge.tone}`}>{badge.label}</span>
                  <span className="badge text-[10px] info">
                    {Number(item?.revisionNumber || item?.rev || 0) > 0
                      ? `№${Number(item?.revisionNumber || item?.rev || 0)}`
                      : "—"}
                  </span>
                </div>
              </div>

              <div className="mb-1 text-xs text-muted">{formatSnapshotTs(item?.ts)}</div>

              {authorName ? (
                <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-accentSoft text-[10px] font-semibold text-fg">
                    {authorName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{authorName}</span>
                </div>
              ) : null}

              <DiffSummary text={item?.diffSummary} />

              <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                <span
                  className="font-mono hover:text-fg"
                  title="Кликните, чтобы скопировать"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(String(item?.sessionPayloadHash || item?.hash || item?.xml || ""));
                  }}
                >
                  {shortHash(item?.sessionPayloadHash || item?.hash || item?.xml)}
                </span>
                <span>{formatKb(item?.len || item?.xml?.length)}</span>
              </div>

              {active ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="primaryBtn h-7 px-2 text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore?.(item);
                    }}
                    disabled={busy || id === currentVersionId}
                    data-testid="bpmn-version-restore"
                  >
                    Восстановить
                  </button>
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload?.(item);
                    }}
                  >
                    Скачать
                  </button>
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDiffWithCurrent?.(item);
                    }}
                    disabled={busy || id === currentVersionId}
                  >
                    Сравнить с текущей
                  </button>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
