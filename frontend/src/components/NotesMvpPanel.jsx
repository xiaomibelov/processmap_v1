import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiAddNoteThreadComment,
  apiCreateNoteThread,
  apiGetSessionNoteAggregate,
  apiListNoteThreads,
  apiPatchNoteThread,
} from "../lib/api";
import NotesAggregateBadge from "./NotesAggregateBadge.jsx";

const STATUS_OPTIONS = [
  { value: "open", label: "Открытые" },
  { value: "resolved", label: "Решённые" },
  { value: "all", label: "Все" },
];

const SCOPE_OPTIONS = [
  { value: "all", label: "Все scopes" },
  { value: "diagram_element", label: "Элемент" },
  { value: "diagram", label: "Диаграмма" },
  { value: "session", label: "Сессия" },
];

function text(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatDate(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  try {
    return new Date(n * (n < 100000000000 ? 1000 : 1)).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function scopeLabel(thread) {
  const scopeType = text(thread?.scope_type);
  const scopeRef = thread?.scope_ref && typeof thread.scope_ref === "object" ? thread.scope_ref : {};
  if (scopeType === "diagram_element") {
    return text(scopeRef.element_name || scopeRef.element_title || scopeRef.element_id) || "Элемент";
  }
  if (scopeType === "diagram") return "Диаграмма";
  if (scopeType === "session") return "Сессия";
  return scopeType || "Scope";
}

function scopeBadge(thread) {
  const scopeType = text(thread?.scope_type);
  if (scopeType === "diagram_element") return "ЭЛЕМЕНТ";
  if (scopeType === "diagram") return "ДИАГРАММА";
  if (scopeType === "session") return "СЕССИЯ";
  return "NOTE";
}

function firstCommentText(thread) {
  const first = asArray(thread?.comments)[0];
  return text(first?.body);
}

function errorText(result, fallback) {
  return text(result?.error || result?.detail || fallback) || fallback;
}

function buildScopeRef(scopeType, selectedElement) {
  const selectedId = text(selectedElement?.id);
  if (scopeType === "diagram_element") {
    return {
      element_id: selectedId,
      element_name: text(selectedElement?.name || selectedId),
      element_type: text(selectedElement?.type),
    };
  }
  return {};
}

function emitNotesAggregateChanged(sessionId) {
  if (typeof window === "undefined") return;
  const sid = text(sessionId);
  if (!sid) return;
  window.dispatchEvent(new CustomEvent("processmap:notes-aggregate-changed", {
    detail: { sessionId: sid },
  }));
}

export default function NotesMvpPanel({
  sessionId,
  sessionTitle = "",
  selectedElement = null,
  disabled = false,
}) {
  const sid = text(sessionId);
  const selectedElementId = text(selectedElement?.id);
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("open");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [selectedElementOnly, setSelectedElementOnly] = useState(false);
  const [threads, setThreads] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [createScope, setCreateScope] = useState("session");
  const [createDraftByScope, setCreateDraftByScope] = useState({
    diagram_element: "",
    diagram: "",
    session: "",
  });
  const [commentDraftByThread, setCommentDraftByThread] = useState({});
  const [aggregate, setAggregate] = useState(null);
  const [aggregateRefreshTick, setAggregateRefreshTick] = useState(0);

  const selectedThread = useMemo(() => {
    return threads.find((item) => text(item?.id) === selectedThreadId) || threads[0] || null;
  }, [threads, selectedThreadId]);

  const createDraft = createDraftByScope[createScope] || "";
  const commentDraft = commentDraftByThread[text(selectedThread?.id)] || "";
  const canUseSelectedElementScope = !!selectedElementId;
  const canCreateCurrentScope = createScope !== "diagram_element" || canUseSelectedElementScope;

  const refreshAggregate = useCallback(async () => {
    if (!sid) {
      setAggregate(null);
      return;
    }
    const result = await apiGetSessionNoteAggregate(sid);
    if (result?.ok) {
      setAggregate(result.aggregate || null);
    }
  }, [sid]);

  const fetchThreads = useCallback(async (options = {}) => {
    if (!sid || !open) return;
    setLoading(true);
    setError("");
    const preferredThreadId = text(options?.preferredThreadId);
    const filters = {
      status: statusFilter === "all" ? "" : statusFilter,
      scopeType: scopeFilter === "all" ? "" : scopeFilter,
      elementId: scopeFilter === "diagram_element" && selectedElementOnly ? selectedElementId : "",
    };
    const result = await apiListNoteThreads(sid, filters);
    if (!result.ok) {
      setError(errorText(result, "Не удалось загрузить заметки."));
      setLoading(false);
      return;
    }
    const nextThreads = asArray(result.items);
    setThreads(nextThreads);
    setSelectedThreadId((prev) => {
      if (preferredThreadId && nextThreads.some((item) => text(item?.id) === preferredThreadId)) {
        return preferredThreadId;
      }
      if (nextThreads.some((item) => text(item?.id) === prev)) return prev;
      return text(nextThreads[0]?.id);
    });
    setLoading(false);
  }, [open, scopeFilter, selectedElementId, selectedElementOnly, sid, statusFilter]);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    void refreshAggregate();
  }, [aggregateRefreshTick, refreshAggregate]);

  useEffect(() => {
    setThreads([]);
    setSelectedThreadId("");
    setError("");
    setAggregate(null);
  }, [sid]);

  function openForScope(scopeType) {
    const nextScope = text(scopeType) || "session";
    setCreateScope(nextScope);
    setScopeFilter(nextScope === "diagram_element" ? "diagram_element" : "all");
    setSelectedElementOnly(nextScope === "diagram_element");
    setOpen(true);
  }

  async function createThread() {
    if (!sid || disabled) return;
    const body = text(createDraft);
    if (!body) return;
    if (!canCreateCurrentScope) {
      setError("Для заметки к элементу сначала выберите BPMN-элемент.");
      return;
    }
    const scopeKey = createScope;
    setBusy("create");
    setError("");
    const result = await apiCreateNoteThread(sid, {
      scope_type: scopeKey,
      scope_ref: buildScopeRef(scopeKey, selectedElement),
      body,
    });
    if (!result.ok) {
      setError(errorText(result, "Не удалось создать заметку."));
      setBusy("");
      return;
    }
    const nextThreadId = text(result.thread?.id);
    setCreateDraftByScope((prev) => ({ ...prev, [scopeKey]: "" }));
    setSelectedThreadId(nextThreadId);
    await fetchThreads({ preferredThreadId: nextThreadId });
    setAggregateRefreshTick((value) => value + 1);
    emitNotesAggregateChanged(sid);
    setCreateDraftByScope((prev) => (prev[scopeKey] ? { ...prev, [scopeKey]: "" } : prev));
    setBusy("");
  }

  async function addComment() {
    const threadId = text(selectedThread?.id);
    const body = text(commentDraft);
    if (!threadId || !body || disabled) return;
    setBusy(`comment:${threadId}`);
    setError("");
    const result = await apiAddNoteThreadComment(threadId, { body });
    if (!result.ok) {
      setError(errorText(result, "Не удалось добавить комментарий."));
      setBusy("");
      return;
    }
    setCommentDraftByThread((prev) => ({ ...prev, [threadId]: "" }));
    setSelectedThreadId(threadId);
    await fetchThreads({ preferredThreadId: threadId });
    setAggregateRefreshTick((value) => value + 1);
    emitNotesAggregateChanged(sid);
    setCommentDraftByThread((prev) => (prev[threadId] ? { ...prev, [threadId]: "" } : prev));
    setBusy("");
  }

  async function patchStatus(status) {
    const threadId = text(selectedThread?.id);
    const nextStatus = text(status);
    if (!threadId || !nextStatus || disabled) return;
    setBusy(`status:${threadId}`);
    setError("");
    const result = await apiPatchNoteThread(threadId, { status: nextStatus });
    if (!result.ok) {
      setError(errorText(result, "Не удалось обновить статус заметки."));
      setBusy("");
      return;
    }
    setSelectedThreadId(threadId);
    await fetchThreads();
    setAggregateRefreshTick((value) => value + 1);
    emitNotesAggregateChanged(sid);
    setBusy("");
  }

  if (!sid) return null;

  return (
    <>
      {!open ? (
        <div className="fixed bottom-5 right-5 z-[86] flex max-w-[min(92vw,560px)] flex-wrap justify-end gap-2">
          <button type="button" className="primaryBtn smallBtn shadow-panel" onClick={() => openForScope("session")} disabled={disabled}>
            <span className="inline-flex items-center gap-2">
              <span>Заметки</span>
              <NotesAggregateBadge aggregate={aggregate} compact className="bg-white/70 px-1.5 py-0 text-[10px]" />
            </span>
          </button>
          <button type="button" className="secondaryBtn smallBtn shadow-panel" onClick={() => openForScope("diagram")} disabled={disabled}>
            К диаграмме
          </button>
          <button
            type="button"
            className="secondaryBtn smallBtn shadow-panel"
            onClick={() => openForScope("diagram_element")}
            disabled={disabled || !canUseSelectedElementScope}
            title={canUseSelectedElementScope ? "Создать заметку к выбранному BPMN-элементу" : "Сначала выберите BPMN-элемент"}
          >
            К элементу
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-y-0 right-0 z-[88] flex w-[min(720px,96vw)] flex-col border-l border-border bg-panel shadow-panel">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-black text-fg">Notes MVP-1</div>
              <div className="mt-0.5 truncate text-xs text-muted">
                {text(sessionTitle) || "Сессия"} · новые заметки отдельно от legacy notes
              </div>
            </div>
            <button type="button" className="secondaryBtn smallBtn" onClick={() => setOpen(false)}>
              Закрыть
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(230px,300px)_1fr] gap-0 overflow-hidden max-lg:grid-cols-1">
            <div className="flex min-h-0 flex-col border-r border-border bg-bg/35 p-3 max-lg:border-b max-lg:border-r-0">
              <div className="grid grid-cols-2 gap-2">
                <select className="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  {STATUS_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <select className="select" value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)}>
                  {SCOPE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>

              {scopeFilter === "diagram_element" ? (
                <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={selectedElementOnly}
                    onChange={(event) => setSelectedElementOnly(event.target.checked)}
                    disabled={!canUseSelectedElementScope}
                  />
                  только выбранный элемент
                </label>
              ) : null}

              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Threads</div>
                <button type="button" className="secondaryBtn tinyBtn" onClick={fetchThreads} disabled={loading}>
                  {loading ? "..." : "Обновить"}
                </button>
              </div>

              <div className="mt-2 min-h-0 flex-1 overflow-auto">
                {threads.length ? (
                  <div className="grid gap-2">
                    {threads.map((thread) => {
                      const threadId = text(thread?.id);
                      const active = threadId === text(selectedThread?.id);
                      return (
                        <button
                          key={threadId}
                          type="button"
                          className={`rounded-xl border p-2 text-left transition ${active ? "border-accent bg-accent/10" : "border-border bg-panel/80 hover:border-accent/50"}`}
                          onClick={() => setSelectedThreadId(threadId)}
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <span className="badge">{scopeBadge(thread)}</span>
                            <span className={`badge ${text(thread?.status) === "resolved" ? "ok" : "warn"}`}>
                              {text(thread?.status) === "resolved" ? "resolved" : "open"}
                            </span>
                          </div>
                          <div className="truncate text-sm font-bold text-fg">{scopeLabel(thread)}</div>
                          <div className="mt-1 line-clamp-2 text-xs text-muted">{firstCommentText(thread) || "Без текста"}</div>
                          <div className="mt-1 text-[11px] text-muted">{formatDate(thread?.updated_at)}</div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted">
                    {loading ? "Загрузка заметок..." : "Заметок по текущему фильтру нет."}
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden">
              <div className="border-b border-border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={`secondaryBtn tinyBtn ${createScope === "session" ? "isActive" : ""}`}
                    onClick={() => setCreateScope("session")}
                  >
                    Сессия
                  </button>
                  <button
                    type="button"
                    className={`secondaryBtn tinyBtn ${createScope === "diagram" ? "isActive" : ""}`}
                    onClick={() => setCreateScope("diagram")}
                  >
                    Диаграмма
                  </button>
                  <button
                    type="button"
                    className={`secondaryBtn tinyBtn ${createScope === "diagram_element" ? "isActive" : ""}`}
                    onClick={() => setCreateScope("diagram_element")}
                    disabled={!canUseSelectedElementScope}
                    title={canUseSelectedElementScope ? selectedElementId : "Выберите BPMN-элемент"}
                  >
                    Элемент
                  </button>
                </div>
                <textarea
                  className="textarea min-h-[86px] w-full"
                  value={createDraft}
                  onChange={(event) => setCreateDraftByScope((prev) => ({ ...prev, [createScope]: event.target.value }))}
                  placeholder={createScope === "diagram_element" && selectedElementId ? `Заметка к элементу ${selectedElementId}` : "Новая заметка..."}
                  disabled={disabled || !canCreateCurrentScope}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-muted">
                    {createScope === "diagram_element"
                      ? (selectedElementId ? `Scope: element ${selectedElementId}` : "Scope: element не выбран")
                      : `Scope: ${createScope}`}
                  </div>
                  <button type="button" className="primaryBtn smallBtn" onClick={createThread} disabled={busy === "create" || !text(createDraft) || !canCreateCurrentScope}>
                    {busy === "create" ? "Создание..." : "Создать thread"}
                  </button>
                </div>
              </div>

              {error ? (
                <div className="mx-3 mt-3 rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error}
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-auto p-3">
                {selectedThread ? (
                  <div className="grid gap-3">
                    <div className="rounded-xl border border-border bg-bg/35 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-black text-fg">{scopeLabel(selectedThread)}</div>
                          <div className="text-xs text-muted">
                            {scopeBadge(selectedThread)} · {text(selectedThread.status) || "open"} · {formatDate(selectedThread.updated_at)}
                          </div>
                        </div>
                        {text(selectedThread.status) === "resolved" ? (
                          <button type="button" className="secondaryBtn smallBtn" onClick={() => patchStatus("open")} disabled={busy.startsWith("status:")}>
                            Reopen
                          </button>
                        ) : (
                          <button type="button" className="secondaryBtn smallBtn" onClick={() => patchStatus("resolved")} disabled={busy.startsWith("status:")}>
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-2">
                      {asArray(selectedThread.comments).map((comment) => (
                        <div key={text(comment?.id)} className="rounded-xl border border-border bg-panel/80 p-3">
                          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted">
                            <span>{text(comment?.author_user_id) || "user"}</span>
                            <span>{formatDate(comment?.created_at)}</span>
                          </div>
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{text(comment?.body)}</div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-border bg-bg/35 p-3">
                      <textarea
                        className="textarea min-h-[80px] w-full"
                        value={commentDraft}
                        onChange={(event) => {
                          const threadId = text(selectedThread?.id);
                          setCommentDraftByThread((prev) => ({ ...prev, [threadId]: event.target.value }));
                        }}
                        placeholder="Добавить комментарий..."
                        disabled={disabled}
                      />
                      <div className="mt-2 flex justify-end">
                        <button type="button" className="primaryBtn smallBtn" onClick={addComment} disabled={busy.startsWith("comment:") || !text(commentDraft)}>
                          {busy.startsWith("comment:") ? "Отправка..." : "Добавить комментарий"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
                    Выберите thread слева или создайте новую заметку.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
