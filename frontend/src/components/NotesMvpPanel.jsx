import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  apiAcknowledgeNoteThreadAttention,
  apiAddNoteThreadComment,
  apiCreateNoteThread,
  apiListMentionableUsers,
  apiListNoteThreads,
  apiMarkNoteThreadRead,
  apiPatchNoteThread,
} from "../lib/api";
import {
  buildLegacyElementBridgeThread,
  injectLegacyBridgeThread,
} from "../features/notes/legacyNotesBridge.js";
import {
  formatTemplateNoteText,
  getNoteTemplatePreset,
} from "../features/notes/knowledgeTools.js";
import {
  buildDiscussionNotificationBuckets,
} from "../features/notes/discussionNotificationModel.js";
import {
  countParticipatedThreads,
  isThreadParticipatedByCurrentUser,
} from "../features/notes/participatedThreads.js";
import {
  detectMentionQuery,
  filterMentionSuggestions,
  insertMentionText,
  mentionSecondaryLabel,
  mentionUserIdsForSubmit,
  pruneSelectedMentions,
} from "../features/notes/mentionAutocomplete.js";
import { readableBpmnText } from "../features/process/bpmn/bpmnIdentity";
import NotesAggregateBadge from "./NotesAggregateBadge.jsx";
import { useSessionNoteAggregate } from "../lib/sessionNoteAggregates.js";

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

const PRIORITY_OPTIONS = [
  { value: "low", label: "Низкий", shortLabel: "Низкий", tone: "border-slate-300 bg-slate-50 text-slate-700 dark:border-borderStrong dark:bg-bgSoft dark:text-muted" },
  { value: "normal", label: "Обычный", shortLabel: "Обычный", tone: "border-border bg-bg/70 text-muted" },
  { value: "high", label: "Высокий", shortLabel: "Высокий", tone: "border-orange-300 bg-orange-50 text-orange-900 dark:border-warning/55 dark:bg-warning/10 dark:text-warning" },
];

function text(value) {
  return String(value || "").trim();
}

