import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiAddNoteThreadComment,
  apiCreateNoteThread,
  apiGetSessionNoteAggregate,
  apiListNoteThreads,
  apiPatchNoteThread,
} from "../lib/api";
import {
  buildLegacyElementBridgeThread,
  injectLegacyBridgeThread,
} from "../features/notes/legacyNotesBridge.js";
import NotesAggregateBadge from "./NotesAggregateBadge.jsx";

const STATUS_OPTIONS = [
  { value: "open", label: "Открытые" },
  { value: "resolved", label: "Закрытые" },
  { value: "all", label: "Все" },
];

const CONTEXT_FILTER_OPTIONS = [
  { value: "all", label: "Все контексты" },
  { value: "session", label: "Общие вопросы" },
  { value: "diagram", label: "Диаграмма" },
  { value: "diagram_element", label: "Элементы" },
  { value: "selected_element", label: "Выбранный элемент" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Сначала новые" },
  { value: "oldest", label: "Сначала старые" },
];

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

function scopeRef(thread) {
  return thread?.scope_ref && typeof thread.scope_ref === "object" ? thread.scope_ref : {};
}

function scopeMeta(thread) {
  const scopeType = text(thread?.scope_type);
  const ref = scopeRef(thread);
  if (scopeType === "diagram_element") {
    return {
      short: "Элемент",
      long: text(ref.element_name || ref.element_title || ref.element_id) || "Элемент",
      relation: text(ref.element_name || ref.element_title || ref.element_id) || "Элемент",
    };
  }
  if (scopeType === "diagram") {
    return { short: "Диаграмма", long: "Диаграмма", relation: "Диаграмма" };
  }
  if (scopeType === "session") {
    return { short: "Общий вопрос", long: "Общий вопрос", relation: "Общий вопрос" };
  }
  return { short: "Контекст", long: scopeType || "Контекст", relation: scopeType || "Контекст" };
}

function isLegacyBridgeThread(thread) {
  return Boolean(thread?.legacy_bridge);
}

function statusLabel(status) {
  return text(status) === "resolved" ? "Закрыто" : "Открыто";
}

function statusTone(status) {
  return text(status) === "resolved"
    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
    : "border-sky-300 bg-sky-50 text-sky-900";
}

function threadStatusLabel(thread) {
  return isLegacyBridgeThread(thread) ? "Legacy" : statusLabel(thread?.status);
}

function threadStatusTone(thread) {
  return isLegacyBridgeThread(thread)
    ? "border-amber-300 bg-amber-50 text-amber-900"
    : statusTone(thread?.status);
}

function firstComment(thread) {
  return asArray(thread?.comments)[0] || null;
}

function threadPreview(thread) {
  if (isLegacyBridgeThread(thread)) {
    return text(thread?.legacy_summary) || text(firstComment(thread)?.body) || "Локальные заметки элемента";
  }
  return text(firstComment(thread)?.body) || "Без текста";
}

function threadTitle(thread) {
  if (isLegacyBridgeThread(thread)) return "Локальные заметки элемента";
  const preview = threadPreview(thread)
    .split("\n")
    .map(text)
    .find(Boolean);
  if (!preview) return scopeMeta(thread).long;
  return preview.length > 78 ? `${preview.slice(0, 75)}...` : preview;
}

function threadUpdatedAt(thread) {
  const commentMax = asArray(thread?.comments).reduce(
    (max, item) => Math.max(max, numericTime(item?.updated_at || item?.created_at)),
    0,
  );
  return Math.max(numericTime(thread?.updated_at), numericTime(thread?.created_at), commentMax);
}

function threadSearchText(thread) {
  const ref = scopeRef(thread);
  return [
    threadTitle(thread),
    threadPreview(thread),
    scopeMeta(thread).short,
    scopeMeta(thread).long,
    text(ref.element_id),
    text(ref.element_name || ref.element_title),
    ...asArray(thread?.comments).map((item) => [text(item?.body), text(item?.author_user_id)].join(" ")),
  ].join(" ").toLowerCase();
}

function authorLabel(value) {
  return text(value) || "Автор";
}

function authorInitials(value) {
  const label = authorLabel(value);
  const parts = label.split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return "A";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || label[0]?.toUpperCase() || "A";
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
  legacyElementNotesMap = null,
  disabled = false,
  externalOpenRequest = null,
}) {
  const sid = text(sessionId);
  const selectedElementId = text(selectedElement?.id);
  const selectedElementName = text(selectedElement?.name || selectedElementId);

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("open");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
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

  const createDraft = createDraftByScope[createScope] || "";
  const canUseSelectedElementScope = !!selectedElementId;
  const canCreateCurrentScope = createScope !== "diagram_element" || canUseSelectedElementScope;

  const createScopeOptions = useMemo(() => [
    {
      value: "session",
      label: "Общий вопрос",
      helper: "Без привязки к конкретному элементу",
      disabled: false,
    },
    {
      value: "diagram",
      label: "Диаграмма",
      helper: "Относится ко всей схеме",
      disabled: false,
    },
    {
      value: "diagram_element",
      label: canUseSelectedElementScope ? `Элемент: ${selectedElementName}` : "Элемент",
      helper: canUseSelectedElementScope ? "Относится к выбранному BPMN-элементу" : "Сначала выберите элемент",
      disabled: !canUseSelectedElementScope,
    },
  ], [canUseSelectedElementScope, selectedElementName]);

  const legacyBridgeThread = useMemo(() => buildLegacyElementBridgeThread({
    notesMap: legacyElementNotesMap,
    elementId: selectedElementId,
    elementName: selectedElementName,
    elementType: text(selectedElement?.type),
  }), [legacyElementNotesMap, selectedElement?.type, selectedElementId, selectedElementName]);

  const displayThreads = useMemo(() => {
    if (scopeFilter !== "selected_element") return asArray(threads);
    return injectLegacyBridgeThread(threads, legacyBridgeThread);
  }, [legacyBridgeThread, scopeFilter, threads]);

  const visibleThreads = useMemo(() => {
    const query = text(searchQuery).toLowerCase();
    const filtered = asArray(displayThreads).filter((thread) => {
      if (!query) return true;
      return threadSearchText(thread).includes(query);
    });
    filtered.sort((left, right) => {
      const delta = threadUpdatedAt(right) - threadUpdatedAt(left);
      return sortOrder === "oldest" ? -delta : delta;
    });
    return filtered;
  }, [displayThreads, searchQuery, sortOrder]);

  const selectedThread = useMemo(() => {
    return visibleThreads.find((item) => text(item?.id) === selectedThreadId) || visibleThreads[0] || null;
  }, [selectedThreadId, visibleThreads]);
  const selectedThreadIsLegacyBridge = isLegacyBridgeThread(selectedThread);

  const commentDraft = commentDraftByThread[text(selectedThread?.id)] || "";

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
    if (scopeFilter === "selected_element" && !selectedElementId) {
      setThreads([]);
      setSelectedThreadId("");
      setLoading(false);
      return;
    }
    const filters = {
      status: statusFilter === "all" ? "" : statusFilter,
      scopeType: scopeFilter === "all" ? "" : (scopeFilter === "selected_element" ? "diagram_element" : scopeFilter),
      elementId: scopeFilter === "selected_element" ? selectedElementId : "",
    };
    const result = await apiListNoteThreads(sid, filters);
    if (!result.ok) {
      setError(errorText(result, "Не удалось загрузить заметки и обсуждения."));
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
  }, [open, scopeFilter, selectedElementId, sid, statusFilter]);

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
    setCreateOpen(false);
  }, [sid]);

  useEffect(() => {
    const request = externalOpenRequest && typeof externalOpenRequest === "object" ? externalOpenRequest : null;
    if (!sid || !request?.requestKey) return;
    const nextScopeFilter = text(request.scopeFilter);
    setOpen(true);
    setCreateOpen(false);
    setError("");
    setSearchQuery("");
    if (nextScopeFilter) {
      setScopeFilter(nextScopeFilter);
    }
    setSelectedThreadId("");
  }, [externalOpenRequest, sid]);

  function openPanel() {
    setOpen(true);
    setCreateOpen(false);
  }

  async function createThread() {
    if (!sid || disabled) return;
    const body = text(createDraft);
    if (!body) return;
    if (!canCreateCurrentScope) {
      setError("Для заметки по элементу сначала выберите BPMN-элемент.");
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
    setCreateOpen(false);
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
    if (!threadId || !body || disabled || selectedThreadIsLegacyBridge) return;
    setBusy(`comment:${threadId}`);
    setError("");
    const result = await apiAddNoteThreadComment(threadId, { body });
    if (!result.ok) {
      setError(errorText(result, "Не удалось отправить сообщение."));
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
    if (!threadId || !nextStatus || disabled || selectedThreadIsLegacyBridge) return;
    setBusy(`status:${threadId}`);
    setError("");
    const result = await apiPatchNoteThread(threadId, { status: nextStatus });
    if (!result.ok) {
      setError(errorText(result, "Не удалось обновить статус обсуждения."));
      setBusy("");
      return;
    }
    setSelectedThreadId(threadId);
    await fetchThreads({ preferredThreadId: threadId });
    setAggregateRefreshTick((value) => value + 1);
    emitNotesAggregateChanged(sid);
    setBusy("");
  }

  if (!sid) return null;

  return (
    <>
      {!open ? (
        <div className="fixed bottom-5 right-5 z-[86] flex max-w-[min(92vw,560px)] flex-wrap justify-end gap-2">
          <button
            type="button"
            className="group inline-flex items-center gap-2 rounded-full border border-sky-300/80 bg-sky-50 px-4 py-2 text-sm font-black text-sky-950 shadow-panel transition hover:-translate-y-0.5 hover:border-sky-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={openPanel}
            disabled={disabled}
            title="Открыть заметки"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-sky-500/15 text-base text-sky-900" aria-hidden="true">✎</span>
            <span>Заметки</span>
            <NotesAggregateBadge aggregate={aggregate} compact className="border-sky-300 bg-white/80 px-1.5 py-0 text-[10px]" />
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="fixed bottom-5 right-5 top-16 z-[88] flex w-[min(980px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[30px] border border-border bg-panel shadow-panel transition-all duration-200 max-lg:bottom-3 max-lg:right-3 max-lg:w-[calc(100vw-1.5rem)] max-sm:top-14">
          <div className="border-b border-border bg-gradient-to-r from-sky-50 via-panel to-panel px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-2xl border border-sky-300/80 bg-white text-sky-900" aria-hidden="true">✎</span>
                  <div className="text-lg font-black text-fg">Заметки и обсуждение</div>
                  <NotesAggregateBadge aggregate={aggregate} className="bg-white/85" />
                </div>
                <div className="mt-1 truncate text-xs text-muted">
                  {text(sessionTitle) || "Сессия"} · обсуждения по сессии, диаграмме и выбранным элементам
                </div>
              </div>
              <button
                type="button"
                className="secondaryBtn smallBtn"
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(false);
                }}
                aria-label="Скрыть заметки"
              >
                Скрыть
              </button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[1fr_minmax(282px,320px)] overflow-hidden max-lg:grid-cols-1">
            <section className="flex min-h-0 flex-col overflow-hidden border-r border-border bg-panel max-lg:border-b max-lg:border-r-0">
              {error ? (
                <div className="mx-4 mt-4 rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error}
                </div>
              ) : null}

              {selectedThread ? (
                <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr_auto] overflow-hidden">
                  <div className="border-b border-border bg-panel/95 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-xl font-black leading-snug text-fg">{threadTitle(selectedThread)}</div>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${threadStatusTone(selectedThread)}`}>
                            {threadStatusLabel(selectedThread)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="rounded-full border border-border bg-bg/70 px-2 py-0.5">Относится к: {scopeMeta(selectedThread).relation}</span>
                          <span>Последняя активность: {formatDate(threadUpdatedAt(selectedThread)) || "сейчас"}</span>
                          <span>Сообщений: {asArray(selectedThread.comments).length}</span>
                        </div>
                        {selectedThreadIsLegacyBridge ? (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                            Это read-only bridge из legacy `notes_by_element`. История показана для совместимости, но новые ответы и смена статуса здесь не поддерживаются.
                          </div>
                        ) : null}
                      </div>
                      {!selectedThreadIsLegacyBridge && text(selectedThread.status) === "resolved" ? (
                        <button type="button" className="secondaryBtn smallBtn" onClick={() => patchStatus("open")} disabled={busy.startsWith("status:")}>
                          Вернуть в открытые
                        </button>
                      ) : !selectedThreadIsLegacyBridge ? (
                        <button type="button" className="secondaryBtn smallBtn" onClick={() => patchStatus("resolved")} disabled={busy.startsWith("status:")}>
                          Закрыть обсуждение
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="min-h-0 overflow-auto bg-bg/15 px-5 py-4">
                    {selectedThreadIsLegacyBridge && text(selectedThread?.legacy_summary) ? (
                      <div className="mb-3 rounded-2xl border border-amber-200/80 bg-panel px-4 py-3 shadow-sm">
                        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-900">Legacy summary</div>
                        <div className="mt-1 text-sm leading-relaxed text-fg">{text(selectedThread.legacy_summary)}</div>
                      </div>
                    ) : null}
                    <div className="grid gap-3">
                      {asArray(selectedThread.comments).map((comment, idx) => {
                        const author = authorLabel(comment?.author_user_id);
                        return (
                          <article key={text(comment?.id) || `comment_${idx + 1}`} className="rounded-2xl border border-border bg-panel p-4 shadow-sm">
                            <div className="flex items-start gap-3">
                              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-500/10 text-xs font-black text-sky-900">
                                {authorInitials(author)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                  <span className="text-[15px] font-black text-fg">{author}</span>
                                  <span className="text-[11px] text-muted">{formatDate(comment?.updated_at || comment?.created_at) || "только что"}</span>
                                </div>
                                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fg">{text(comment?.body)}</div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>

                  {selectedThreadIsLegacyBridge ? (
                    <div className="border-t border-border bg-panel px-5 py-4">
                      <div className="rounded-2xl border border-dashed border-border bg-bg/40 px-4 py-3 text-sm text-muted">
                        Для новых ответов создайте discussion в новом Notes domain. Этот блок показывает только legacy local notes по выбранному элементу.
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-border bg-panel px-5 py-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Ответить</div>
                        <div className="text-[11px] text-muted">Сообщение добавится в текущее обсуждение.</div>
                      </div>
                      <textarea
                        className="textarea min-h-[88px] w-full text-sm"
                        value={commentDraft}
                        onChange={(event) => {
                          const threadId = text(selectedThread?.id);
                          setCommentDraftByThread((prev) => ({ ...prev, [threadId]: event.target.value }));
                        }}
                        placeholder="Напишите сообщение..."
                        disabled={disabled}
                      />
                      <div className="mt-3 flex items-center justify-end gap-3">
                        <button type="button" className="primaryBtn smallBtn" onClick={addComment} disabled={busy.startsWith("comment:") || !text(commentDraft)}>
                          {busy.startsWith("comment:") ? "Отправляем..." : "Отправить"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex min-h-full flex-1 items-center justify-center bg-bg/15 p-8 text-center">
                  <div className="max-w-md rounded-3xl border border-dashed border-border bg-panel/70 px-6 py-8">
                    <div className="text-lg font-black text-fg">Выберите обсуждение</div>
                    <div className="mt-2 text-sm leading-relaxed text-muted">
                      Справа можно найти существующую заметку, а через кнопку «Создать заметку» начать новую.
                    </div>
                  </div>
                </div>
              )}
            </section>

            <aside className="flex min-h-0 flex-col bg-bg/35 p-3">
              <div className="rounded-2xl border border-border bg-panel/90 p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Обсуждения</div>
                    <div className="truncate text-[11px] text-muted">{loading ? "Обновляем..." : `${visibleThreads.length} из ${displayThreads.length}`}</div>
                  </div>
                  <button
                    type="button"
                    className={`primaryBtn tinyBtn h-8 px-2.5 text-[11px] ${createOpen ? "ring-1 ring-sky-300" : ""}`}
                    onClick={() => setCreateOpen((prev) => !prev)}
                    disabled={disabled}
                  >
                    Создать заметку
                  </button>
                </div>

                <div className="mt-2 grid gap-2">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      type="search"
                      className="input h-8 min-h-0 text-xs"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Поиск"
                      aria-label="Поиск по обсуждениям"
                    />
                    <button type="button" className="secondaryBtn tinyBtn h-8 px-2.5 text-[11px]" onClick={fetchThreads} disabled={loading}>
                      {loading ? "..." : "↻"}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      className="select h-8 min-h-0 text-[11px]"
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                      aria-label="Фильтр по статусу"
                    >
                      {STATUS_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                    <select
                      className="select h-8 min-h-0 text-[11px]"
                      value={scopeFilter}
                      onChange={(event) => setScopeFilter(event.target.value)}
                      aria-label="Фильтр по контексту"
                    >
                      {CONTEXT_FILTER_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                    <select
                      className="select h-8 min-h-0 text-[11px]"
                      value={sortOrder}
                      onChange={(event) => setSortOrder(event.target.value)}
                      aria-label="Порядок сортировки"
                    >
                      {SORT_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  {scopeFilter === "selected_element" && !canUseSelectedElementScope ? (
                    <div className="rounded-xl border border-border bg-bg/60 px-2.5 py-2 text-[11px] text-muted">
                      Сначала выберите BPMN-элемент на диаграмме.
                    </div>
                  ) : null}
                </div>
              </div>

              {createOpen ? (
                <div className="mt-2 rounded-2xl border border-sky-200 bg-sky-50/70 p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-fg">Новая заметка</div>
                      <div className="mt-1 text-[11px] text-muted">Контекст остаётся меткой, а не отдельным режимом работы.</div>
                    </div>
                    <button type="button" className="secondaryBtn tinyBtn h-8 px-2.5 text-[11px]" onClick={() => setCreateOpen(false)}>
                      Скрыть
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <label className="grid gap-1 text-[11px] font-semibold text-muted">
                      <span>Относится к</span>
                      <select
                        className="select h-8 min-h-0 text-[11px]"
                        value={createScope}
                        onChange={(event) => setCreateScope(event.target.value)}
                      >
                        {createScopeOptions.map((item) => (
                          <option key={item.value} value={item.value} disabled={item.disabled}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                    <div className="text-[11px] text-muted">
                      {(createScopeOptions.find((item) => item.value === createScope) || {}).helper || "Выберите контекст заметки"}
                    </div>
                    <textarea
                      className="textarea min-h-[74px] w-full text-sm"
                      value={createDraft}
                      onChange={(event) => setCreateDraftByScope((prev) => ({ ...prev, [createScope]: event.target.value }))}
                      placeholder={createScope === "diagram_element" && selectedElementId ? `О чём важно написать по элементу ${selectedElementName}?` : "О чём эта заметка?"}
                      disabled={disabled || !canCreateCurrentScope}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" className="secondaryBtn tinyBtn h-8 px-2.5 text-[11px]" onClick={() => setCreateOpen(false)}>
                        Отмена
                      </button>
                      <button
                        type="button"
                        className="primaryBtn tinyBtn h-8 px-2.5 text-[11px]"
                        onClick={createThread}
                        disabled={busy === "create" || !text(createDraft) || !canCreateCurrentScope}
                      >
                        {busy === "create" ? "Создаём..." : "Создать заметку"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-2 min-h-0 flex-1 overflow-auto pr-1">
                {visibleThreads.length ? (
                  <div className="grid gap-2">
                    {visibleThreads.map((thread) => {
                      const threadId = text(thread?.id);
                      const active = threadId === text(selectedThread?.id);
                      const meta = scopeMeta(thread);
                      return (
                        <button
                          key={threadId}
                          type="button"
                          className={`rounded-2xl border px-3 py-2.5 text-left transition ${active ? "border-sky-400 bg-sky-500/10 shadow-sm" : "border-border bg-panel/85 hover:border-sky-300 hover:bg-white"}`}
                          onClick={() => setSelectedThreadId(threadId)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="line-clamp-2 text-[13px] font-black leading-snug text-fg">{threadTitle(thread)}</div>
                              <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">{threadPreview(thread)}</div>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${threadStatusTone(thread)}`}>
                              {threadStatusLabel(thread)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                            <span className="rounded-full border border-sky-300/80 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-950">
                              {meta.short}
                            </span>
                            <span>{formatDate(threadUpdatedAt(thread)) || "сейчас"}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-panel/70 p-4 text-sm text-muted">
                    {loading ? "Загружаем обсуждения..." : "По текущим фильтрам ничего не найдено."}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </>
  );
}
