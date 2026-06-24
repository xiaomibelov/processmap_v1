import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import "./NotesMvpPanel.icons.css";
import {
  apiAcknowledgeNoteThreadAttention,
  apiAddNoteThreadComment,
  apiCreateNoteThread,
  apiListMentionableUsers,
  apiListNoteThreads,
  apiMarkNoteThreadRead,
  apiPatchNoteComment,
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
  buildDiscussionNotificationCenter,
} from "../features/notes/discussionNotificationCenterModel.js";
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
import MarkdownComposerToolbar from "../features/notes/MarkdownComposerToolbar.jsx";
import { applyMarkdownAction } from "../features/notes/markdownComposerActions.js";
import NoteMarkdown from "../features/notes/markdownRenderer.js";
import { readableBpmnText } from "../features/process/bpmn/bpmnIdentity";
import NotesAggregateBadge from "./NotesAggregateBadge.jsx";
import { useSessionNoteAggregate } from "../lib/sessionNoteAggregates.js";

const DEFAULT_PANEL_WIDTH = 480;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 800;
const COLLAPSED_WIDTH = 40;
const LS_PANEL_WIDTH_KEY = "fpc_discussion_panel_width";
const LS_PANEL_COLLAPSED_KEY = "fpc_discussion_panel_collapsed";

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

function emptyMentionComposer() {
  return { selected: [], active: null, highlightedIndex: 0 };
}

function commentBodyPreview(value, fallback = "Сообщение") {
  const body = text(value);
  const firstLine = String(value || "").split(/\r?\n/u).map((line) => text(line)).find(Boolean) || body;
  if (!firstLine) return fallback;
  return firstLine.length > 160 ? `${firstLine.slice(0, 159).trim()}…` : firstLine;
}

