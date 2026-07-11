import { useState } from "react";
import { useElementThreads } from "../../features/notes/useElementThreads";
import ThreadCompactCard from "../../features/notes/ThreadCompactCard";
import CompactComposer from "../../features/notes/CompactComposer";

/**
 * "FB помощник" — compact element-scoped discussions inside the sidebar
 * "Заметки" accordion. Built on the existing note_threads system
 * (scope_type="diagram_element"); legacy per-element notes stay untouched below.
 */
export default function ElementThreadNotes({ sessionId, elementId }) {
  const { threads, loading, error, createThread, addComment } = useElementThreads(sessionId, elementId);
  const [createBusy, setCreateBusy] = useState(false);

  const handleCreate = async (body) => {
    setCreateBusy(true);
    const result = await createThread({ body });
    setCreateBusy(false);
    return result;
  };

  return (
    <div className="rounded-xl border border-border bg-panel p-3 shadow-sm" data-testid="fb-helper-notes">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">FB помощник</div>
          <div className="mt-1 text-xs leading-relaxed text-muted">
            Заметки-обсуждения по выбранному элементу. Видны всей команде, хранятся на сервере.
          </div>
        </div>
        {threads.length ? (
          <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted">
            {threads.length}
          </span>
        ) : null}
      </div>

      {error ? <div className="selectedNodeFieldError mb-2">{error}</div> : null}

      {loading ? (
        <div className="text-[11px] text-muted">Загружаю заметки…</div>
      ) : threads.length ? (
        <div className="grid gap-2">
          {threads.map((thread) => (
            <ThreadCompactCard key={thread?.id} thread={thread} onAddComment={addComment} />
          ))}
        </div>
      ) : (
        <div className="sidebarEmptyHint">Нет заметок по этому элементу.</div>
      )}

      <CompactComposer
        onSubmit={handleCreate}
        busy={createBusy}
        placeholder="Добавить заметку по элементу…"
      />
    </div>
  );
}