function logDiscussionFocusDiag(event, payload = {}) {
  try {
    // eslint-disable-next-line no-console
    console.info("[DISCUSSION_FOCUS_DIAG]", event, payload);
  } catch {
  }
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
    const label = readableBpmnLabel(ref.element_name, ref.elementName, ref.element_title, ref.elementTitle);
    return {
      short: "Элемент",
      long: label || "Элемент BPMN",
      relation: label || "Элемент BPMN",
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

function linkedElementContext(thread) {
  if (text(thread?.scope_type) !== "diagram_element") return null;
  const ref = scopeRef(thread);
  const elementId = text(ref.element_id || ref.elementId);
  if (!elementId) return null;
  return {
    elementId,
    elementName: readableBpmnLabel(ref.element_name, ref.elementName, ref.element_title, ref.elementTitle),
    elementType: text(ref.element_type || ref.elementType),
  };
}

function isLegacyBridgeThread(thread) {
  return Boolean(thread?.legacy_bridge);
}

function statusLabel(status) {
  return text(status) === "resolved" ? "Закрыто" : "Открыто";
}

function statusTone(status) {
  return text(status) === "resolved"
    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-success/55 dark:bg-success/10 dark:text-success"
    : "border-sky-300 bg-sky-50 text-sky-900 dark:border-info/55 dark:bg-info/10 dark:text-info";
}

function threadStatusLabel(thread) {
  return isLegacyBridgeThread(thread) ? "Legacy" : statusLabel(thread?.status);
}

function threadStatusTone(thread) {
  return isLegacyBridgeThread(thread)
    ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-warning/55 dark:bg-warning/10 dark:text-warning"
    : statusTone(thread?.status);
}

function threadPriority(thread) {
  const value = text(thread?.priority).toLowerCase();
  return PRIORITY_OPTIONS.some((item) => item.value === value) ? value : "normal";
}

function priorityMeta(thread) {
  return PRIORITY_OPTIONS.find((item) => item.value === threadPriority(thread)) || PRIORITY_OPTIONS[1];
}

function requiresAttention(thread) {
  return thread?.requires_attention === true || thread?.requires_attention === 1 || thread?.requires_attention === "1";
}

function unreadCount(thread) {
  const value = Number(thread?.unread_count || 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function attentionAcknowledged(thread) {
  return thread?.attention_acknowledged_by_me === true || numericTime(thread?.attention_acknowledged_at) > 0;
}

function attentionMeta(thread) {
  if (!requiresAttention(thread)) {
    return {
      label: "Без срочного внимания",
      shortLabel: "Спокойно",
      tone: "border-border bg-bg/70 text-muted",
    };
  }
  if (attentionAcknowledged(thread)) {
    return {
      label: "Внимание подтверждено вами",
      shortLabel: "Подтверждено",
      tone: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-success/55 dark:bg-success/10 dark:text-success",
    };
  }
  return {
    label: "Требует внимания",
    shortLabel: "Внимание",
    tone: "border-rose-300 bg-rose-50 text-rose-900 dark:border-danger/55 dark:bg-danger/10 dark:text-danger",
  };
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

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value));
}

function isTechnicalId(value) {
  const raw = text(value);
  if (!raw || isLikelyEmail(raw)) return false;
  if (/^[a-f0-9]{10,}$/i.test(raw.replace(/-/g, ""))) return true;
  if (/^(user|usr|auth|google|github|oidc|saml|local)[_:.-][A-Za-z0-9_.:-]{8,}$/i.test(raw)) return true;
  return raw.length > 22 && !/\s/.test(raw);
}

function readableBpmnLabel(...values) {
  return readableBpmnText(...values);
}

function shortTechnicalId(value) {
  const raw = text(value).replace(/-/g, "");
  if (!raw) return "";
  return raw.length > 8 ? `${raw.slice(0, 6)}...${raw.slice(-2)}` : raw;
}

function profileIdentityLabel(...values) {
  for (const value of values) {
    const label = text(value);
    if (label) return label;
  }
  return "";
}

function setUserLabel(out, userId, ...values) {
  const uid = text(userId);
  const label = profileIdentityLabel(...values);
  if (uid && label) out[uid] = label;
}

function authorLabel(value, userLabels = {}, viewerUserId = "") {
  const raw = text(value);
  const viewer = text(viewerUserId);
  if (!raw) return "Автор не указан";
  const mapped = text(userLabels[raw]);
  if (mapped) return mapped;
  if (viewer && raw === viewer) return "Вы";
  if (isTechnicalId(raw)) return "Пользователь";
  return raw;
}

function lastComment(thread) {
  const comments = asArray(thread?.comments);
  return comments.length ? comments[comments.length - 1] : null;
}

function threadCreatorLabel(thread, userLabels = {}, viewerUserId = "") {
  return authorLabel(thread?.created_by || firstComment(thread)?.author_user_id, userLabels, viewerUserId);
}

function threadLastAuthorLabel(thread, userLabels = {}, viewerUserId = "") {
  return authorLabel(lastComment(thread)?.author_user_id || thread?.created_by, userLabels, viewerUserId);
}

function firstMentionLabel(thread, userLabels = {}, viewerUserId = "") {
  for (const comment of asArray(thread?.comments)) {
    const mention = asArray(comment?.mentions)[0];
    if (!mention) continue;
    return text(mention?.mentioned_label)
      || authorLabel(mention?.mentioned_user_id, userLabels, viewerUserId);
  }
  return "";
}

function authorInitials(value) {
  const label = text(value) || "Автор";
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
      element_name: readableBpmnLabel(selectedElement?.name),
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

function emitNoteMentionsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("processmap:note-mentions-changed"));
}

const NotesMvpPanel = forwardRef(function NotesMvpPanel({
  sessionId,
  sessionTitle = "",
  selectedElement = null,
  legacyElementNotesMap = null,
  onAddLegacyElementNote = null,
  disabled = false,
  externalOpenRequest = null,
  onOpenChange = null,
  onFocusNotificationTarget = null,
  onFocusLinkedElement = null,
  currentUserId = "",
}, ref) {
  const sid = text(sessionId);
  const viewerUserId = text(currentUserId);
  const selectedElementId = text(selectedElement?.id);
  const selectedElementName = readableBpmnLabel(selectedElement?.name) || "Элемент BPMN";
  const selectedElementType = text(selectedElement?.type);

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("open");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [participationFilter, setParticipationFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [threads, setThreads] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [focusedCommentId, setFocusedCommentId] = useState("");
  const [panelMode, setPanelMode] = useState("discussions");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [createScope, setCreateScope] = useState("session");
  const [createPriority, setCreatePriority] = useState("normal");
  const [createRequiresAttention, setCreateRequiresAttention] = useState(false);
  const [createSubjectByScope, setCreateSubjectByScope] = useState({
    diagram_element: "",
    diagram: "",
    session: "",
  });
  const [createDetailsByScope, setCreateDetailsByScope] = useState({
    diagram_element: "",
    diagram: "",
    session: "",
  });
  const [commentDraftByThread, setCommentDraftByThread] = useState({});
  const [legacyDraftByThread, setLegacyDraftByThread] = useState({});
  const aggregate = useSessionNoteAggregate(sid);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mentionableUsers, setMentionableUsers] = useState([]);
  const [createMentionComposer, setCreateMentionComposer] = useState({ selected: [], active: null, highlightedIndex: 0 });
  const [commentMentionByThread, setCommentMentionByThread] = useState({});
  const panelRef = useRef(null);
  const createDetailsRef = useRef(null);
  const commentDraftRef = useRef(null);
  const markReadInFlightRef = useRef(new Set());

  const createSubject = createSubjectByScope[createScope] || "";
  const createDetails = createDetailsByScope[createScope] || "";
  const canUseSelectedElementScope = !!selectedElementId;
  const canCreateCurrentScope = createScope !== "diagram_element" || canUseSelectedElementScope;
  const createSubjectPlaceholder = createScope === "diagram_element" && selectedElementId
    ? `Коротко сформулируйте вопрос по элементу ${selectedElementName}`
    : "Коротко сформулируйте вопрос";
  const createDetailsPlaceholder = "Добавьте детали, факты или ожидаемое решение";

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

  const createContextSummary = useMemo(() => {
    const selected = createScopeOptions.find((item) => item.value === createScope) || createScopeOptions[0];
    const label = text(selected?.label || "Общий вопрос");
    const helper = text(selected?.helper || "");
    return helper ? `${label}. ${helper}` : label;
  }, [createScope, createScopeOptions]);

  const selectedTemplate = useMemo(
    () => getNoteTemplatePreset(selectedElementType),
    [selectedElementType],
  );

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
  const authorLabelsById = useMemo(() => {
    const out = {};
    for (const item of asArray(mentionableUsers)) {
      const userId = text(item?.user_id);
      if (!userId) continue;
      setUserLabel(out, userId, item?.full_name, item?.label, item?.email);
    }
    for (const thread of asArray(displayThreads)) {
      setUserLabel(out, thread?.created_by, thread?.created_by_full_name, thread?.created_by_email);
      setUserLabel(out, thread?.resolved_by, thread?.resolved_by_full_name, thread?.resolved_by_email);
      for (const comment of asArray(thread?.comments)) {
        setUserLabel(out, comment?.author_user_id, comment?.author_full_name, comment?.author_email);
        for (const mention of asArray(comment?.mentions)) {
          setUserLabel(out, mention?.mentioned_user_id, mention?.mentioned_label);
        }
      }
    }
    return out;
  }, [displayThreads, mentionableUsers]);
  const notificationMode = panelMode === "notifications";
  const notificationBuckets = useMemo(
    () => buildDiscussionNotificationBuckets(threads, { currentUserId: viewerUserId }),
    [threads, viewerUserId],
  );
  const participatedThreadsCount = useMemo(
    () => countParticipatedThreads(displayThreads, viewerUserId),
    [displayThreads, viewerUserId],
  );

  const visibleThreads = useMemo(() => {
    const query = text(searchQuery).toLowerCase();
    const filtered = asArray(displayThreads).filter((thread) => {
      if (participationFilter === "my" && !isThreadParticipatedByCurrentUser(thread, viewerUserId)) {
        return false;
      }
      if (!query) return true;
      return threadSearchText(thread).includes(query);
    });
    filtered.sort((left, right) => {
      const delta = threadUpdatedAt(right) - threadUpdatedAt(left);
      return sortOrder === "oldest" ? -delta : delta;
    });
    return filtered;
  }, [displayThreads, participationFilter, searchQuery, sortOrder, viewerUserId]);

  const selectedThread = useMemo(() => {
    return visibleThreads.find((item) => text(item?.id) === selectedThreadId) || visibleThreads[0] || null;
  }, [selectedThreadId, visibleThreads]);
  const selectedThreadIsLegacyBridge = isLegacyBridgeThread(selectedThread);
  const selectedThreadLinkedElement = useMemo(() => linkedElementContext(selectedThread), [selectedThread]);

  const commentDraft = commentDraftByThread[text(selectedThread?.id)] || "";
  const commentMentionComposer = commentMentionByThread[text(selectedThread?.id)] || { selected: [], active: null, highlightedIndex: 0 };
  const legacyDraft = legacyDraftByThread[text(selectedThread?.id)] || "";
  const openThreadsCount = Math.max(0, Number(aggregate?.open_notes_count || 0) || 0);
  const activeFilterCount = Number(statusFilter !== "open") + Number(scopeFilter !== "all") + Number(participationFilter !== "all") + Number(sortOrder !== "newest");
  const discussionSummaryLine = useMemo(() => {
    if (notificationMode) {
      const activeCount = notificationBuckets.activeTotal;
      const historyCount = notificationBuckets.historyTotal;
      return [
        text(sessionTitle) || "Сессия",
        `${activeCount} активных`,
        `${historyCount} недавних`,
      ].join(" · ");
    }
    const parts = [
      text(sessionTitle) || "Сессия",
      `${openThreadsCount} открытых`,
      `${displayThreads.length} тем`,
    ];
    if (visibleThreads.length !== displayThreads.length) {
      parts.push(`показано ${visibleThreads.length}`);
    }
    return parts.join(" · ");
  }, [displayThreads.length, notificationBuckets.activeTotal, notificationBuckets.historyTotal, notificationMode, openThreadsCount, sessionTitle, visibleThreads.length]);
  const createMentionSuggestions = useMemo(
    () => filterMentionSuggestions(mentionableUsers, createMentionComposer.active?.query || "", createMentionComposer.selected),
    [createMentionComposer.active?.query, createMentionComposer.selected, mentionableUsers],
  );
  const commentMentionSuggestions = useMemo(
    () => filterMentionSuggestions(mentionableUsers, commentMentionComposer.active?.query || "", commentMentionComposer.selected),
    [commentMentionComposer.active?.query, commentMentionComposer.selected, mentionableUsers],
  );

  function focusTextareaAt(ref, caretIndex) {
    window.requestAnimationFrame?.(() => {
      const node = ref?.current;
      if (!node || typeof node.focus !== "function") return;
      node.focus();
      if (typeof node.setSelectionRange === "function") {
        node.setSelectionRange(caretIndex, caretIndex);
      }
    });
  }

  function updateCreateDetails(nextValue, caretIndex) {
    setCreateDetailsByScope((prev) => ({ ...prev, [createScope]: nextValue }));
    setCreateMentionComposer((prev) => ({
      selected: pruneSelectedMentions(nextValue, prev.selected),
      active: detectMentionQuery(nextValue, caretIndex),
      highlightedIndex: 0,
    }));
  }

  function updateCommentDraft(threadId, nextValue, caretIndex) {
    const tid = text(threadId);
    if (!tid) return;
    setCommentDraftByThread((prev) => ({ ...prev, [tid]: nextValue }));
    setCommentMentionByThread((prev) => {
      const current = prev[tid] || { selected: [], active: null, highlightedIndex: 0 };
      return {
        ...prev,
        [tid]: {
          selected: pruneSelectedMentions(nextValue, current.selected),
          active: detectMentionQuery(nextValue, caretIndex),
          highlightedIndex: 0,
        },
      };
    });
  }

  function selectCreateMention(user) {
    const caret = createDetailsRef.current?.selectionStart ?? createDetails.length;
    const result = insertMentionText(createDetails, createMentionComposer.active, user, caret);
    if (!result.mention) return;
    setCreateDetailsByScope((prev) => ({ ...prev, [createScope]: result.text }));
    setCreateMentionComposer((prev) => ({
      selected: pruneSelectedMentions(result.text, [...asArray(prev.selected), result.mention]),
      active: null,
      highlightedIndex: 0,
    }));
    focusTextareaAt(createDetailsRef, result.caretIndex);
  }

  function selectCommentMention(user) {
    const threadId = text(selectedThread?.id);
    if (!threadId) return;
    const caret = commentDraftRef.current?.selectionStart ?? commentDraft.length;
    const result = insertMentionText(commentDraft, commentMentionComposer.active, user, caret);
    if (!result.mention) return;
    setCommentDraftByThread((prev) => ({ ...prev, [threadId]: result.text }));
    setCommentMentionByThread((prev) => {
      const current = prev[threadId] || { selected: [], active: null, highlightedIndex: 0 };
      return {
        ...prev,
        [threadId]: {
          selected: pruneSelectedMentions(result.text, [...asArray(current.selected), result.mention]),
          active: null,
          highlightedIndex: 0,
        },
      };
    });
    focusTextareaAt(commentDraftRef, result.caretIndex);
  }

  function handleMentionKeyDown(event, composer, suggestions, setComposer, onSelect) {
    if (!composer?.active || !asArray(suggestions).length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setComposer((prev) => ({
        ...prev,
        highlightedIndex: (Number(prev?.highlightedIndex || 0) + 1) % suggestions.length,
      }));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setComposer((prev) => ({
        ...prev,
        highlightedIndex: (Number(prev?.highlightedIndex || 0) - 1 + suggestions.length) % suggestions.length,
      }));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onSelect(suggestions[Math.max(0, Math.min(Number(composer.highlightedIndex || 0), suggestions.length - 1))]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setComposer((prev) => ({ ...prev, active: null, highlightedIndex: 0 }));
    }
  }

  function setCommentComposerForSelected(updater) {
    const threadId = text(selectedThread?.id);
    if (!threadId) return;
    setCommentMentionByThread((prev) => {
      const current = prev[threadId] || { selected: [], active: null, highlightedIndex: 0 };
      return { ...prev, [threadId]: updater(current) };
    });
  }

  function renderMentionSuggestions(kind, composer, suggestions, onSelect, placement = "below") {
    if (!composer?.active || !asArray(suggestions).length) return null;
    const activeIndex = Math.max(0, Math.min(Number(composer.highlightedIndex || 0), suggestions.length - 1));
    const placementClass = placement === "above" ? "bottom-full mb-1" : "top-full mt-1";
    return (
      <div
        className={`absolute left-0 right-0 ${placementClass} z-[95] max-h-56 overflow-auto rounded-xl border border-border bg-panel p-1 shadow-xl`}
        role="listbox"
        data-testid={`notes-${kind}-mention-suggestions`}
      >
        {suggestions.map((item, index) => {
          const secondary = mentionSecondaryLabel(item);
          return (
            <button
              key={text(item.user_id)}
              type="button"
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm ${index === activeIndex ? "bg-info/10 text-info" : "text-fg hover:bg-bg/70"}`}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(item);
              }}
              role="option"
              aria-selected={index === activeIndex}
              data-testid={`notes-${kind}-mention-option`}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">@{text(item.label)}</span>
                {secondary ? <span className="block truncate text-[11px] text-muted">{secondary}</span> : null}
              </span>
              {text(item.job_title) ? <span className="max-w-[150px] truncate text-[11px] text-muted">{text(item.job_title)}</span> : null}
            </button>
          );
        })}
      </div>
    );
  }

  const fetchMentionableUsers = useCallback(async () => {
    if (!sid || !open) {
      setMentionableUsers([]);
      return;
    }
    const result = await apiListMentionableUsers(sid);
    if (result?.ok) {
      setMentionableUsers(asArray(result.items));
    }
  }, [open, sid]);

  const fetchThreads = useCallback(async (options = {}) => {
    if (!sid || !open) return;
    setLoading(true);
    setError("");
    const preferredThreadId = text(options?.preferredThreadId);
    if (!notificationMode && scopeFilter === "selected_element" && !selectedElementId) {
      setThreads([]);
      setSelectedThreadId("");
      setLoading(false);
      return;
    }
    const filters = {
      status: notificationMode || statusFilter === "all" ? "" : statusFilter,
      scopeType: notificationMode || scopeFilter === "all" ? "" : (scopeFilter === "selected_element" ? "diagram_element" : scopeFilter),
      elementId: notificationMode ? "" : (scopeFilter === "selected_element" ? selectedElementId : ""),
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
  }, [notificationMode, open, scopeFilter, selectedElementId, sid, statusFilter]);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    void fetchMentionableUsers();
  }, [fetchMentionableUsers]);

  useEffect(() => {
    setThreads([]);
    setSelectedThreadId("");
    setFocusedCommentId("");
    setPanelMode("discussions");
    setError("");
    setCreateOpen(false);
    setMentionableUsers([]);
    setCreateMentionComposer({ selected: [], active: null, highlightedIndex: 0 });
    setCommentMentionByThread({});
  }, [sid]);

  const applyExternalOpenRequest = useCallback((requestLike) => {
    const request = requestLike && typeof requestLike === "object" ? requestLike : null;
    if (!sid || !request?.requestKey) return false;
    const nextScopeFilter = text(request.scopeFilter);
    const nextMode = text(request.mode) === "notifications" ? "notifications" : "discussions";
    const nextThreadId = text(request.threadId || request.thread_id);
    const nextCommentId = text(request.commentId || request.comment_id);
    setOpen(true);
    setPanelMode(nextMode);
    setCreateOpen(false);
    setError("");
    setSearchQuery("");
    setParticipationFilter("all");
    if (nextMode === "notifications") {
      setStatusFilter("all");
      setScopeFilter("all");
      setFiltersOpen(false);
    } else if (nextScopeFilter) {
      setScopeFilter(nextScopeFilter);
    }
    setSelectedThreadId(nextThreadId);
    setFocusedCommentId(nextCommentId);
    return true;
  }, [sid]);

  useEffect(() => {
    if (!focusedCommentId || !selectedThread) return undefined;
    const timer = window.setTimeout(() => {
      const root = panelRef.current;
      const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(focusedCommentId)
        : focusedCommentId.replace(/"/g, '\\"');
      const target = root?.querySelector?.(`[data-note-comment-id="${escaped}"]`);
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusedCommentId, selectedThread]);

  const clearThreadUnread = useCallback((threadId, result = {}) => {
    const tid = text(threadId);
    if (!tid) return;
    const lastReadAt = Number(result?.lastReadAt || result?.last_read_at || 0) || 0;
    setThreads((prev) => asArray(prev).map((thread) => (
      text(thread?.id) === tid
        ? {
          ...thread,
          unread_count: 0,
          last_read_at: lastReadAt || Number(thread?.last_read_at || 0) || Number(threadUpdatedAt(thread) || 0),
        }
        : thread
    )));
  }, []);

  useEffect(() => {
    if (!open || selectedThreadIsLegacyBridge || disabled) return undefined;
    const threadId = text(selectedThread?.id);
    if (!threadId || unreadCount(selectedThread) <= 0) return undefined;
    if (markReadInFlightRef.current.has(threadId)) return undefined;
    markReadInFlightRef.current.add(threadId);
    let cancelled = false;
    apiMarkNoteThreadRead(threadId)
      .then((result) => {
        if (!cancelled && result?.ok) {
          clearThreadUnread(threadId, result);
        }
      })
      .catch(() => {
        // Keep the badge until the next successful refresh/read acknowledgement.
      })
      .finally(() => {
        markReadInFlightRef.current.delete(threadId);
      });
    return () => {
      cancelled = true;
    };
  }, [clearThreadUnread, disabled, open, selectedThread, selectedThreadIsLegacyBridge]);

  useImperativeHandle(ref, () => ({
    openFromExternalRequest(request) {
      return applyExternalOpenRequest(request);
    },
  }), [applyExternalOpenRequest]);

  useEffect(() => {
    applyExternalOpenRequest(externalOpenRequest);
  }, [applyExternalOpenRequest, externalOpenRequest]);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest?.("[data-notes-panel-trigger='true']")) return;
      setOpen(false);
      setCreateOpen(false);
    }
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  function openPanel() {
    setOpen(true);
    setPanelMode("discussions");
    setCreateOpen(false);
  }

  async function openNotificationItem(item) {
    const notification = item && typeof item === "object" ? item : {};
    const threadId = text(notification.threadId);
    if (!threadId) return;
    setCreateOpen(false);
    setPanelMode("notifications");
    setStatusFilter("all");
    setScopeFilter("all");
    setSelectedThreadId(threadId);
    setFocusedCommentId(text(notification.commentId));
    if (text(notification.targetElementId)) {
      onFocusNotificationTarget?.({
        element_id: text(notification.targetElementId),
        element_name: text(notification.sourceLabel),
        scope_type: text(notification.scopeType),
        thread_id: threadId,
        comment_id: text(notification.commentId),
      });
    }
    if (notification.state !== "active" || disabled) return;
    setBusy(`ack:${threadId}`);
    setError("");
    const result = await apiAcknowledgeNoteThreadAttention(threadId);
    if (!result.ok) {
      setError(errorText(result, "Не удалось подтвердить внимание."));
      setBusy("");
      return;
    }
    await fetchThreads({ preferredThreadId: threadId });
    emitNotesAggregateChanged(sid);
    setBusy("");
  }

  async function focusSelectedThreadLinkedElement() {
    const threadId = text(selectedThread?.id);
    const target = linkedElementContext(selectedThread);
    setError("");
    if (!target?.elementId) {
      logDiscussionFocusDiag("panel-click-missing-target", { threadId });
      setError("Элемент больше не найден на схеме.");
      return;
    }
    logDiscussionFocusDiag("panel-click", {
      threadId,
      elementId: target.elementId,
      elementName: target.elementName,
      elementType: target.elementType,
    });
    const result = await Promise.resolve(onFocusLinkedElement?.({
      element_id: target.elementId,
      element_name: target.elementName,
      element_type: target.elementType,
      scope_type: "diagram_element",
      thread_id: threadId,
    }));
    logDiscussionFocusDiag("panel-result", {
      threadId,
      elementId: target.elementId,
      result,
    });
    if (result !== true && result?.ok !== true) {
      setError("Элемент больше не найден на схеме.");
      return;
    }
    setOpen(false);
    setCreateOpen(false);
  }

  function renderNotificationList(items, emptyText) {
    const list = asArray(items);
    if (!list.length) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-bg/50 px-3 py-2 text-[11px] leading-relaxed text-muted">
          {emptyText}
        </div>
      );
    }
    return (
      <div className="grid gap-1.5">
        {list.map((item) => {
          const active = text(item.threadId) === text(selectedThread?.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`rounded-xl border px-2.5 py-2 text-left transition ${active ? "border-danger/50 bg-danger/10" : "border-border/80 bg-panel/80 hover:border-danger/45 hover:bg-panel2/80"}`}
              onClick={() => void openNotificationItem(item)}
              data-testid={`discussion-notification-${item.state}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-[12px] font-semibold leading-snug text-fg">{item.title}</div>
                  <div className="mt-1 truncate text-[11px] text-muted">{item.sourceLabel || "Обсуждение"}</div>
                </div>
                <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${item.state === "active" ? "border-danger/50 bg-danger/10 text-danger" : "border-success/50 bg-success/10 text-success"}`}>
                  {item.state === "active" ? "Требует внимания" : "Недавнее"}
                </span>
              </div>
              <div className="mt-1.5 text-[10px] text-muted">
                {formatDate(item.updatedAt) || "сейчас"}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  async function createThread() {
    if (!sid || disabled) return;
    const subject = text(createSubject);
    const details = text(createDetails);
    if (!subject) return;
    if (!canCreateCurrentScope) {
      setError("Для обсуждения по элементу сначала выберите BPMN-элемент.");
      return;
    }
    const scopeKey = createScope;
    setBusy("create");
    setError("");
    const createMentionUserIds = mentionUserIdsForSubmit(details, createMentionComposer.selected);
    const result = await apiCreateNoteThread(sid, {
      scope_type: scopeKey,
      scope_ref: buildScopeRef(scopeKey, selectedElement),
      priority: createPriority,
      requires_attention: createRequiresAttention,
      mention_user_ids: createMentionUserIds,
      body: details ? `${subject}\n\n${details}` : subject,
    });
    if (!result.ok) {
      setError(errorText(result, "Не удалось создать обсуждение."));
      setBusy("");
      return;
    }
    const nextThreadId = text(result.thread?.id);
    setCreateSubjectByScope((prev) => ({ ...prev, [scopeKey]: "" }));
    setCreateDetailsByScope((prev) => ({ ...prev, [scopeKey]: "" }));
    setCreatePriority("normal");
    setCreateRequiresAttention(false);
    setCreateMentionComposer({ selected: [], active: null, highlightedIndex: 0 });
    setCreateOpen(false);
    setSelectedThreadId(nextThreadId);
    await fetchThreads({ preferredThreadId: nextThreadId });
    emitNotesAggregateChanged(sid);
    emitNoteMentionsChanged();
    setCreateSubjectByScope((prev) => (prev[scopeKey] ? { ...prev, [scopeKey]: "" } : prev));
    setCreateDetailsByScope((prev) => (prev[scopeKey] ? { ...prev, [scopeKey]: "" } : prev));
    setBusy("");
  }

  async function addComment() {
    const threadId = text(selectedThread?.id);
    const body = text(commentDraft);
    if (!threadId || !body || disabled || selectedThreadIsLegacyBridge) return;
    setBusy(`comment:${threadId}`);
    setError("");
    const commentMentionUserIds = mentionUserIdsForSubmit(body, commentMentionComposer.selected);
    const result = await apiAddNoteThreadComment(threadId, {
      body,
      mention_user_ids: commentMentionUserIds,
    });
    if (!result.ok) {
      setError(errorText(result, "Не удалось отправить сообщение."));
      setBusy("");
      return;
    }
    setCommentDraftByThread((prev) => ({ ...prev, [threadId]: "" }));
    setCommentMentionByThread((prev) => ({ ...prev, [threadId]: { selected: [], active: null, highlightedIndex: 0 } }));
    setSelectedThreadId(threadId);
    await fetchThreads({ preferredThreadId: threadId });
    clearThreadUnread(threadId, result);
    emitNotesAggregateChanged(sid);
    emitNoteMentionsChanged();
    setCommentDraftByThread((prev) => (prev[threadId] ? { ...prev, [threadId]: "" } : prev));
    setBusy("");
  }

  async function addLegacyElementNote() {
    const threadId = text(selectedThread?.id);
    const elementId = text(scopeRef(selectedThread).element_id);
    const body = text(legacyDraft);
    if (!threadId || !elementId || !body || disabled || !selectedThreadIsLegacyBridge || typeof onAddLegacyElementNote !== "function") {
      return;
    }
    setBusy(`legacy:${threadId}`);
    setError("");
    const result = await onAddLegacyElementNote(elementId, body);
    if (!result?.ok) {
      setError(errorText(result, "Не удалось сохранить локальную заметку элемента."));
      setBusy("");
      return;
    }
    setLegacyDraftByThread((prev) => ({ ...prev, [threadId]: "" }));
    emitNotesAggregateChanged(sid);
    setBusy("");
  }

  async function insertLegacyTemplateNote() {
    const threadId = text(selectedThread?.id);
    const elementId = text(scopeRef(selectedThread).element_id);
    if (!threadId || !elementId || disabled || !selectedThreadIsLegacyBridge || typeof onAddLegacyElementNote !== "function") {
      return;
    }
    const templateText = formatTemplateNoteText(selectedTemplate, {
      elementName: text(scopeRef(selectedThread).element_name || selectedElementName || elementId),
    });
    setBusy(`legacy:${threadId}`);
    setError("");
    const result = await onAddLegacyElementNote(elementId, templateText);
    if (!result?.ok) {
      setError(errorText(result, "Не удалось вставить шаблон локальной заметки."));
      setBusy("");
      return;
    }
    emitNotesAggregateChanged(sid);
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
    emitNotesAggregateChanged(sid);
    setBusy("");
  }

  async function patchThreadMeta(patch) {
    const threadId = text(selectedThread?.id);
    if (!threadId || disabled || selectedThreadIsLegacyBridge) return;
    setBusy(`meta:${threadId}`);
    setError("");
    const result = await apiPatchNoteThread(threadId, patch);
    if (!result.ok) {
      setError(errorText(result, "Не удалось обновить свойства обсуждения."));
      setBusy("");
      return;
    }
    setSelectedThreadId(threadId);
    await fetchThreads({ preferredThreadId: threadId });
    emitNotesAggregateChanged(sid);
    setBusy("");
  }

  async function acknowledgeAttention() {
    const threadId = text(selectedThread?.id);
    if (!threadId || disabled || selectedThreadIsLegacyBridge || !requiresAttention(selectedThread) || attentionAcknowledged(selectedThread)) return;
    setBusy(`ack:${threadId}`);
    setError("");
    const result = await apiAcknowledgeNoteThreadAttention(threadId);
    if (!result.ok) {
      setError(errorText(result, "Не удалось подтвердить внимание."));
      setBusy("");
      return;
    }
    setSelectedThreadId(threadId);
    await fetchThreads({ preferredThreadId: threadId });
    emitNotesAggregateChanged(sid);
    setBusy("");
  }

  if (!sid) return null;

  return (
    <>
      {!open ? (
        <div className="fixed bottom-5 right-5 z-[86] hidden max-w-[min(92vw,560px)] flex-wrap justify-end gap-2 max-lg:flex lg:hidden">
          <button
            type="button"
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-panel/90 px-3 py-1.5 text-xs font-bold text-fg shadow-panel transition hover:border-info/55 hover:bg-panel2/85 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={openPanel}
            disabled={disabled}
            title="Открыть обсуждения"
            data-notes-panel-trigger="true"
            data-testid="notes-panel-floating-trigger"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-info/10 text-sm text-info" aria-hidden="true">✎</span>
            <span>Обсуждения</span>
            <NotesAggregateBadge aggregate={aggregate} compact compactNumericOnly label="Обсуждения" className="border-border bg-panel2/85 px-1.5 py-0 text-[10px]" />
          </button>
        </div>
      ) : null}

      {open ? (
        <div
          ref={panelRef}
          className="fixed bottom-5 right-5 top-16 z-[88] flex w-[min(1040px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[30px] border border-border bg-panel shadow-panel transition-all duration-200 max-lg:bottom-3 max-lg:right-3 max-lg:w-[calc(100vw-1.5rem)] max-sm:top-14"
        >
          <div className="border-b border-border bg-gradient-to-r from-info/10 via-panel to-panel px-4 py-3.5 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-info/45 bg-info/10 text-[12px] text-info" aria-hidden="true">✎</span>
                  <span className="rounded-full border border-border/80 bg-panel2/75 px-2 py-0.5">
                    {notificationMode ? "Уведомления" : "Обсуждения"}
                  </span>
                </div>
                <div data-testid="notes-summary-line" className="mt-1 truncate text-sm font-medium text-fg">
                  {discussionSummaryLine}
                </div>
              </div>
              <div className="flex items-center gap-2 self-center">
                <button
                  type="button"
                  className={`primaryBtn tinyBtn h-9 px-3 text-xs ${createOpen ? "ring-1 ring-info/35" : ""}`}
                  onClick={() => {
                    setCreateOpen(true);
                    setError("");
                  }}
                  disabled={disabled}
                >
                  + Новое обсуждение
                </button>
                {notificationMode ? (
                  <button
                    type="button"
                    className="secondaryBtn tinyBtn h-9 px-3 text-xs"
                    onClick={() => setPanelMode("discussions")}
                    data-testid="discussion-notifications-back"
                  >
                    Все обсуждения
                  </button>
                ) : (
                  <button
                    type="button"
                    className="secondaryBtn tinyBtn h-9 px-3 text-xs"
                    onClick={() => {
                      setPanelMode("notifications");
                      setStatusFilter("all");
                      setScopeFilter("all");
                      setFiltersOpen(false);
                    }}
                    data-testid="discussion-notifications-open"
                  >
                    @ Уведомления
                  </button>
                )}
                <button
                  type="button"
                  className="secondaryBtn tinyBtn h-9 px-3 text-xs"
                  onClick={() => {
                    setOpen(false);
                    setCreateOpen(false);
                  }}
                  aria-label="Скрыть обсуждения"
                >
                  Скрыть
                </button>
              </div>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(248px,288px)] overflow-hidden max-lg:grid-cols-1">
            <section className="flex min-h-0 flex-col overflow-hidden border-r border-border bg-panel max-lg:border-b max-lg:border-r-0">
              {error ? (
                <div className="mx-4 mt-4 rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error}
                </div>
              ) : null}

              {createOpen ? (
                <div className="flex min-h-0 flex-1 overflow-auto bg-bg/10 px-4 py-4 sm:px-5 sm:py-5">
                  <div className="flex w-full max-w-3xl flex-col self-start rounded-[28px] border border-sky-200 bg-panel shadow-sm">
                    <div className="border-b border-border bg-info/10 px-5 py-4 sm:px-6 sm:py-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-2xl font-black text-fg">Новое обсуждение</div>
                          <div className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                            Создайте тему с понятной сутью, контекстом и первым сообщением.
                          </div>
                        </div>
                        <button type="button" className="secondaryBtn smallBtn" onClick={() => setCreateOpen(false)}>
                          Отмена
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-4 px-5 py-4 sm:px-6 sm:py-5">
                      <label className="grid gap-2">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Суть вопроса</span>
                        <input
                          className="input h-11 min-h-0 w-full text-sm"
                          value={createSubject}
                          onChange={(event) => setCreateSubjectByScope((prev) => ({ ...prev, [createScope]: event.target.value }))}
                          placeholder={createSubjectPlaceholder}
                          disabled={disabled || !canCreateCurrentScope}
                          data-testid="notes-create-subject"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Контекст</span>
                        <select
                          className="select h-11 min-h-0 w-full text-sm"
                          value={createScope}
                          onChange={(event) => setCreateScope(event.target.value)}
                          data-testid="notes-create-context"
                        >
                          {createScopeOptions.map((item) => (
                            <option key={item.value} value={item.value} disabled={item.disabled}>{item.label}</option>
                          ))}
                        </select>
                      </label>
                      <div className="rounded-2xl border border-border bg-bg/40 px-4 py-3 text-sm leading-relaxed text-muted">
                        {createContextSummary}
                      </div>
                      <div className="grid gap-3 rounded-2xl border border-border bg-bg/30 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                        <label className="grid gap-2">
                          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Приоритет</span>
                          <select
                            className="select h-10 min-h-0 w-full text-sm"
                            value={createPriority}
                            onChange={(event) => setCreatePriority(event.target.value)}
                            data-testid="notes-create-priority"
                          >
                            {PRIORITY_OPTIONS.map((item) => (
                              <option key={item.value} value={item.value}>{item.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-panel px-3 text-sm text-fg">
                          <input
                            type="checkbox"
                            checked={createRequiresAttention}
                            onChange={(event) => setCreateRequiresAttention(event.target.checked)}
                            data-testid="notes-create-attention"
                          />
                          <span className="grid leading-tight">
                            <span>Требует внимания</span>
                            <span className="text-[11px] text-muted">Подсветить как требующее реакции</span>
                          </span>
                        </label>
                      </div>
                      <div className="grid gap-2">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Описание</span>
                        <span className="relative">
                          <textarea
                            ref={createDetailsRef}
                            className="textarea min-h-[140px] w-full text-sm leading-relaxed"
                            value={createDetails}
                            onChange={(event) => updateCreateDetails(event.target.value, event.target.selectionStart)}
                            onKeyDown={(event) => handleMentionKeyDown(event, createMentionComposer, createMentionSuggestions, setCreateMentionComposer, selectCreateMention)}
                            placeholder={createDetailsPlaceholder}
                            disabled={disabled || !canCreateCurrentScope}
                            data-testid="notes-create-details"
                          />
                          {renderMentionSuggestions("create", createMentionComposer, createMentionSuggestions, selectCreateMention)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-muted">
                          {createScope === "diagram_element" && !canCreateCurrentScope
                            ? "Для обсуждения по элементу сначала выберите BPMN-элемент на диаграмме."
                            : "Тема будет создана в обсуждениях текущей сессии."}
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" className="secondaryBtn smallBtn" onClick={() => setCreateOpen(false)}>
                            Отмена
                          </button>
                          <button
                            type="button"
                            className="primaryBtn smallBtn"
                            onClick={createThread}
                            disabled={busy === "create" || !text(createSubject) || !canCreateCurrentScope}
                          >
                            {busy === "create" ? "Создаём..." : "Создать обсуждение"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : selectedThread ? (
                <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr_auto] overflow-hidden">
                  <div className="border-b border-border bg-panel/95 px-4 py-3.5 sm:px-5 sm:py-4">
                    <div className="flex items-start justify-between gap-4 max-sm:flex-col">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                          <span className="font-medium text-fg/75">{scopeMeta(selectedThread).short}</span>
                          <span className={`rounded-full border px-2 py-0.5 font-semibold ${threadStatusTone(selectedThread)}`}>
                            {threadStatusLabel(selectedThread)}
                          </span>
                          {requiresAttention(selectedThread) ? (
                            <span className={`rounded-full border px-2 py-0.5 font-semibold ${attentionMeta(selectedThread).tone}`}>
                              {attentionMeta(selectedThread).label}
                            </span>
                          ) : null}
                          {threadPriority(selectedThread) === "high" ? (
                            <span className={`rounded-full border px-2 py-0.5 font-semibold ${priorityMeta(selectedThread).tone}`}>
                              {priorityMeta(selectedThread).shortLabel}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 text-[17px] font-semibold leading-6 text-fg">{threadTitle(selectedThread)}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm leading-5 text-muted">
                          <span>{scopeMeta(selectedThread).relation}</span>
                          {selectedThreadLinkedElement ? (
                            <button
                              type="button"
                              className="secondaryBtn tinyBtn h-7 px-2.5 text-[11px]"
                              onClick={focusSelectedThreadLinkedElement}
                              title="Показать элемент на схеме"
                              data-testid="notes-thread-focus-linked-element"
                            >
                              Перейти к элементу
                            </button>
                          ) : null}
                        </div>
                        <div data-testid="notes-thread-header-meta" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-5 text-muted">
                          <span>Создал {threadCreatorLabel(selectedThread, authorLabelsById, viewerUserId)}</span>
                          <span aria-hidden="true">·</span>
                          <span>последний ответ {threadLastAuthorLabel(selectedThread, authorLabelsById, viewerUserId)}</span>
                          {firstMentionLabel(selectedThread, authorLabelsById, viewerUserId) ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>адресат {firstMentionLabel(selectedThread, authorLabelsById, viewerUserId)}</span>
                            </>
                          ) : null}
                          <span aria-hidden="true">·</span>
                          <span>{asArray(selectedThread.comments).length} сообщ.</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatDate(threadUpdatedAt(selectedThread)) || "сейчас"}</span>
                        </div>
                        {selectedThreadIsLegacyBridge ? (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                            Это compatibility bridge из legacy `notes_by_element`. История видна здесь, а новая локальная заметка по выбранному элементу записывается напрямую в legacy-модель без thread API и без удаления старого sidebar.
                          </div>
                        ) : null}
                      </div>
                      {!selectedThreadIsLegacyBridge ? (
                        <div className="flex max-w-[300px] shrink-0 flex-col items-end gap-2 max-sm:w-full max-sm:max-w-none max-sm:items-stretch">
                          <div className="flex flex-wrap items-center justify-end gap-2 max-sm:justify-start">
                            <select
                              className="select h-8 min-h-0 w-[118px] text-xs"
                              value={threadPriority(selectedThread)}
                              onChange={(event) => patchThreadMeta({ priority: event.target.value })}
                              disabled={busy.startsWith("meta:")}
                              aria-label="Приоритет обсуждения"
                              data-testid="notes-thread-priority-select"
                            >
                              {PRIORITY_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                              ))}
                            </select>
                            {text(selectedThread.status) === "resolved" ? (
                              <button type="button" className="secondaryBtn tinyBtn h-8 px-3 text-xs" onClick={() => patchStatus("open")} disabled={busy.startsWith("status:")}>
                                Вернуть в открытые
                              </button>
                            ) : (
                              <button type="button" className="secondaryBtn tinyBtn h-8 px-3 text-xs" onClick={() => patchStatus("resolved")} disabled={busy.startsWith("status:")}>
                                Закрыть обсуждение
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 pt-2 max-sm:justify-start">
                            <button
                              type="button"
                              className={`secondaryBtn tinyBtn h-8 px-2.5 text-xs ${requiresAttention(selectedThread) ? "border-danger/50 bg-danger/10 text-danger" : ""}`}
                              onClick={() => patchThreadMeta({ requires_attention: !requiresAttention(selectedThread) })}
                              disabled={busy.startsWith("meta:") || busy.startsWith("ack:")}
                              data-testid="notes-thread-attention-toggle"
                            >
                              {requiresAttention(selectedThread) ? "Снять внимание" : "Требует внимания"}
                            </button>
                            {requiresAttention(selectedThread) && !attentionAcknowledged(selectedThread) ? (
                              <button
                                type="button"
                                className="secondaryBtn tinyBtn h-8 border-success/50 bg-success/10 px-2.5 text-xs text-success"
                                onClick={acknowledgeAttention}
                                disabled={busy.startsWith("ack:") || busy.startsWith("meta:")}
                                data-testid="notes-thread-attention-acknowledge"
                              >
                                {busy.startsWith("ack:") ? "Подтверждаем..." : "Подтвердить"}
                              </button>
                            ) : null}
                            {requiresAttention(selectedThread) && attentionAcknowledged(selectedThread) ? (
                              <span
                                className="inline-flex h-8 items-center rounded-full border border-success/50 bg-success/10 px-2.5 text-xs font-semibold text-success"
                                data-testid="notes-thread-attention-acknowledged"
                              >
                                Подтверждено вами
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div data-testid="notes-thread-message-scroll" className="min-h-0 overflow-auto bg-bg/10 px-4 py-2.5 sm:px-5 sm:py-3">
                    <div data-testid="notes-thread-message-flow" className="flex flex-col gap-2.5">
                      {selectedThreadIsLegacyBridge && text(selectedThread?.legacy_summary) ? (
                        <div className="rounded-xl border border-amber-200/80 bg-panel px-3.5 py-2.5 shadow-sm">
                          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-900">Legacy summary</div>
                          <div className="mt-1 text-sm leading-relaxed text-fg">{text(selectedThread.legacy_summary)}</div>
                        </div>
                      ) : null}
                      <div className="grid gap-2">
                        {asArray(selectedThread.comments).map((comment, idx) => {
                          const author = authorLabel(comment?.author_user_id, authorLabelsById, viewerUserId);
                          const commentId = text(comment?.id);
                          const commentFocused = commentId && commentId === focusedCommentId;
                          return (
                            <article
                              key={commentId || `comment_${idx + 1}`}
                              data-note-comment-id={commentId || undefined}
                              className={`rounded-xl border bg-panel px-3 py-2.5 shadow-sm ${commentFocused ? "border-rose-300 ring-1 ring-rose-200" : "border-border"}`}
                            >
                              <div className="flex items-start gap-2.5">
                                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-info/10 text-[11px] font-bold text-info">
                                  {authorInitials(author)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <span className="text-[13px] font-semibold text-fg">{author}</span>
                                    <span className="text-[11px] text-muted">{formatDate(comment?.updated_at || comment?.created_at) || "только что"}</span>
                                  </div>
                                  <div className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-fg">{text(comment?.body)}</div>
                                  {asArray(comment?.mentions).length ? (
                                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted" data-testid="notes-comment-mentions">
                                      {asArray(comment.mentions).map((mention) => (
                                        <span key={text(mention?.id) || text(mention?.mentioned_user_id)} className="rounded-full border border-info/45 bg-info/10 px-2 py-0.5 font-semibold text-info">
                                          @{text(mention?.mentioned_label) || authorLabel(mention?.mentioned_user_id, authorLabelsById, viewerUserId)}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {selectedThreadIsLegacyBridge ? (
                    <div className="border-t border-border bg-panel/95 px-4 py-3.5 sm:px-5 sm:py-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Локальная заметка элемента</div>
                        <div className="text-[11px] text-muted">Пишется в legacy `notes_by_element` для режима совместимости.</div>
                      </div>
                      <textarea
                        className="textarea min-h-[88px] w-full text-sm"
                        value={legacyDraft}
                        onChange={(event) => {
                          const threadId = text(selectedThread?.id);
                          setLegacyDraftByThread((prev) => ({ ...prev, [threadId]: event.target.value }));
                        }}
                        placeholder="Добавьте локальную заметку по выбранному элементу..."
                        disabled={disabled || typeof onAddLegacyElementNote !== "function"}
                      />
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="text-[11px] leading-relaxed text-muted">
                          Ответы в thread API и смена статуса для legacy-записей здесь по-прежнему не используются.
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="secondaryBtn smallBtn"
                            onClick={insertLegacyTemplateNote}
                            disabled={busy.startsWith("legacy:") || disabled || typeof onAddLegacyElementNote !== "function"}
                          >
                            {busy.startsWith("legacy:") ? "Вставляем..." : "Вставить шаблон"}
                          </button>
                          <button
                            type="button"
                            className="primaryBtn smallBtn"
                            onClick={addLegacyElementNote}
                            disabled={busy.startsWith("legacy:") || !text(legacyDraft) || disabled || typeof onAddLegacyElementNote !== "function"}
                          >
                            {busy.startsWith("legacy:") ? "Сохраняем..." : "Сохранить локальную заметку"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-border bg-panel/95 px-4 py-3.5 sm:px-5 sm:py-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Ответить</div>
                        <div className="text-[11px] text-muted">Сообщение добавится в текущее обсуждение.</div>
                      </div>
                      <div className="relative">
                        <textarea
                          ref={commentDraftRef}
                          className="textarea min-h-[84px] w-full text-sm"
                          value={commentDraft}
                          onChange={(event) => {
                            const threadId = text(selectedThread?.id);
                            updateCommentDraft(threadId, event.target.value, event.target.selectionStart);
                          }}
                          onKeyDown={(event) => handleMentionKeyDown(event, commentMentionComposer, commentMentionSuggestions, setCommentComposerForSelected, selectCommentMention)}
                          placeholder="Напишите сообщение..."
                          disabled={disabled}
                        />
                        {renderMentionSuggestions("reply", commentMentionComposer, commentMentionSuggestions, selectCommentMention, "above")}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[11px] leading-relaxed text-muted">
                          {mentionUserIdsForSubmit(commentDraft, commentMentionComposer.selected).length
                            ? `Упоминаний: ${mentionUserIdsForSubmit(commentDraft, commentMentionComposer.selected).length}`
                            : ""}
                        </div>
                        <button type="button" className="primaryBtn smallBtn" onClick={addComment} disabled={busy.startsWith("comment:") || !text(commentDraft)}>
                          {busy.startsWith("comment:") ? "Отправляем..." : "Отправить"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex min-h-full flex-1 items-center justify-center bg-bg/10 p-6 text-center">
                  <div className="max-w-sm rounded-3xl border border-dashed border-border bg-panel/70 px-5 py-6">
                    <div className="text-lg font-black text-fg">Выберите обсуждение</div>
                    <div className="mt-2 text-sm leading-relaxed text-muted">
                      Справа можно выбрать существующую тему или создать новую через кнопку в шапке.
                    </div>
                  </div>
                </div>
              )}
            </section>

            <aside className="flex min-h-0 flex-col bg-bg/20 px-3 py-3">
              {notificationMode ? (
                <div data-testid="discussion-notification-inbox" className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-panel/85 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Требует внимания</div>
                    <button
                      type="button"
                      className="secondaryBtn tinyBtn h-7 px-2 text-[10px]"
                      onClick={() => void fetchThreads()}
                      disabled={loading}
                    >
                      {loading ? "..." : "↻"}
                    </button>
                  </div>
                  <div className="mt-2 min-h-0 flex-1 overflow-auto pr-1">
                    <div className="grid gap-3">
                    <section>
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-muted">
                        <span>Требуют внимания</span>
                        <span className="tabular-nums">{notificationBuckets.activeTotal}</span>
                      </div>
                      {renderNotificationList(notificationBuckets.active, "Нет обсуждений, которые требуют внимания.")}
                    </section>
                    <section>
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-muted">
                        <span>Недавние</span>
                        <span className="tabular-nums">{notificationBuckets.historyTotal}</span>
                      </div>
                      {renderNotificationList(notificationBuckets.history, "Недавних просмотренных или закрытых ваших обсуждений пока нет.")}
                    </section>
                    </div>
                  </div>
                </div>
              ) : (
                <>
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  data-testid="notes-sidebar-search"
                  className="input h-8 min-h-0 flex-1 border-border/80 bg-panel/75 text-sm shadow-none"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Поиск"
                  aria-label="Поиск по обсуждениям"
                />
                <button
                  type="button"
                  data-testid="notes-filters-toggle"
                  className={`secondaryBtn tinyBtn h-8 px-2.5 text-[11px] ${filtersOpen ? "ring-1 ring-accent/50" : ""}`}
                  onClick={() => setFiltersOpen((prev) => !prev)}
                  aria-expanded={filtersOpen}
                  aria-label="Открыть фильтры обсуждений"
                >
                  {activeFilterCount > 0 ? `Фильтры ${activeFilterCount}` : "Фильтры"}
                </button>
                <button type="button" className="secondaryBtn tinyBtn h-8 px-2.5 text-[11px]" onClick={fetchThreads} disabled={loading} aria-label="Обновить обсуждения">
                  {loading ? "..." : "↻"}
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-border/80 bg-panel/75 p-1 text-[11px] font-semibold" aria-label="Фильтр участия в обсуждениях">
                <button
                  type="button"
                  className={`rounded-lg px-2 py-1.5 transition ${participationFilter === "all" ? "bg-info/10 text-info shadow-sm ring-1 ring-info/30" : "text-muted hover:bg-panel2/80 hover:text-fg"}`}
                  onClick={() => setParticipationFilter("all")}
                  data-testid="notes-participation-filter-all"
                >
                  Все
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-2 py-1.5 transition ${participationFilter === "my" ? "bg-info/10 text-info shadow-sm ring-1 ring-info/30" : "text-muted hover:bg-panel2/80 hover:text-fg"}`}
                  onClick={() => setParticipationFilter("my")}
                  title="Темы текущей сессии, где вы создали обсуждение, отвечали или были упомянуты."
                  data-testid="notes-participation-filter-my"
                >
                  Мои {participatedThreadsCount}
                </button>
              </div>

              <div className="mt-1 truncate text-[11px] text-muted">
                {loading ? "Обновляем..." : `${visibleThreads.length} из ${displayThreads.length}`}
              </div>

              {filtersOpen ? (
                <div data-testid="notes-filters-panel" className="mt-2 rounded-xl border border-border/80 bg-panel/80 p-2.5 shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span>{activeFilterCount > 0 ? `Активно фильтров: ${activeFilterCount}` : "Фильтры по умолчанию"}</span>
                    {activeFilterCount > 0 ? (
                      <button
                        type="button"
                        className="secondaryBtn tinyBtn h-7 px-2 text-[10px]"
                        onClick={() => {
                          setStatusFilter("open");
                          setScopeFilter("all");
                          setParticipationFilter("all");
                          setSortOrder("newest");
                        }}
                      >
                        Сбросить
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      className="select h-8 min-h-0 w-full text-xs"
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                      aria-label="Фильтр по статусу"
                    >
                      {STATUS_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                    <select
                      className="select h-8 min-h-0 w-full text-xs"
                      value={scopeFilter}
                      onChange={(event) => setScopeFilter(event.target.value)}
                      aria-label="Фильтр по контексту"
                    >
                      {CONTEXT_FILTER_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                    <select
                      className="select h-8 min-h-0 w-full text-xs sm:col-span-2"
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
                    <div className="mt-2 rounded-xl border border-border bg-bg/60 px-2.5 py-2 text-[11px] text-muted">
                      Сначала выберите BPMN-элемент на диаграмме.
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-2 min-h-0 flex-1 overflow-auto pr-1">
                {visibleThreads.length ? (
                  <div className="grid gap-2">
                    {visibleThreads.map((thread) => {
                      const threadId = text(thread?.id);
                      const active = threadId === text(selectedThread?.id);
                      const meta = scopeMeta(thread);
                      const mentionLabel = firstMentionLabel(thread, authorLabelsById, viewerUserId);
                      const newMessagesCount = unreadCount(thread);
                      return (
                        <button
                          key={threadId}
                          type="button"
                          className={`rounded-lg border px-3 py-2.5 text-left transition ${active ? "border-info/60 bg-info/10 shadow-sm ring-1 ring-info/30" : "border-border/80 bg-panel/85 hover:border-info/45 hover:bg-panel2/70 hover:shadow-sm"}`}
                          onClick={() => {
                            setCreateOpen(false);
                            setSelectedThreadId(threadId);
                          }}
                        >
                          <div className="min-w-0">
                            <div className="line-clamp-2 text-[13px] font-semibold leading-snug text-fg">{threadTitle(thread)}</div>
                            <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">
                              {meta.relation} · {threadPreview(thread)}
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                            <span className={`rounded-full border px-1.5 py-0.5 font-semibold ${threadStatusTone(thread)}`}>{threadStatusLabel(thread)}</span>
                            {requiresAttention(thread) ? (
                              <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${attentionMeta(thread).tone}`}>
                                {attentionMeta(thread).shortLabel}
                              </span>
                            ) : null}
                            {threadPriority(thread) === "high" ? (
                              <span className={`rounded-full border px-1.5 py-0.5 font-semibold ${priorityMeta(thread).tone}`}>{priorityMeta(thread).shortLabel}</span>
                            ) : null}
                            {newMessagesCount > 0 ? (
                              <span
                                className="shrink-0 rounded-full border border-info/55 bg-info/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-info"
                                title={`Новые сообщения: ${newMessagesCount}`}
                                aria-label={`Новые сообщения: ${newMessagesCount}`}
                                data-testid="notes-thread-unread-badge"
                              >
                                {newMessagesCount}
                              </span>
                            ) : null}
                            {mentionLabel ? (
                              <span className="min-w-0 truncate rounded-full border border-info/40 bg-info/10 px-1.5 py-0.5 font-semibold text-info">
                                {mentionLabel}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] leading-4 text-muted">
                            <span>Создал {threadCreatorLabel(thread, authorLabelsById, viewerUserId)}</span>
                            <span aria-hidden="true">·</span>
                            <span>Последний: {threadLastAuthorLabel(thread, authorLabelsById, viewerUserId)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatDate(threadUpdatedAt(thread)) || "сейчас"}</span>
                            <span aria-hidden="true">·</span>
                            <span>{asArray(thread.comments).length} сообщ.</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-panel/70 p-4 text-sm text-muted">
                    {loading
                      ? "Загружаем обсуждения..."
                      : participationFilter === "my" && participatedThreadsCount === 0
                        ? "Пока нет обсуждений с вашим участием."
                        : "По текущим фильтрам ничего не найдено."}
                  </div>
                )}
              </div>
                </>
              )}
            </aside>
          </div>
        </div>
      ) : null}
    </>
  );
});

export default NotesMvpPanel;