function storedMentionsForEdit(comment) {
  return asArray(comment?.mentions).map((mention) => ({
    user_id: text(mention?.mentioned_user_id),
    label: text(mention?.mentioned_label),
    email: "",
    full_name: text(mention?.mentioned_label),
    job_title: "",
  })).filter((item) => item.user_id && item.label);
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

function discussionThreadRowClass({ active, attentionActive }) {
  const base = "relative rounded-lg border px-3 py-3 pl-[9px] text-left transition duration-150 ease-in-out";
  if (attentionActive) {
    return active
      ? `${base} border-l-[3px] border-l-warning/70 border-warning/50 bg-warning/10 shadow-sm`
      : `${base} border-l-[3px] border-l-warning/50 border-warning/35 bg-warning/5 hover:border-warning/55 hover:border-l-warning/70 hover:bg-warning/10`;
  }
  return active
    ? `${base} border-l-[3px] border-l-[#2563eb] border-info/45 bg-[#eff6ff] shadow-sm`
    : `${base} border-l-[3px] border-l-transparent border-border/60 bg-bg/10 hover:border-info/35 hover:border-l-[#3b82f6] hover:bg-[#f9fafb]`;
}

function threadStatusListClass(thread) {
  if (isLegacyBridgeThread(thread)) {
    return "rounded border border-[#f59e0b]/30 bg-[#fef3c7] px-1.5 py-0.5 font-semibold text-[#92400e]";
  }
  if (text(thread?.status) === "resolved") {
    return "rounded border border-[#10b981]/30 bg-[#d1fae5] px-1.5 py-0.5 font-semibold text-[#065f46]";
  }
  return "rounded border border-[#60a5fa]/30 bg-[#dbeafe] px-1.5 py-0.5 font-semibold text-[#1e40af]";
}

function attentionListClass() {
  return "rounded border border-[#f87171]/30 bg-[#fee2e2] px-1.5 py-0.5 font-semibold text-[#991b1b]";
}

function childSessionListClass() {
  return "rounded border border-[#f59e0b]/30 bg-[#fef3c7] px-1.5 py-0.5 font-semibold text-[#92400e]";
}

function DiscussionThreadSkeletonList() {
  return (
    <div className="grid gap-2 transition-opacity duration-200" data-testid="notes-skeleton-list">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          data-testid="notes-thread-skeleton"
          className="relative rounded-lg border border-border/40 bg-panel/50 px-3 py-3 pl-[9px]"
        >
          <div className="min-w-0">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="h-4 w-3/4 rounded bg-gray-200 animate-pulse" />
              <div className="h-4 w-6 rounded bg-gray-200 animate-pulse" />
            </div>
            <div className="mt-2 h-3 w-full rounded bg-gray-200 animate-pulse" />
            <div className="mt-1 h-3 w-2/3 rounded bg-gray-200 animate-pulse" />
            <div className="mt-3 flex flex-wrap items-center gap-1">
              <div className="h-5 w-12 rounded bg-gray-200 animate-pulse" />
              <div className="h-5 w-16 rounded bg-gray-200 animate-pulse" />
              <div className="ml-auto h-3 w-10 rounded bg-gray-200 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DiscussionEmptyState({ disabled, scopeFilter, selectedElementName, onCreate }) {
  const isElementScope = scopeFilter === "selected_element" || scopeFilter === "diagram_element";
  const message = isElementScope
    ? `Нет обсуждений для ${scopeFilter === "selected_element" ? `элемента «${selectedElementName}»` : "этой диаграммы"}.`
    : "Обсуждения пока не созданы.";
  return (
    <div
      className="flex min-h-full flex-col items-center justify-center p-6 text-center transition-opacity duration-200"
      data-testid="notes-empty-state"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6 text-[#9ca3af]"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <p className="mt-3 max-w-[240px] text-sm text-[#6b7280]">{message}</p>
      {!disabled ? (
        <button
          type="button"
          className="primaryBtn smallBtn mt-4"
          onClick={onCreate}
          data-testid="notes-empty-create"
        >
          + Создать обсуждение
        </button>
      ) : null}
    </div>
  );
}

function discussionMessageClass(focused) {
  return focused
    ? "border-warning/45 bg-warning/10 ring-1 ring-warning/25"
    : "border-border/60 bg-bg/10 hover:border-border/80 hover:bg-panel2/25";
}

function discussionQuietActionClass(tone = "neutral") {
  if (tone === "warning") {
    return "rounded-md border border-warning/35 bg-transparent px-2 py-1 text-[11px] font-semibold text-warning transition hover:border-warning/65 hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-60";
  }
  if (tone === "success") {
    return "rounded-md border border-success/35 bg-transparent px-2 py-1 text-[11px] font-semibold text-success transition hover:border-success/65 hover:bg-success/10 disabled:cursor-not-allowed disabled:opacity-60";
  }
  return "rounded-md border border-border/70 bg-transparent px-2 py-1 text-[11px] font-semibold text-fg/80 transition hover:border-info/45 hover:bg-info/10 hover:text-info disabled:cursor-not-allowed disabled:opacity-60";
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

function emitElementNoteThreadsChanged(sessionId, threads) {
  if (typeof window === "undefined") return;
  const sid = text(sessionId);
  if (!sid) return;
  const countsByElementId = {};
  asArray(threads).forEach((thread) => {
    if (text(thread?.scope_type) !== "diagram_element") return;
    const ref = thread?.scope_ref || thread?.scopeRef || {};
    const eid = text(ref.element_id || ref.elementId);
    if (!eid) return;
    countsByElementId[eid] = (countsByElementId[eid] || 0) + 1;
  });
  window.dispatchEvent(new CustomEvent("processmap:element-note-threads-changed", {
    detail: { sessionId: sid, countsByElementId },
  }));
}

const NotesMvpPanel = forwardRef(function NotesMvpPanel({
  sessionId,
  sessionTitle = "",
  projectTitle = "",
  projectId = "",
  sessions = [],
  selectedElement = null,
  onNavigateToProject = null,
  onNavigateToSession = null,
  legacyElementNotesMap = null,
  onAddLegacyElementNote = null,
  disabled = false,
  externalOpenRequest = null,
  onOpenChange = null,
  onFocusNotificationTarget = null,
  onFocusLinkedElement = null,
  currentUserId = "",
  mentionNotifications = [],
  onOpenMentionNotification = null,
}, ref) {
  const sid = text(sessionId);
  const viewerUserId = text(currentUserId);
  const selectedElementId = text(selectedElement?.id);
  const selectedElementName = readableBpmnLabel(selectedElement?.name) || "Элемент BPMN";
  const selectedElementType = text(selectedElement?.type);

  const sessionById = useMemo(() => {
    const map = new Map();
    for (const s of Array.isArray(sessions) ? sessions : []) {
      const id = text(s?.session_id || s?.id);
      if (id) map.set(id, s);
    }
    return map;
  }, [sessions]);

  const descendantSessionIds = useMemo(() => {
    const byParent = new Map();
    for (const s of Array.isArray(sessions) ? sessions : []) {
      const id = text(s?.session_id || s?.id);
      const parentId = text(s?.parent_session_id || s?.parentSessionId);
      if (!id) continue;
      if (!byParent.has(parentId)) byParent.set(parentId, []);
      byParent.get(parentId).push(id);
    }
    const out = new Set();
    const queue = [sid];
    while (queue.length) {
      const pid = queue.shift();
      if (out.has(pid)) continue;
      out.add(pid);
      for (const childId of byParent.get(pid) || []) {
        if (!out.has(childId)) queue.push(childId);
      }
    }
    return Array.from(out).filter(Boolean);
  }, [sid, sessions]);

  const [open, setOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [panelView, setPanelView] = useState("list");
  const [createOpen, setCreateOpen] = useState(false);
  const [threadActionsOpen, setThreadActionsOpen] = useState(false);
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
  const [replyTargetByThread, setReplyTargetByThread] = useState({});
  const [editingCommentId, setEditingCommentId] = useState("");
  const [editDraftByComment, setEditDraftByComment] = useState({});
  const [editMentionByComment, setEditMentionByComment] = useState({});
  const [legacyDraftByThread, setLegacyDraftByThread] = useState({});
  const aggregate = useSessionNoteAggregate(sid);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mentionableUsers, setMentionableUsers] = useState([]);
  const [createMentionComposer, setCreateMentionComposer] = useState({ selected: [], active: null, highlightedIndex: 0 });
  const [commentMentionByThread, setCommentMentionByThread] = useState({});
  const panelRef = useRef(null);
  const createDetailsRef = useRef(null);
  const commentDraftRef = useRef(null);
  const editDraftRef = useRef(null);
  const threadActionsRef = useRef(null);
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
  const notificationCenter = useMemo(
    () => buildDiscussionNotificationCenter({
      threads,
      mentions: mentionNotifications,
      currentUserId: viewerUserId,
      sessionId: sid,
    }),
    [mentionNotifications, sid, threads, viewerUserId],
  );
  const participatedThreadsCount = useMemo(
    () => countParticipatedThreads(displayThreads, viewerUserId),
    [displayThreads, viewerUserId],
  );

  const visibleThreads = useMemo(() => {
    const query = text(searchQuery).toLowerCase();
    const filtered = asArray(displayThreads).filter((thread) => {
      if (statusFilter !== "all" && text(thread.status) !== statusFilter) {
        return false;
      }
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
  }, [displayThreads, participationFilter, searchQuery, sortOrder, statusFilter, viewerUserId]);

  const selectedThread = useMemo(() => {
    if (panelView !== "thread" || !selectedThreadId) return null;
    return visibleThreads.find((item) => text(item?.id) === selectedThreadId) || null;
  }, [panelView, selectedThreadId, visibleThreads]);
  const selectedThreadIsLegacyBridge = isLegacyBridgeThread(selectedThread);
  const selectedThreadLinkedElement = useMemo(() => linkedElementContext(selectedThread), [selectedThread]);

  const commentDraft = commentDraftByThread[text(selectedThread?.id)] || "";
  const commentMentionComposer = commentMentionByThread[text(selectedThread?.id)] || emptyMentionComposer();
  const replyTarget = replyTargetByThread[text(selectedThread?.id)] || null;
  const editDraft = editDraftByComment[editingCommentId] || "";
  const editMentionComposer = editMentionByComment[editingCommentId] || emptyMentionComposer();
  const legacyDraft = legacyDraftByThread[text(selectedThread?.id)] || "";
  const openThreadsCount = Math.max(0, asArray(threads).filter((t) => text(t.status) === "open").length);
  const totalThreadsCount = asArray(threads).length;
  const activeFilterCount = Number(statusFilter !== "open") + Number(scopeFilter !== "all") + Number(participationFilter !== "all") + Number(sortOrder !== "newest");
  const discussionSummaryLine = useMemo(() => {
    if (notificationMode) {
      const totalCount = notificationCenter.totalCount;
      const signalCount = notificationCenter.signalCount;
      return [
        text(sessionTitle) || "Сессия",
        `${totalCount} тем`,
        `${signalCount} событий`,
      ].join(" · ");
    }
    const parts = [
      text(sessionTitle) || "Сессия",
      `${openThreadsCount} открытых`,
      `${totalThreadsCount} тем`,
    ];
    if (visibleThreads.length !== displayThreads.length) {
      parts.push(`показано ${visibleThreads.length}`);
    }
    return parts.join(" · ");
  }, [displayThreads.length, notificationCenter.signalCount, notificationCenter.totalCount, notificationMode, openThreadsCount, sessionTitle, totalThreadsCount, visibleThreads.length]);
  const createMentionSuggestions = useMemo(
    () => filterMentionSuggestions(mentionableUsers, createMentionComposer.active?.query || "", createMentionComposer.selected),
    [createMentionComposer.active?.query, createMentionComposer.selected, mentionableUsers],
  );
  const commentMentionSuggestions = useMemo(
    () => filterMentionSuggestions(mentionableUsers, commentMentionComposer.active?.query || "", commentMentionComposer.selected),
    [commentMentionComposer.active?.query, commentMentionComposer.selected, mentionableUsers],
  );
  const editMentionSuggestions = useMemo(
    () => filterMentionSuggestions(mentionableUsers, editMentionComposer.active?.query || "", editMentionComposer.selected),
    [editMentionComposer.active?.query, editMentionComposer.selected, mentionableUsers],
  );

  function focusTextareaAt(ref, selectionStart, selectionEnd = selectionStart) {
    window.requestAnimationFrame?.(() => {
      const node = ref?.current;
      if (!node || typeof node.focus !== "function") return;
      node.focus();
      if (typeof node.setSelectionRange === "function") {
        node.setSelectionRange(selectionStart, selectionEnd);
      }
    });
  }

  function applyComposerMarkdownAction(kind, action) {
    const targetRef = kind === "create" ? createDetailsRef : commentDraftRef;
    const node = targetRef.current;
    const selectionStart = node?.selectionStart ?? 0;
    const selectionEnd = node?.selectionEnd ?? selectionStart;
    if (kind === "create") {
      const result = applyMarkdownAction(createDetails, selectionStart, selectionEnd, action);
      updateCreateDetails(result.text, result.selectionEnd);
      focusTextareaAt(createDetailsRef, result.selectionStart, result.selectionEnd);
      return;
    }
    const threadId = text(selectedThread?.id);
    if (!threadId) return;
    const result = applyMarkdownAction(commentDraft, selectionStart, selectionEnd, action);
    updateCommentDraft(threadId, result.text, result.selectionEnd);
    focusTextareaAt(commentDraftRef, result.selectionStart, result.selectionEnd);
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

  function updateEditDraft(commentId, nextValue, caretIndex) {
    const cid = text(commentId);
    if (!cid) return;
    setEditDraftByComment((prev) => ({ ...prev, [cid]: nextValue }));
    setEditMentionByComment((prev) => {
      const current = prev[cid] || emptyMentionComposer();
      return {
        ...prev,
        [cid]: {
          selected: pruneSelectedMentions(nextValue, current.selected),
          active: detectMentionQuery(nextValue, caretIndex),
          highlightedIndex: 0,
        },
      };
    });
  }

  function selectEditMention(user) {
    const commentId = text(editingCommentId);
    if (!commentId) return;
    const caret = editDraftRef.current?.selectionStart ?? editDraft.length;
    const result = insertMentionText(editDraft, editMentionComposer.active, user, caret);
    if (!result.mention) return;
    setEditDraftByComment((prev) => ({ ...prev, [commentId]: result.text }));
    setEditMentionByComment((prev) => {
      const current = prev[commentId] || emptyMentionComposer();
      return {
        ...prev,
        [commentId]: {
          selected: pruneSelectedMentions(result.text, [...asArray(current.selected), result.mention]),
          active: null,
          highlightedIndex: 0,
        },
      };
    });
    focusTextareaAt(editDraftRef, result.caretIndex);
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
      const current = prev[threadId] || emptyMentionComposer();
      return { ...prev, [threadId]: updater(current) };
    });
  }

  function setEditComposerForActive(updater) {
    const commentId = text(editingCommentId);
    if (!commentId) return;
    setEditMentionByComment((prev) => {
      const current = prev[commentId] || emptyMentionComposer();
      return { ...prev, [commentId]: updater(current) };
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
    if (!sid) return;
    if (open) setLoading(true);
    setError("");
    const preferredThreadId = text(options?.preferredThreadId);
    let filters;
    if (!open) {
      // Keep overlay counts up to date even when the panel is closed.
      filters = { status: "", scopeType: "", elementId: "" };
    } else {
      if (!notificationMode && scopeFilter === "selected_element" && !selectedElementId) {
        setThreads([]);
        setSelectedThreadId("");
        setLoading(false);
        return;
      }
      filters = {
        status: "",
        scopeType: notificationMode || scopeFilter === "all" ? "" : (scopeFilter === "selected_element" ? "diagram_element" : scopeFilter),
        elementId: notificationMode ? "" : (scopeFilter === "selected_element" ? selectedElementId : ""),
      };
    }
    const idsToLoad = descendantSessionIds.length ? descendantSessionIds : [sid];
    const results = await Promise.all(idsToLoad.map((id) => apiListNoteThreads(id, filters)));
    const nextThreads = [];
    let loadError = "";
    for (const result of results) {
      if (!result.ok) {
        loadError = errorText(result, "Не удалось загрузить обсуждения. Попробуйте позже.");
        continue;
      }
      for (const thread of asArray(result.items)) {
        const threadSessionId = text(thread?.session_id || thread?.sessionId);
        const isChild = threadSessionId !== sid;
        nextThreads.push({ ...thread, _isChildSessionThread: isChild });
      }
    }
    nextThreads.sort((left, right) => threadUpdatedAt(right) - threadUpdatedAt(left));
    setThreads(nextThreads);
    if (loadError) {
      setError(loadError);
    }
    setSelectedThreadId((prev) => {
      if (preferredThreadId && nextThreads.some((item) => text(item?.id) === preferredThreadId)) {
        return preferredThreadId;
      }
      if (nextThreads.some((item) => text(item?.id) === prev)) return prev;
      return "";
    });
    setLoading(false);
  }, [descendantSessionIds, notificationMode, open, scopeFilter, selectedElementId, sid, statusFilter]);

  useEffect(() => {
    if (!open) return;
    void fetchThreads();
  }, [fetchThreads, open]);

  useEffect(() => {
    emitElementNoteThreadsChanged(
      sid,
      asArray(threads).filter((t) => text(t?.session_id || t?.sessionId) === sid),
    );
  }, [sid, threads]);

  useEffect(() => {
    void fetchMentionableUsers();
  }, [fetchMentionableUsers]);

  useEffect(() => {
    setThreads([]);
    setSelectedThreadId("");
    setFocusedCommentId("");
    setPanelMode("discussions");
    setPanelView("list");
    setError("");
    setCreateOpen(false);
    setMentionableUsers([]);
    setCreateMentionComposer(emptyMentionComposer());
    setCommentMentionByThread({});
    setReplyTargetByThread({});
    setEditingCommentId("");
    setEditDraftByComment({});
    setEditMentionByComment({});
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
    setPanelView(nextThreadId ? "thread" : "list");
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

  // The discussion panel now stays open while the user interacts with the canvas,
  // so we intentionally do not auto-close on outside pointer events.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown() {
      // no-op: panel remains open; click-through to the canvas is handled via pointer-events.
    }
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(LS_PANEL_WIDTH_KEY));
      if (Number.isFinite(saved) && saved >= MIN_PANEL_WIDTH && saved <= MAX_PANEL_WIDTH) {
        setPanelWidth(saved);
      }
      const collapsedRaw = window.localStorage.getItem(LS_PANEL_COLLAPSED_KEY);
      if (collapsedRaw === "1") setIsCollapsed(true);
    } catch {
      // ignore localStorage errors
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_PANEL_WIDTH_KEY, String(panelWidth));
    } catch {
      // ignore
    }
  }, [panelWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_PANEL_COLLAPSED_KEY, isCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [isCollapsed]);

  useEffect(() => {
    if (!threadActionsOpen) return undefined;
    function handlePointerDown(event) {
      if (!threadActionsRef.current || threadActionsRef.current.contains(event.target)) return;
      setThreadActionsOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [threadActionsOpen]);

  const startResize = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsResizing(true);
    const startX = event.clientX;
    const startWidth = panelWidth;
    const onMove = (e) => {
      const delta = startX - e.clientX;
      const next = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidth + delta));
      setPanelWidth(next);
    };
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [panelWidth]);

  function openPanel() {
    setOpen(true);
    setPanelMode("discussions");
    setPanelView("list");
    setCreateOpen(false);
  }

  async function openNotificationItem(item) {
    const notification = item && typeof item === "object" ? item : {};
    if (notification.type === "mention" && typeof onOpenMentionNotification === "function") {
      await Promise.resolve(onOpenMentionNotification(notification.mention || notification));
      return;
    }
    const threadId = text(notification.threadId);
    if (!threadId) return;
    setCreateOpen(false);
    setPanelMode("discussions");
    setStatusFilter("all");
    setScopeFilter("all");
    setParticipationFilter("all");
    setSelectedThreadId(threadId);
    setFocusedCommentId(text(notification.commentId));
    setPanelView("thread");
    if (text(notification.targetElementId)) {
      onFocusNotificationTarget?.({
        element_id: text(notification.targetElementId),
        element_name: text(notification.sourceLabel),
        scope_type: text(notification.scopeType),
        thread_id: threadId,
        comment_id: text(notification.commentId),
      });
    }
    if (notification.type !== "attention" || notification.state !== "active" || disabled) return;
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

  function threadSessionInfo(thread) {
    const threadSid = text(thread?.session_id || thread?.sessionId);
    const session = threadSid
      ? asArray(sessions).find((s) => text(s?.session_id || s?.id) === threadSid)
      : null;
    const parentSid = text(session?.parent_session_id || session?.parentSessionId);
    return {
      id: threadSid || sid,
      title: text(session?.title || session?.name || sessionTitle || "Сессия"),
      parentId: parentSid,
    };
  }

  function handleBreadcrumbProjectClick() {
    if (typeof onNavigateToProject === "function") {
      onNavigateToProject();
    } else {
      setOpen(false);
      setCreateOpen(false);
    }
  }

  function handleBreadcrumbSessionClick() {
    const info = threadSessionInfo(selectedThread);
    const targetSid = info.id;
    if (!targetSid || targetSid === sid) {
      // Already in the target session: just go back to the thread list and close
      // the panel instead of reloading the same canvas.
      setPanelView("list");
      setSelectedThreadId("");
      setOpen(false);
      setCreateOpen(false);
      return;
    }
    onNavigateToSession?.(targetSid);
  }

  function handleBreadcrumbElementClick() {
    if (!selectedThreadLinkedElement?.elementId) return;
    onFocusLinkedElement?.({
      element_id: selectedThreadLinkedElement.elementId,
      element_name: selectedThreadLinkedElement.elementName,
      element_type: selectedThreadLinkedElement.elementType,
      scope_type: "diagram_element",
      thread_id: text(selectedThread?.id),
    });
  }

  function renderThreadBreadcrumb() {
    const info = threadSessionInfo(selectedThread);
    const projectLabel = text(projectTitle) || "Проект";
    const sessionLabel = info.title;
    const elementId = selectedThreadLinkedElement?.elementId;
    const elementLabel = selectedThreadLinkedElement?.elementName || elementId || "Элемент";
    const topicLabel = threadTitle(selectedThread);
    const separator = <span className="mx-1 text-muted/60" aria-hidden="true">/</span>;
    return (
      <div className="flex flex-wrap items-center text-[12px] text-muted" data-testid="notes-thread-breadcrumb">
        <button type="button" className="transition hover:text-fg" onClick={handleBreadcrumbProjectClick}>{projectLabel}</button>
        {separator}
        <button type="button" className="transition hover:text-fg" onClick={handleBreadcrumbSessionClick}>{sessionLabel}</button>
        {elementId ? (
          <>
            {separator}
            <button type="button" className="transition hover:text-fg" onClick={handleBreadcrumbElementClick} data-testid="notes-thread-breadcrumb-element">{elementLabel}</button>
          </>
        ) : null}
        {separator}
        <span className="font-semibold text-fg">{topicLabel}</span>
      </div>
    );
  }

  function notificationTone(type) {
    if (type === "mention") return "border-danger/50 bg-danger/10 text-danger";
    if (type === "unread") return "border-info/50 bg-info/10 text-info";
    return "border-warning/55 bg-warning/10 text-warning";
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
              className={`rounded-xl border px-2.5 py-2 text-left transition ${active ? "border-info/60 bg-info/10 shadow-sm ring-1 ring-info/25" : "border-border/80 bg-panel/80 hover:border-info/45 hover:bg-panel2/80"}`}
              onClick={() => void openNotificationItem(item)}
              data-testid={`discussion-notification-${item.type}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-[12px] font-semibold leading-snug text-fg">{item.title}</div>
                  <div className="mt-1 truncate text-[11px] text-muted">
                    {item.sourceLabel || "Обсуждение"}
                    {item.authorLabel ? ` · ${item.authorLabel}` : ""}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${notificationTone(item.type)}`}>
                  {item.badgeLabel || "уведомление"}
                </span>
              </div>
              <div className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted">
                {item.excerpt || "Открыть обсуждение"}
              </div>
              <div className="mt-1.5 text-[10px] text-muted">
                {formatDate(item.timestamp || item.updatedAt) || "сейчас"}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  function renderNotificationCenter() {
    if (loading && notificationCenter.signalCount === 0) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-bg/50 px-3 py-2 text-[11px] leading-relaxed text-muted">
          Загрузка уведомлений...
        </div>
      );
    }
    if (error && notificationCenter.signalCount === 0) {
      return (
        <div className="rounded-xl border border-danger/45 bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
          Не удалось загрузить уведомления.
        </div>
      );
    }
    if (notificationCenter.signalCount === 0) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-bg/50 px-3 py-2 text-[11px] leading-relaxed text-muted">
          Нет новых уведомлений.
        </div>
      );
    }
    return (
      <div className="grid gap-3">
        {notificationCenter.groups.map((group) => (
          <section key={group.key}>
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-muted">
              <span>{group.label}</span>
              <span className="tabular-nums">{group.count}</span>
            </div>
            {renderNotificationList(group.items, "Нет уведомлений в этой группе.")}
          </section>
        ))}
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
    setCreateMentionComposer(emptyMentionComposer());
    setCreateOpen(false);
    setSelectedThreadId(nextThreadId);
    setPanelView("thread");
    await fetchThreads({ preferredThreadId: nextThreadId });
    emitNotesAggregateChanged(sid);
    emitNoteMentionsChanged();
    setCreateSubjectByScope((prev) => (prev[scopeKey] ? { ...prev, [scopeKey]: "" } : prev));
    setCreateDetailsByScope((prev) => (prev[scopeKey] ? { ...prev, [scopeKey]: "" } : prev));
    setBusy("");
  }

  function startReply(comment, author) {
    const threadId = text(selectedThread?.id);
    const commentId = text(comment?.id);
    if (!threadId || !commentId || selectedThreadIsLegacyBridge) return;
    setReplyTargetByThread((prev) => ({
      ...prev,
      [threadId]: {
        id: commentId,
        author_display: text(author) || authorLabel(comment?.author_user_id, authorLabelsById, viewerUserId),
        body_preview: commentBodyPreview(comment?.body),
        created_at: Number(comment?.created_at || 0) || 0,
      },
    }));
    focusTextareaAt(commentDraftRef, commentDraft.length);
  }

  function clearReplyTarget(threadId = text(selectedThread?.id)) {
    const tid = text(threadId);
    if (!tid) return;
    setReplyTargetByThread((prev) => {
      if (!prev[tid]) return prev;
      const next = { ...prev };
      delete next[tid];
      return next;
    });
  }

  function startEditComment(comment) {
    const commentId = text(comment?.id);
    if (!commentId || selectedThreadIsLegacyBridge) return;
    setEditingCommentId(commentId);
    setEditDraftByComment((prev) => ({ ...prev, [commentId]: String(comment?.body || "") }));
    setEditMentionByComment((prev) => ({
      ...prev,
      [commentId]: {
        selected: pruneSelectedMentions(comment?.body || "", storedMentionsForEdit(comment)),
        active: null,
        highlightedIndex: 0,
      },
    }));
    focusTextareaAt(editDraftRef, String(comment?.body || "").length);
  }

  function cancelEditComment(commentId = editingCommentId) {
    const cid = text(commentId);
    if (!cid) return;
    setEditingCommentId((current) => (current === cid ? "" : current));
    setEditDraftByComment((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, cid)) return prev;
      const next = { ...prev };
      delete next[cid];
      return next;
    });
    setEditMentionByComment((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, cid)) return prev;
      const next = { ...prev };
      delete next[cid];
      return next;
    });
  }

  async function saveEditComment(comment) {
    const commentId = text(comment?.id);
    const body = text(editDraftByComment[commentId]);
    if (!commentId || !body || disabled || selectedThreadIsLegacyBridge) return;
    const editMentionUserIds = mentionUserIdsForSubmit(body, (editMentionByComment[commentId] || emptyMentionComposer()).selected);
    setBusy(`edit:${commentId}`);
    setError("");
    const result = await apiPatchNoteComment(commentId, {
      body,
      mention_user_ids: editMentionUserIds,
    });
    if (!result.ok) {
      setError(errorText(result, "Не удалось сохранить сообщение."));
      setBusy("");
      return;
    }
    const nextThread = result.thread;
    if (nextThread?.id) {
      setThreads((prev) => asArray(prev).map((thread) => (text(thread?.id) === text(nextThread.id) ? nextThread : thread)));
      setSelectedThreadId(text(nextThread.id));
    } else {
      await fetchThreads({ preferredThreadId: text(selectedThread?.id) });
    }
    cancelEditComment(commentId);
    emitNoteMentionsChanged();
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
      reply_to_comment_id: text(replyTarget?.id) || undefined,
    });
    if (!result.ok) {
      setError(errorText(result, "Не удалось отправить сообщение."));
      setBusy("");
      return;
    }
    setCommentDraftByThread((prev) => ({ ...prev, [threadId]: "" }));
    setCommentMentionByThread((prev) => ({ ...prev, [threadId]: emptyMentionComposer() }));
    clearReplyTarget(threadId);
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
          className={`fixed bottom-5 right-5 top-16 z-[100] flex flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-panel max-lg:bottom-3 max-lg:right-3 max-lg:w-[calc(100vw-1.5rem)] max-sm:top-14 lg:w-[var(--panel-width)] ${isResizing ? "transition-none" : "transition-all duration-200"} pointer-events-none`}
          style={{ "--panel-width": isCollapsed ? `${COLLAPSED_WIDTH}px` : `${panelWidth}px` }}
        >
          {!isCollapsed ? (
            <>
              <div
                className="absolute left-0 top-0 bottom-0 z-20 w-[3px] cursor-ew-resize hover:bg-info/30 active:bg-info/50 pointer-events-auto max-lg:hidden"
                onPointerDown={startResize}
                style={{ touchAction: "none" }}
              />
              <div className="border-b border-border/70 bg-panel/95 px-4 py-3 sm:px-5 pointer-events-auto" data-testid="notes-panel-header">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold leading-tight text-fg">
                  {notificationMode ? "Уведомления" : "Обсуждения"}
                </div>
                <div data-testid="notes-summary-line" className="mt-0.5 truncate text-xs text-muted">
                  {discussionSummaryLine}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 self-center">
                {notificationMode ? (
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 text-muted transition hover:border-info/55 hover:bg-info/10 hover:text-info"
                    onClick={() => setPanelMode("discussions")}
                    aria-label="Все обсуждения"
                    title="Все обсуждения"
                    data-testid="notes-header-notifications-back"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="icon-button inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 text-muted transition hover:border-info/55 hover:bg-info/10 hover:text-info"
                    onClick={() => {
                      setPanelMode("notifications");
                      setStatusFilter("all");
                      setScopeFilter("all");
                      setFiltersOpen(false);
                      setSelectedThreadId("");
                    }}
                    aria-label="Уведомления"
                    data-testid="notes-header-notifications"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                    {notificationCenter.totalCount > 0 ? (
                      <span
                        className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
                        data-testid="notes-notification-badge"
                      >
                        {notificationCenter.totalCount}
                      </span>
                    ) : null}
                    <span className="icon-button__tooltip" data-testid="icon-button-tooltip">Уведомления</span>
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 text-muted transition hover:border-info/55 hover:bg-info/10 hover:text-info"
                  onClick={() => setIsCollapsed(true)}
                  aria-label="Свернуть обсуждения"
                  data-testid="notes-header-collapse"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  <span className="icon-button__tooltip" data-testid="icon-button-tooltip">Свернуть панель</span>
                </button>
                <button
                  type="button"
                  className="icon-button inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 text-muted transition hover:border-danger/55 hover:bg-danger/10 hover:text-danger"
                  onClick={() => {
                    setOpen(false);
                    setCreateOpen(false);
                  }}
                  aria-label="Закрыть обсуждения"
                  data-testid="notes-header-close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  <span className="icon-button__tooltip" data-testid="icon-button-tooltip">Закрыть</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_220px] overflow-hidden max-lg:grid-cols-1 pointer-events-auto">
            <section className="flex min-h-0 flex-col overflow-hidden border-r border-border/70 bg-panel max-lg:border-b max-lg:border-r-0">
              {error ? (
                <div
                  data-testid="notes-error-banner"
                  className="mx-4 mt-4 border-l-4 border-red-400 bg-red-50 px-3 py-3 text-sm text-red-700 transition-opacity duration-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span>{error}</span>
                    <button
                      type="button"
                      onClick={() => void fetchThreads()}
                      disabled={loading}
                      className="shrink-0 rounded border border-red-400 bg-white px-2 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid="notes-error-retry"
                    >
                      Повторить
                    </button>
                  </div>
                </div>
              ) : null}

              {createOpen ? (
                <div className="flex min-h-0 flex-1 overflow-auto bg-bg/10 px-4 py-4 sm:px-5 sm:py-5">
                  <div className="flex w-full max-w-3xl flex-col self-start rounded-xl border border-border bg-panel shadow-sm">
                    <div className="border-b border-border/70 px-5 py-4 sm:px-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-base font-bold leading-tight text-fg">Новое обсуждение</div>
                          <div className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
                            Создайте тему с понятной сутью, контекстом и первым сообщением.
                          </div>
                        </div>
                        <button type="button" className="secondaryBtn smallBtn" onClick={() => setCreateOpen(false)}>
                          Отмена
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-3 px-5 py-4 sm:px-6 sm:py-5">
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
                      <div className="rounded-lg border border-border/70 bg-bg/10 px-3 py-2 text-xs leading-relaxed text-muted">
                        {createContextSummary}
                      </div>
                      <div className="grid gap-3 rounded-lg border border-border/70 bg-bg/10 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
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
                        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border/70 bg-panel px-3 text-sm text-fg">
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
                        <MarkdownComposerToolbar
                          onAction={(action) => applyComposerMarkdownAction("create", action)}
                          disabled={disabled || !canCreateCurrentScope}
                          testId="notes-create-markdown-toolbar"
                        />
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
                  <div className="border-b border-border/70 bg-panel/95 px-4 py-3 sm:px-5" data-testid="notes-thread-header">
                    <div className="flex items-start justify-between gap-4 max-sm:flex-col">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          className="mb-2 inline-flex items-center gap-1 rounded px-2 py-1 text-[13px] font-medium text-fg transition hover:bg-[#f3f4f6]"
                          onClick={() => {
                            setPanelView("list");
                            setSelectedThreadId("");
                          }}
                          data-testid="notes-thread-back-to-list"
                        >
                          ← Назад
                        </button>
                        {renderThreadBreadcrumb()}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] leading-5 text-muted">
                          <span>{scopeMeta(selectedThread).relation}</span>
                        </div>
                        <div data-testid="notes-thread-header-meta" className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-5 text-muted">
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
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                          <span className="font-medium text-fg/70">{scopeMeta(selectedThread).short}</span>
                          <span className={`rounded-full border px-1.5 py-0.5 font-semibold leading-4 ${threadStatusTone(selectedThread)}`}>
                            {threadStatusLabel(selectedThread)}
                          </span>
                          {requiresAttention(selectedThread) ? (
                            <span className={`rounded-full border px-1.5 py-0.5 font-semibold leading-4 ${attentionMeta(selectedThread).tone}`}>
                              {attentionMeta(selectedThread).label}
                            </span>
                          ) : null}
                          {threadPriority(selectedThread) === "high" ? (
                            <span className={`rounded-full border px-1.5 py-0.5 font-semibold leading-4 ${priorityMeta(selectedThread).tone}`}>
                              {priorityMeta(selectedThread).shortLabel}
                            </span>
                          ) : null}
                        </div>
                        {selectedThreadIsLegacyBridge ? (
                          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                            Это compatibility bridge из legacy `notes_by_element`. История видна здесь, а новая локальная заметка по выбранному элементу записывается напрямую в legacy-модель без thread API и без удаления старого sidebar.
                          </div>
                        ) : null}
                      </div>
                      {!selectedThreadIsLegacyBridge ? (
                        <div className="relative flex shrink-0 items-start gap-1" data-testid="notes-thread-toolbar">
                          {selectedThreadLinkedElement ? (
                            <button
                              type="button"
                              className="icon-button inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 text-muted transition hover:border-info/55 hover:bg-info/10 hover:text-info"
                              onClick={focusSelectedThreadLinkedElement}
                              aria-label="Перейти к элементу на схеме"
                              data-testid="notes-thread-focus-linked-element"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                              <span className="icon-button__tooltip" data-testid="icon-button-tooltip">Перейти к элементу на схеме</span>
                            </button>
                          ) : null}
                          <div ref={threadActionsRef} className="relative">
                            <button
                              type="button"
                              className="icon-button inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 text-muted transition hover:border-info/55 hover:bg-info/10 hover:text-info"
                              onClick={() => setThreadActionsOpen((prev) => !prev)}
                              aria-label="Действия"
                              aria-expanded={threadActionsOpen}
                              aria-haspopup="menu"
                              data-testid="notes-thread-actions-toggle"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                              <span className="icon-button__tooltip" data-testid="icon-button-tooltip">Действия</span>
                            </button>
                            {threadActionsOpen ? (
                              <div className="thread-actions-dropdown" role="menu" data-testid="notes-thread-actions-menu">
                                <div className="thread-actions-dropdown-section" role="group" aria-label="Приоритет">
                                  <div className="thread-actions-dropdown-label">Приоритет</div>
                                  {PRIORITY_OPTIONS.map((item) => {
                                    const selected = threadPriority(selectedThread) === item.value;
                                    return (
                                      <button
                                        key={item.value}
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={selected}
                                        className="thread-actions-dropdown-item thread-actions-dropdown-item--radio"
                                        onClick={() => {
                                          patchThreadMeta({ priority: item.value });
                                          setThreadActionsOpen(false);
                                        }}
                                        disabled={busy.startsWith("meta:")}
                                        data-testid={`notes-thread-priority-${item.value}`}
                                      >
                                        <span className={`thread-actions-dropdown-radio ${selected ? "thread-actions-dropdown-radio--checked" : ""}`} />
                                        {item.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                {requiresAttention(selectedThread) ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="thread-actions-dropdown-item"
                                    onClick={() => {
                                      patchThreadMeta({ requires_attention: false });
                                      setThreadActionsOpen(false);
                                    }}
                                    disabled={busy.startsWith("meta:") || busy.startsWith("ack:")}
                                    data-testid="notes-thread-attention-toggle"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                                    Снять внимание
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="thread-actions-dropdown-item"
                                    onClick={() => {
                                      patchThreadMeta({ requires_attention: true });
                                      setThreadActionsOpen(false);
                                    }}
                                    disabled={busy.startsWith("meta:") || busy.startsWith("ack:")}
                                    data-testid="notes-thread-attention-toggle"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                    Требует внимания
                                  </button>
                                )}
                                {requiresAttention(selectedThread) && !attentionAcknowledged(selectedThread) ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="thread-actions-dropdown-item"
                                    onClick={() => {
                                      acknowledgeAttention();
                                      setThreadActionsOpen(false);
                                    }}
                                    disabled={busy.startsWith("ack:") || busy.startsWith("meta:")}
                                    data-testid="notes-thread-attention-acknowledge"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                                    Подтвердить
                                  </button>
                                ) : null}
                                {requiresAttention(selectedThread) && attentionAcknowledged(selectedThread) ? (
                                  <div className="thread-actions-dropdown-item thread-actions-dropdown-item--disabled" data-testid="notes-thread-attention-acknowledged">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                                    Подтверждено вами
                                  </div>
                                ) : null}
                                <hr className="thread-actions-dropdown-separator" />
                                {text(selectedThread.status) === "resolved" ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="thread-actions-dropdown-item"
                                    onClick={() => {
                                      patchStatus("open");
                                      setThreadActionsOpen(false);
                                    }}
                                    disabled={busy.startsWith("status:")}
                                    data-testid="notes-thread-status-open"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                                    Открыть обсуждение
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="thread-actions-dropdown-item thread-actions-dropdown-item--danger"
                                    onClick={() => {
                                      patchStatus("resolved");
                                      setThreadActionsOpen(false);
                                    }}
                                    disabled={busy.startsWith("status:")}
                                    data-testid="notes-thread-status-resolved"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    Закрыть обсуждение
                                  </button>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div data-testid="notes-thread-message-scroll" className="min-h-0 overflow-auto bg-bg/10 px-4 py-3">
                    <div data-testid="notes-thread-message-flow" className="flex flex-col gap-2">
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
                          const replyToId = text(comment?.reply_to_comment_id);
                          const replyTargetComment = replyToId
                            ? asArray(selectedThread.comments).find((item) => text(item?.id) === replyToId)
                            : null;
                          const replySummary = comment?.reply_to || (replyTargetComment ? {
                            id: text(replyTargetComment.id),
                            author_display: authorLabel(replyTargetComment?.author_user_id, authorLabelsById, viewerUserId),
                            body_preview: commentBodyPreview(replyTargetComment?.body),
                            created_at: Number(replyTargetComment?.created_at || 0) || 0,
                          } : null);
                          const isEditing = commentId && editingCommentId === commentId;
                          const canEditComment = !!viewerUserId && text(comment?.author_user_id) === viewerUserId;
                          return (
                            <article
                              key={commentId || `comment_${idx + 1}`}
                              data-note-comment-id={commentId || undefined}
                              className={`rounded-lg border px-3 py-2.5 transition ${discussionMessageClass(commentFocused)}`}
                            >
                              <div className="flex items-start gap-2">
                                <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border/65 bg-bg/20 text-[10px] font-semibold text-muted">
                                  {authorInitials(author)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                      <span className="text-[13px] font-semibold leading-5 text-fg">{author}</span>
                                      <span className="text-[11px] text-muted">{formatDate(comment?.updated_at || comment?.created_at) || "только что"}</span>
                                      {numericTime(comment?.edited_at) ? (
                                        <span className="text-[11px] font-semibold text-muted" data-testid="notes-comment-edited-marker">изменено</span>
                                      ) : null}
                                    </div>
                                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                                      {commentId ? (
                                        <button
                                          type="button"
                                          className="rounded-md border border-border/65 bg-transparent px-2 py-0.5 text-[10px] font-semibold text-muted transition hover:border-info/45 hover:bg-info/10 hover:text-info disabled:cursor-not-allowed disabled:opacity-60"
                                          onClick={() => startReply(comment, author)}
                                          disabled={disabled || busy.startsWith("comment:") || busy.startsWith("edit:")}
                                          data-testid="notes-comment-reply-action"
                                        >
                                          Ответить
                                        </button>
                                      ) : null}
                                      {canEditComment ? (
                                        <button
                                          type="button"
                                          className="rounded-md border border-border/65 bg-transparent px-2 py-0.5 text-[10px] font-semibold text-muted transition hover:border-info/45 hover:bg-info/10 hover:text-info disabled:cursor-not-allowed disabled:opacity-60"
                                          onClick={() => startEditComment(comment)}
                                          disabled={disabled || busy.startsWith("edit:")}
                                          data-testid="notes-comment-edit-action"
                                        >
                                          Редактировать
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                  {replyToId ? (
                                    <div className="mt-2 rounded-lg border-l-2 border-info/45 bg-info/5 px-2.5 py-1.5 text-xs leading-relaxed text-muted" data-testid="notes-comment-reply-quote">
                                      {replySummary ? (
                                        <>
                                          <div className="font-semibold text-fg">{text(replySummary.author_display) || "Пользователь"}</div>
                                          <div className="mt-0.5 line-clamp-2">{text(replySummary.body_preview) || "Сообщение без текста"}</div>
                                        </>
                                      ) : (
                                        <div className="font-semibold">Исходное сообщение недоступно.</div>
                                      )}
                                    </div>
                                  ) : null}
                                  {isEditing ? (
                                    <div className="mt-2" data-testid="notes-comment-edit-form">
                                      <div className="relative">
                                        <textarea
                                          ref={editDraftRef}
                                          className="textarea min-h-[92px] w-full text-sm"
                                          value={editDraftByComment[commentId] || ""}
                                          onChange={(event) => updateEditDraft(commentId, event.target.value, event.target.selectionStart)}
                                          onKeyDown={(event) => handleMentionKeyDown(event, editMentionComposer, editMentionSuggestions, setEditComposerForActive, selectEditMention)}
                                          disabled={disabled || busy === `edit:${commentId}`}
                                          data-testid="notes-comment-edit-textarea"
                                        />
                                        {renderMentionSuggestions("edit", editMentionComposer, editMentionSuggestions, selectEditMention, "below")}
                                      </div>
                                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-[11px] text-muted">
                                          {mentionUserIdsForSubmit(editDraftByComment[commentId] || "", editMentionComposer.selected).length
                                            ? `Упоминаний: ${mentionUserIdsForSubmit(editDraftByComment[commentId] || "", editMentionComposer.selected).length}`
                                            : "Поддерживается Markdown"}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button type="button" className="secondaryBtn smallBtn" onClick={() => cancelEditComment(commentId)} disabled={busy === `edit:${commentId}`}>
                                            Отмена
                                          </button>
                                          <button
                                            type="button"
                                            className="primaryBtn smallBtn"
                                            onClick={() => saveEditComment(comment)}
                                            disabled={busy === `edit:${commentId}` || !text(editDraftByComment[commentId])}
                                            data-testid="notes-comment-edit-save"
                                          >
                                            {busy === `edit:${commentId}` ? "Сохраняем..." : "Сохранить"}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <NoteMarkdown>{comment?.body}</NoteMarkdown>
                                  )}
                                  {asArray(comment?.mentions).length ? (
                                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted" data-testid="notes-comment-mentions">
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
                    <div className="border-t border-border/70 bg-panel/98 px-4 py-3 shadow-[0_-10px_24px_rgba(15,23,42,0.06)] sm:px-5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-fg">Локальная заметка элемента</div>
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
                    <div className="border-t border-border/70 bg-panel/98 px-4 py-3 shadow-[0_-10px_24px_rgba(15,23,42,0.06)] sm:px-5">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-fg">Ответить</div>
                        <div className="text-[11px] text-muted">Сообщение добавится в текущее обсуждение.</div>
                      </div>
                      {replyTarget ? (
                        <div className="mb-2 flex items-start justify-between gap-3 rounded-lg border-l-2 border-info/45 bg-info/5 px-3 py-1.5 text-xs leading-relaxed" data-testid="notes-reply-preview">
                          <div className="min-w-0">
                            <div className="font-semibold text-fg">{text(replyTarget.author_display) || "Пользователь"}</div>
                            <div className="mt-0.5 line-clamp-2 text-muted">{text(replyTarget.body_preview) || "Сообщение без текста"}</div>
                          </div>
                          <button
                            type="button"
                            className="secondaryBtn tinyBtn h-7 px-2 text-[11px]"
                            onClick={() => clearReplyTarget()}
                            data-testid="notes-reply-cancel"
                          >
                            Отмена
                          </button>
                        </div>
                      ) : null}
                      <MarkdownComposerToolbar
                        onAction={(action) => applyComposerMarkdownAction("reply", action)}
                        disabled={disabled}
                        testId="notes-reply-markdown-toolbar"
                      />
                      <div className="relative">
                        <textarea
                          ref={commentDraftRef}
                          className="textarea min-h-[78px] w-full border-border/70 bg-bg/10 text-sm shadow-none"
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
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[11px] leading-relaxed text-muted">
                          {mentionUserIdsForSubmit(commentDraft, commentMentionComposer.selected).length
                            ? `Упоминаний: ${mentionUserIdsForSubmit(commentDraft, commentMentionComposer.selected).length}`
                            : "Поддерживается Markdown"}
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
                  <div className="max-w-sm rounded-xl border border-dashed border-border bg-panel/70 px-5 py-6">
                    <div className="text-base font-bold text-fg">Выберите обсуждение</div>
                    <div className="mt-2 text-sm leading-relaxed text-muted">
                      Справа можно выбрать существующую тему или создать новую через кнопку в шапке.
                    </div>
                  </div>
                </div>
              )}
            </section>

            <aside className="flex min-h-0 flex-col bg-bg/10 px-3 py-3">
              {notificationMode ? (
                <div data-testid="discussion-notification-inbox" className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-panel/85 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Уведомления</div>
                      <div className="mt-0.5 truncate text-[11px] text-muted">
                        {notificationCenter.totalCount > 0
                          ? `${notificationCenter.totalCount} тем требуют действия`
                          : "Нет новых уведомлений"}
                      </div>
                    </div>
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
                    {renderNotificationCenter()}
                  </div>
                </div>
              ) : (
                <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`primaryBtn tinyBtn h-8 shrink-0 px-2.5 text-[12px] ${createOpen ? "ring-1 ring-info/35" : ""}`}
                  onClick={() => {
                    setCreateOpen(true);
                    setError("");
                  }}
                  disabled={disabled}
                  data-testid="notes-filters-create"
                >
                  + Новое
                </button>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  </span>
                  <input
                    type="search"
                    data-testid="notes-sidebar-search"
                    className="input h-8 min-h-0 w-full border-border/80 bg-panel/75 pl-8 text-sm shadow-none"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Поиск"
                    aria-label="Поиск по обсуждениям"
                  />
                </div>
                <button
                  type="button"
                  data-testid="notes-filters-toggle"
                  className={`icon-button relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 text-muted transition hover:border-info/55 hover:bg-info/10 hover:text-info ${filtersOpen ? "ring-1 ring-accent/50" : ""}`}
                  onClick={() => setFiltersOpen((prev) => !prev)}
                  aria-expanded={filtersOpen}
                  aria-label="Открыть фильтры обсуждений"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16"/><path d="M8 12h8"/><path d="M6 18h12"/></svg>
                  {activeFilterCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-info text-[9px] font-bold leading-none text-white">
                      {activeFilterCount}
                    </span>
                  ) : null}
                  <span className="icon-button__tooltip" data-testid="icon-button-tooltip">Фильтры</span>
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 text-muted transition hover:border-info/55 hover:bg-info/10 hover:text-info disabled:opacity-60"
                  onClick={() => void fetchThreads()}
                  disabled={loading}
                  aria-label="Обновить обсуждения"
                  title="Обновить"
                  data-testid="notes-filters-refresh"
                >
                  {loading ? (
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                  )}
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-border/60 bg-bg/20 p-1 text-[12px] font-semibold" aria-label="Фильтр участия в обсуждениях">
                <button
                  type="button"
                  className={`rounded-md px-2 py-1.5 transition ${participationFilter === "all" ? "bg-panel2 text-fg shadow-sm" : "text-muted hover:bg-panel2/50 hover:text-fg"}`}
                  onClick={() => setParticipationFilter("all")}
                  data-testid="notes-participation-filter-all"
                >
                  Все
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2 py-1.5 transition ${participationFilter === "my" ? "bg-panel2 text-fg shadow-sm" : "text-muted hover:bg-panel2/50 hover:text-fg"}`}
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
                <div data-testid="notes-filters-panel" className="mt-2 rounded-lg border border-border/70 bg-panel/80 p-2.5 shadow-sm">
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
                    <div className="mt-2 rounded-lg border border-border bg-bg/40 px-2.5 py-2 text-[11px] text-muted">
                      Сначала выберите BPMN-элемент на диаграмме.
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-2 min-h-0 flex-1 overflow-auto pr-1">
                {loading ? (
                  <DiscussionThreadSkeletonList />
                ) : error && displayThreads.length === 0 ? (
                  null
                ) : visibleThreads.length ? (
                  <div className="grid gap-2 transition-opacity duration-200" data-testid="notes-thread-list">
                    {visibleThreads.map((thread) => {
                      const threadId = text(thread?.id);
                      const active = threadId === text(selectedThread?.id);
                      const mentionLabel = firstMentionLabel(thread, authorLabelsById, viewerUserId);
                      const newMessagesCount = unreadCount(thread);
                      const attentionActive = requiresAttention(thread);
                      const childSessionId = text(thread?.session_id || thread?.sessionId);
                      const childSession = thread?._isChildSessionThread ? sessionById.get(childSessionId) : null;
                      const childSessionLabel = childSession
                        ? (text(childSession.title || childSession.name) || text(childSession.element_id_in_parent || childSession.elementIdInParent) || "Подпроцесс")
                        : "";
                      return (
                        <button
                          key={threadId}
                          type="button"
                          className={discussionThreadRowClass({ active, attentionActive })}
                          onClick={() => {
                            setCreateOpen(false);
                            setSelectedThreadId(threadId);
                            setPanelView("thread");
                          }}
                        >
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <div className="line-clamp-2 text-[14px] font-semibold leading-[1.3] text-[#1a1a2e]">{threadTitle(thread)}</div>
                              {newMessagesCount > 0 ? (
                                <span
                                  className="shrink-0 rounded-full border border-info/55 bg-info/10 px-1.5 py-0.5 text-[10px] font-bold leading-4 tabular-nums text-info"
                                  title={`Новые сообщения: ${newMessagesCount}`}
                                  aria-label={`Новые сообщения: ${newMessagesCount}`}
                                  data-testid="notes-thread-unread-badge"
                                >
                                  {newMessagesCount}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 line-clamp-2 text-[12px] leading-snug text-[#6b7280]">
                              {commentBodyPreview(threadPreview(thread), "Без текста")}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#9ca3af]">
                              <span>Создал {threadCreatorLabel(thread, authorLabelsById, viewerUserId)}</span>
                              <span aria-hidden="true">·</span>
                              <span>последний ответ {threadLastAuthorLabel(thread, authorLabelsById, viewerUserId)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{formatDate(threadUpdatedAt(thread)) || "сейчас"}</span>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px]">
                            <span className={`${threadStatusListClass(thread)}`}>{threadStatusLabel(thread)}</span>
                            {attentionActive ? (
                              <span className={`${attentionListClass()}`}>
                                {attentionMeta(thread).shortLabel}
                              </span>
                            ) : null}
                            {threadPriority(thread) === "high" ? (
                              <span className={`rounded border px-1.5 py-0.5 font-semibold leading-4 ${priorityMeta(thread).tone}`}>{priorityMeta(thread).shortLabel}</span>
                            ) : null}
                            {mentionLabel ? (
                              <span className="min-w-0 max-w-full truncate rounded border border-info/40 bg-info/10 px-1.5 py-0.5 font-semibold leading-4 text-info">
                                {mentionLabel}
                              </span>
                            ) : null}
                            {childSessionLabel ? (
                              <span
                                data-testid="notes-thread-child-session-label"
                                className={`min-w-0 max-w-[160px] truncate ${childSessionListClass()}`}
                                title={`Обсуждение находится в подпроцессе: ${childSessionLabel}`}
                              >
                                {childSessionLabel}
                              </span>
                            ) : null}
                            <span className="ml-auto text-[10px] leading-4 text-muted">{asArray(thread.comments).length} сообщ.</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : displayThreads.length === 0 ? (
                  <DiscussionEmptyState
                    disabled={disabled}
                    scopeFilter={scopeFilter}
                    selectedElementName={selectedElementName}
                    onCreate={() => {
                      if (scopeFilter === "selected_element" && selectedElementId) {
                        setCreateScope("diagram_element");
                      } else if (scopeFilter === "diagram") {
                        setCreateScope("diagram");
                      } else {
                        setCreateScope("session");
                      }
                      setCreateOpen(true);
                      setError("");
                    }}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-panel/70 p-4 text-sm text-muted transition-opacity duration-200">
                    {participationFilter === "my" && participatedThreadsCount === 0
                      ? "Пока нет обсуждений с вашим участием."
                      : "По текущим фильтрам ничего не найдено."}
                  </div>
                )}
              </div>
                </>
              )}
            </aside>
          </div>
          </>
          ) : (
            <button
              type="button"
              className="flex flex-1 flex-col items-center gap-2 py-4 pointer-events-auto"
              onClick={() => setIsCollapsed(false)}
              title="Развернуть обсуждения"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-info/10 text-sm text-info" aria-hidden="true">✎</span>
              {aggregate?.open_notes_count > 0 ? (
                <span className="rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {aggregate.open_notes_count}
                </span>
              ) : null}
            </button>
          )}
        </div>
      ) : null}
    </>
  );
});

export default NotesMvpPanel;
