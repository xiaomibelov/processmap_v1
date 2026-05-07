function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

function compactLabel(value, fallback = "Без названия") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > 90 ? `${text.slice(0, 89).trim()}…` : text;
}

function candidateTitle(item, fallbackPrefix, index) {
  const row = asObject(item);
  return compactLabel(
    row.title || row.name || row.label || row.question || row.id || `${fallbackPrefix} ${index + 1}`,
    `${fallbackPrefix} ${index + 1}`,
  );
}

function candidateMeta(item, keys = []) {
  const row = asObject(item);
  return keys
    .map((key) => String(row[key] ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function diffSummary(diff) {
  const row = asObject(diff);
  if ("changed" in row) return row.changed ? "изменится" : "без изменений";
  const pieces = [
    row.added_count != null ? `+${Number(row.added_count || 0)}` : "",
    row.updated_count != null ? `~${Number(row.updated_count || 0)}` : "",
    row.removed_count != null ? `-${Number(row.removed_count || 0)}` : "",
    row.unchanged_count != null ? `=${Number(row.unchanged_count || 0)}` : "",
  ].filter(Boolean);
  return pieces.length ? pieces.join(" ") : "без счётчиков";
}

function warningText(item) {
  const row = asObject(item);
  const code = String(row.code || "").trim();
  const message = String(row.message || row.detail || row.error || item || "").trim();
  if (code && message) return `${code}: ${message}`;
  return code || message;
}

function PreviewCandidateList({ title, items, emptyText, fallbackPrefix, metaKeys = [] }) {
  const list = asArray(items);
  return (
    <div className="rounded-lg border border-border/70 bg-panel2/40 p-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-fg">
        <span>{title}</span>
        <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted">{list.length}</span>
      </div>
      {list.length ? (
        <div className="space-y-1">
          {list.slice(0, 6).map((item, index) => {
            const meta = candidateMeta(item, metaKeys);
            return (
              <div key={`${title}_${index}_${String(asObject(item).id || candidateTitle(item, fallbackPrefix, index))}`} className="rounded-md border border-border/60 bg-bg/50 px-2 py-1.5">
                <div className="text-[11px] font-medium text-fg">{candidateTitle(item, fallbackPrefix, index)}</div>
                {meta ? <div className="mt-0.5 text-[10px] text-muted">{meta}</div> : null}
              </div>
            );
          })}
          {list.length > 6 ? <div className="text-[10px] text-muted">Ещё {list.length - 6}</div> : null}
        </div>
      ) : (
        <div className="text-[11px] text-muted">{emptyText}</div>
      )}
    </div>
  );
}

function NotesExtractionPreviewPanel({ preview }) {
  const data = asObject(preview);
  if (!data || !Object.keys(data).length) return null;
  const source = String(data.source || "unknown").trim().toLowerCase();
  const warnings = asArray(data.warnings).map(warningText).filter(Boolean);
  const diff = asObject(data.diff);
  const sourceTone = source === "llm"
    ? "border-success/40 bg-success/10 text-success"
    : "border-warning/45 bg-warning/10 text-warning";

  return (
    <div className="rounded-xl border border-info/25 bg-info/5 p-3" data-testid="notes-extraction-preview-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-info">Предпросмотр AI-разбора</div>
          <div className="mt-1 text-xs leading-relaxed text-muted">Это предпросмотр. Изменения ещё не применены.</div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${sourceTone}`}>
          {source === "llm" ? "LLM" : "Fallback"}
        </span>
      </div>

      {warnings.length ? (
        <div className="mt-3 rounded-lg border border-warning/35 bg-warning/10 px-2.5 py-2 text-[11px] text-warning">
          {warnings.map((item, index) => <div key={`preview_warning_${index}`}>{item}</div>)}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2">
        <PreviewCandidateList
          title="Роли"
          items={asArray(data.candidate_roles).map((role) => ({ title: role }))}
          emptyText="Новых ролей нет."
          fallbackPrefix="Роль"
        />
        {data.candidate_start_role ? (
          <div className="rounded-lg border border-border/70 bg-panel2/40 px-2 py-1.5 text-[11px] text-muted">
            Стартовая роль: <span className="font-medium text-fg">{compactLabel(data.candidate_start_role)}</span>
          </div>
        ) : null}
        <PreviewCandidateList
          title="Узлы"
          items={data.candidate_nodes}
          emptyText="Кандидатов узлов нет."
          fallbackPrefix="Узел"
          metaKeys={["id", "type", "actor_role"]}
        />
        <PreviewCandidateList
          title="Связи"
          items={asArray(data.candidate_edges).map((edge) => {
            const row = asObject(edge);
            return { ...row, title: `${row.from_id || row.from || "?"} → ${row.to_id || row.to || "?"}` };
          })}
          emptyText="Кандидатов связей нет."
          fallbackPrefix="Связь"
          metaKeys={["id", "type"]}
        />
        <PreviewCandidateList
          title="Вопросы"
          items={data.candidate_questions}
          emptyText="Кандидатов вопросов нет."
          fallbackPrefix="Вопрос"
          metaKeys={["id", "node_id", "issue_type"]}
        />
      </div>

      <div className="mt-3 rounded-lg border border-border/70 bg-bg/40 p-2">
        <div className="mb-1 text-[11px] font-semibold text-fg">Diff</div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px] text-muted">
          {["notes", "roles", "start_role", "nodes", "edges", "questions"].map((key) => (
            <div key={key} className="rounded-md border border-border/60 bg-panel/60 px-2 py-1">
              <span className="font-medium text-fg">{key}</span>: {diffSummary(diff[key])}
            </div>
          ))}
        </div>
      </div>

      {data.input_hash ? (
        <div className="mt-2 break-all text-[10px] text-muted">input_hash: {String(data.input_hash)}</div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-muted">Применение будет добавлено отдельным контуром.</div>
        <button type="button" className="secondaryBtn h-8 px-2.5 text-[11px]" disabled>
          Применить
        </button>
      </div>
      <div className="mt-1 text-[10px] text-muted">Применение будет доступно после apply-boundary контура.</div>
    </div>
  );
}

export default function ElementNotesAccordionContent({
  selectedElementId,
  globalText = "",
  onGlobalTextChange,
  onSendGlobalNote,
  globalBusy,
  globalErr,
  onPreviewNotesExtraction,
  previewBusy,
  previewErr,
  notesExtractionPreview,
  elementText,
  elementSyncState = "saved",
  onElementTextChange,
  onSendElementNote,
  elementBusy,
  elementErr,
  selectedElementNotes,
  noteCount,
  onNodeEditorRef,
  disabled,
}) {
  const list = [...asArray(selectedElementNotes)]
    .filter((item) => String(item?.kind || "").trim().toLowerCase() !== "review_comment")
    .slice(-10)
    .reverse();

  if (!selectedElementId) {
    return (
      <div className="sidebarControlStack gap-3">
        <div className="rounded-xl border border-border bg-panel p-3 shadow-sm">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Заметки процесса</div>
              <div className="mt-1 text-xs leading-relaxed text-muted">
                Добавьте заметку или посмотрите черновик разбора без применения к модели.
              </div>
            </div>
            <div className="shrink-0 text-[11px] text-muted">Ctrl/Cmd + Enter</div>
          </div>
          {globalErr ? <div className="selectedNodeFieldError mb-2">{globalErr}</div> : null}
          {previewErr ? <div className="selectedNodeFieldError mb-2">{previewErr}</div> : null}
          <textarea
            className="input min-h-[112px] w-full min-w-0 rounded-xl px-3 py-2 text-sm leading-relaxed"
            placeholder="Опишите процессные заметки для предпросмотра разбора"
            value={globalText}
            onChange={(event) => onGlobalTextChange?.(event.target.value)}
            rows={4}
            style={{ resize: "vertical" }}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                void onSendGlobalNote?.();
              }
            }}
            disabled={!!disabled || !!globalBusy || !!previewBusy}
          />
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="secondaryBtn h-9 px-3 text-[12px]"
              onClick={() => {
                void onPreviewNotesExtraction?.();
              }}
              disabled={!!disabled || !!previewBusy || !String(globalText || "").trim()}
              data-testid="notes-extraction-preview-button"
            >
              {previewBusy ? "Строю предпросмотр..." : "Предпросмотр разбора"}
            </button>
            <button
              type="button"
              className="primaryBtn h-9 px-3 text-[12px]"
              onClick={() => {
                void onSendGlobalNote?.();
              }}
              disabled={!!disabled || !!globalBusy || !String(globalText || "").trim()}
            >
              {globalBusy ? "Сохраняю..." : "Добавить заметку"}
            </button>
          </div>
        </div>

        <NotesExtractionPreviewPanel preview={notesExtractionPreview} />
      </div>
    );
  }

  return (
    <div className="sidebarControlStack gap-3">
      {list.length ? (
        <div className="rounded-xl border border-border bg-panel/70 p-2">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Последние заметки</div>
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
        </div>
      ) : (
        <div className="sidebarEmptyHint">Пока нет заметок для выбранного узла.</div>
      )}

      <div className="rounded-xl border border-border bg-panel p-3 shadow-sm">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Новая заметка</div>
            <div className="mt-1 text-xs leading-relaxed text-muted">
              Коротко зафиксируйте наблюдение, вопрос или договорённость по выбранному узлу.
            </div>
          </div>
          <div className="shrink-0 text-[11px] text-muted">Ctrl/Cmd + Enter</div>
        </div>
        {elementErr ? <div className="selectedNodeFieldError mb-2">{elementErr}</div> : null}
        <textarea
          ref={(node) => onNodeEditorRef?.(node)}
          className="input min-h-[112px] w-full min-w-0 rounded-xl px-3 py-2 text-sm leading-relaxed"
          placeholder="Опишите наблюдение по выбранному узлу"
          value={elementText}
          onChange={(event) => onElementTextChange?.(event.target.value)}
          rows={4}
          style={{ resize: "vertical" }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              void onSendElementNote?.();
            }
          }}
          disabled={!!disabled || !!elementBusy}
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="primaryBtn h-9 px-3 text-[12px]"
            onClick={() => {
              void onSendElementNote?.();
            }}
            disabled={!!disabled || !!elementBusy}
          >
            {elementBusy ? "Сохраняю..." : "Добавить заметку"}
          </button>
        </div>
      </div>
    </div>
  );
}
