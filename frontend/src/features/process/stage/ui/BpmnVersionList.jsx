function shortHash(value) {
  const s = String(value || "").trim();
  return s.length > 8 ? s.slice(0, 8) : s;
}

function formatKb(len) {
  const n = Number(len || 0);
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
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
  const rev = Number(item?.revisionNumber || item?.rev || item?.userFacingRevisionNumber || 0);
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

function badgeClasses(tone) {
  if (tone === "info") return "bg-accent/15 text-accent";
  if (tone === "ok") return "bg-emerald-500/15 text-emerald-600";
  return "bg-fg/10 text-muted";
}

function DiffSummary({ text }) {
  if (!text) return null;
  return <div className="truncate text-[11px] text-muted">{text}</div>;
}

function AdminTechnicalToggle({ checked, onChange, count }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-panel px-2 py-1.5 text-xs text-muted hover:bg-accentSoft/10">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 accent-accent"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        data-testid="bpmn-versions-show-technical"
      />
      <span className="flex items-center gap-1.5">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        Показать технические версии
        {count > 0 ? <span className="rounded bg-fg/10 px-1 py-0 text-[10px]">{count}</span> : null}
      </span>
    </label>
  );
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
  onSaveSession,
  isAdmin = false,
  showTechnical = false,
  onToggleTechnical,
}) {
  const list = Array.isArray(versions) ? versions : [];
  const latestId = String(list[0]?.id || "");
  const technicalCount = list.filter((item) => item?.isTechnicalRevision).length;

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
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted">Версии: {list.length}</span>
        {isAdmin ? (
          <AdminTechnicalToggle checked={showTechnical} onChange={onToggleTechnical} count={technicalCount} />
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        <div className="relative flex flex-col gap-0 py-1">
          {/* Timeline line */}
          <div className="absolute bottom-4 left-[11px] top-4 w-px bg-border" />

          {list.map((item, index) => {
            const id = String(item?.id || "");
            const active = id === String(selectedId || "");
            const badge = resolveBadge(item, currentVersionId, latestId);
            const authorName = String(item?.authorLabel || item?.authorName || item?.authorEmail || item?.authorId || "").trim();
            const isTechnical = item?.isTechnicalRevision === true;
            const userFacingRev = Number(item?.userFacingRevisionNumber || item?.revisionNumber || item?.rev || 0);
            const technicalRev = Number(item?.technicalRevisionNumber || item?.versionNumber || 0);
            const displayRev = isTechnical || !userFacingRev ? technicalRev : userFacingRev;
            const displayLabel = isTechnical && !userFacingRev
              ? `Тех. ${displayRev}`
              : (userFacingRev ? `Версия ${userFacingRev}` : (displayRev ? `Версия ${displayRev}` : "Версия"));

            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect?.(item)}
                className={`group relative z-10 flex w-full gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ${
                  active
                    ? "bg-accentSoft/35"
                    : "hover:bg-accentSoft/15"
                }`}
                data-testid="bpmn-version-item"
                data-snapshot-id={id}
              >
                {/* Timeline dot */}
                <div className="relative flex flex-col items-center pt-1.5">
                  <div
                    className={`h-2.5 w-2.5 rounded-full border-2 ${
                      active
                        ? "border-accent bg-accent"
                        : isTechnical
                          ? "border-muted bg-panel"
                          : "border-border bg-panel group-hover:border-accent"
                    }`}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <span className={`truncate text-sm font-semibold ${isTechnical ? "text-muted" : "text-fg"}`}>
                      {displayLabel}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className={`rounded px-1.5 py-0 text-[10px] font-medium ${badgeClasses(badge.tone)}`}>
                        {badge.label}
                      </span>
                      {isTechnical ? (
                        <span className="rounded bg-fg/10 px-1.5 py-0 text-[10px] text-muted">Техническая</span>
                      ) : null}
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

                  {item?.comment ? (
                    <div className="mb-1 truncate text-xs text-muted">{item.comment}</div>
                  ) : null}

                  <DiffSummary text={item?.diffSummary} />

                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span
                      className="font-mono hover:text-fg"
                      title="Кликните, чтобы скопировать хэш"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(String(item?.sessionPayloadHash || item?.hash || ""));
                      }}
                    >
                      {shortHash(item?.sessionPayloadHash || item?.hash)}
                    </span>
                    <span>{formatKb(item?.len)}</span>
                  </div>

                  {isTechnical ? (
                    <div className="mt-1 text-[11px] text-muted">
                      {String(item?.reasonLabel || item?.reason || "техническое сохранение")}
                      {item?.reason ? ` · ${String(item.reason)}` : null}
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
