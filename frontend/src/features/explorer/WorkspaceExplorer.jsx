/**
 * WorkspaceExplorer — Finder-like navigator for Workspaces → Folders → Projects → Sessions.
 *
 * Layout:
 *   [ WorkspaceSidebar ] | [ ExplorerPane / ProjectPane ]
 *
 * Rules (enforced in UI):
 *   • Folder row supports two actions: chevron expand/collapse (inline) + title navigate (page)
 *   • Inline tree is folder/project only (sessions stay on project page)
 *   • Folder DoD uses rollup_dod_percent (null => "—")
 *   • Project DoD uses project.dod_percent
 *   • Session shows: name, stage, owner, dod_percent, attention_count, reports_count, status, open discussions badge
 *   • Session cannot be in folder directly — always inside project
 */

import React, { useState, useEffect, useCallback, useMemo, useReducer, useRef } from "react";
import { createPortal } from "react-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { explorerPageQueryKey, explorerPageQueryOptions } from "./explorerPageQuery.js";
import {
  EXPLORER_TREE_COLLAPSED_KEY,
  USER_PREFERENCES_QUERY_KEY,
  createExplorerTreeSaver,
  expandedIdsFromMap,
  fetchUserPreferences,
} from "./explorerTreePersistence.js";
import SessionCreateModal from "./SessionCreateModal.jsx";
import {
  createSessionWithBpmnUpload,
  stripBpmnExtension,
  uploadSessionBpmnOnly,
  uploadStageLabel,
  validateBpmnUploadFile,
} from "./bpmnUploadFlow.js";
import {
  apiRenameWorkspace,
  apiGetExplorerPage,
  apiCreateFolder,
  apiRenameFolder,
  apiUpdateFolder,
  apiMoveFolder,
  apiDeleteFolder,
  apiCreateProject,
  apiMoveProject,
  apiGetProjectPage,
  apiSearchExplorer,
  apiCreateSession,
  apiGetSessionChildren,
  apiGetSubprocessesCount,
  apiCreateSubprocessSessions,
} from "./explorerApi.js";
import { apiDeleteProject, apiDeleteSession, apiGetSession, apiListOrgAssignableUsers, apiPatchProject, apiPatchSession } from "../../lib/api";
import {
  getManualSessionStatusMeta,
} from "../workspace/workspacePermissions";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useFeatureFlag } from "../config/featureFlagsContext.jsx";
import { buildVisibleRows, hasFolderChildren, projectHasSessions } from "./work3TreeState.js";
import { projectSessionsQueryKey, projectSessionsQueryOptions } from "./projectSessionsQuery.js";
import { useWorkspaceExplorerController } from "./useWorkspaceExplorerController.js";
import {
  ExplorerSidebarProvider,
  useExplorerSidebarHeader,
  useSetExplorerSidebarHeader,
} from "./ExplorerSidebarContext.jsx";
import { buildFolderMoveTargets, buildProjectMoveTargets } from "./explorerMoveTargets.js";
import {
  buildExplorerGlobalSearchModel,
  buildExplorerSearchIndex,
  buildProjectSessionSearchIndex,
  filterExplorerSearchResults,
} from "./explorerSearchModel.js";
import {
  sortExplorerChildItemsByFolder,
  sortExplorerItems,
  sortProjectSessions,
  toggleExplorerSort,
} from "./explorerSortModel.js";
import { buildProjectBreadcrumbTrail, normalizeProjectBreadcrumbBase } from "./workspaceBreadcrumbs.js";
import { folderCreateCopy, folderDisplayLabel } from "./workspaceDisplayLabels.js";
import {
  filterExplorerAssignableUsers,
  formatExplorerUserDisplay,
  EXPLORER_ASSIGNEE_USERS_LOAD_TIMEOUT_MS,
  getExplorerAssignableUserId,
  getExplorerAssigneeActionLabel,
  getExplorerAssigneeDialogTitle,
  getExplorerAssigneeId,
  getExplorerAssigneeKind,
  getExplorerBusinessAssignee,
  getExplorerBusinessAssigneeLabel,
  mergeExplorerAssignableCurrentUser,
  normalizeExplorerAssignableUsersResponse,
} from "./explorerAssigneeModel.js";
import {
  getExplorerStatusEntry,
  getExplorerStatusOptions,
  explorerStatusChangeReducer,
  mapStatusToCatalog,
  mapCatalogStatusToProjectApi,
} from "./explorerStatusCatalog.js";
import {
  isExplorerContextStatusEditable,
  normalizeExplorerContextStatus,
} from "./explorerContextStatusModel.js";
import {
  buildExplorerRowMeta,
  explorerMarqueeMotion,
  explorerVisibleColumnCount,
  getExplorerColumnLayout,
  isExplorerTextTruncated,
} from "./explorerColumnVisibility.js";
import "./explorerAdaptive.css";
import AppRouteLink from "../../components/navigation/AppRouteLink.jsx";
import TextBreadcrumbs from "../../components/TextBreadcrumbs.jsx";
import useElementWidth from "../../components/useElementWidth.js";
import {
  getNavSingleLineLayout,
  getWorkspaceHeaderLayout,
} from "../../components/navSingleLineLayout.js";
import { useWorkspaceMainNavSlot } from "../../components/workspaceMainNavSlot.js";
import NotesAggregateBadge from "../../components/NotesAggregateBadge.jsx";
import { useSessionNoteAggregates } from "../../lib/sessionNoteAggregates.js";
import { buildAppWorkspaceHref, shouldHandleClientNavigation } from "../navigation/appLinkBehavior.js";
import AnalyticsPage from "../analytics/AnalyticsPage.jsx";
import {
  avatarColorFromName,
  compositionProjectsText,
  firstName,
  formatAbsoluteDateTime,
  formatRelativeTime,
  initialsFromName,
  sessionsCounterText,
  sessionsProgressPercent,
  sessionsTooltipText,
  workspaceSectionCounterText,
} from "./explorerTableFormat.js";

// ─── Icons (inline SVG to avoid external deps) ────────────────────────────────
function IcoFolder({ open = false, className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
      {open
        ? <path d="M1 4h14v9a1 1 0 01-1 1H2a1 1 0 01-1-1V4zM1 4V3a1 1 0 011-1h4l1 2H1z" fill="currentColor" opacity=".85" />
        : <path d="M1 4v9a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1H7.5L6.5 3H2a1 1 0 00-1 1z" fill="currentColor" opacity=".75" />
      }
    </svg>
  );
}
function IcoProject({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="none" opacity=".8" />
      <path d="M4 5h8M4 8h8M4 11h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}
function IcoSession({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" fill="none" opacity=".75" />
      <path d="M8 4.5v4l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".8" />
    </svg>
  );
}
function IcoChevron({ right = false, className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
      {right
        ? <path d="M4.5 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M2 4.5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      }
    </svg>
  );
}
function IcoArrowLeft({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcoSpinner({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.25" />
      <path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IcoWorkspace({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" fill="none" opacity=".8" />
      <circle cx="5.5" cy="5.5" r="1.5" fill="currentColor" opacity=".6" />
      <circle cx="10.5" cy="5.5" r="1.5" fill="currentColor" opacity=".6" />
      <circle cx="5.5" cy="10.5" r="1.5" fill="currentColor" opacity=".6" />
      <circle cx="10.5" cy="10.5" r="1.5" fill="currentColor" opacity=".6" />
    </svg>
  );
}
function IcoPlus({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IcoTrash({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M3.5 3.5l.5 8a.5.5 0 00.5.5h5a.5.5 0 00.5-.5l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IcoEdit({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 2L12 5l-7.5 7.5L1 13l.5-3.5L9 2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcoMove({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1v12M1 7h12M3 3l-2 4 2 4M11 3l2 4-2 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />
    </svg>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function ts(epoch) {
  return formatRelativeTime(epoch);
}

function activitySourceLabel(node) {
  const sourceType = String(node?.last_activity_source_type || "").trim().toLowerCase();
  const sourceTitle = String(node?.last_activity_source_title || "").trim();
  if (!sourceType && !sourceTitle) return "—";
  const typeLabel = sourceType === "session" ? "Сессия" : sourceType === "project" ? "Проект" : sourceType === "folder" ? "Папка" : "Изменение";
  if (!sourceTitle) return typeLabel;
  return `${typeLabel} «${sourceTitle}»`;
}

function normalizeDodPercent(percentRaw) {
  if (percentRaw === null || percentRaw === undefined || String(percentRaw).trim() === "") return null;
  const n = Number(percentRaw);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 0) return 0;
  if (rounded > 100) return 100;
  return rounded;
}

function formatSessionPatchError(resp, fallback = "Не удалось сменить статус") {
  const detail = resp?.data?.detail;
  if (detail && typeof detail === "object") {
    const code = String(detail.code || "").trim();
    if (code === "STATUS_TRANSITION_INVALID") {
      return "Переход в выбранный статус недоступен для текущего состояния сессии.";
    }
    if (code === "DIAGRAM_STATE_BASE_VERSION_REQUIRED") {
      return "Не удалось сменить статус: требуется актуальная версия диаграммы. Обновите страницу и повторите.";
    }
    if (code === "DIAGRAM_STATE_CONFLICT") {
      return "Не удалось сменить статус: обнаружен конфликт версии диаграммы. Обновите страницу и повторите.";
    }
    if (code === "STATUS_ONLY_ENDPOINT") {
      return "Смена статуса недоступна в этом контексте. Обновите страницу и повторите.";
    }
    try {
      const packed = JSON.stringify(detail);
      if (packed && packed !== "{}") return `${fallback}: ${packed}`;
    } catch {
      // ignore serialization errors
    }
  }

  const err = String(resp?.error || "").trim();
  if (err && err !== "[object Object]") {
    const lower = err.toLowerCase();
    if (lower.includes("invalid status transition") || lower.includes("status_transition_invalid")) {
      return "Переход в выбранный статус недоступен для текущего состояния сессии.";
    }
    return err;
  }

  if (Number(resp?.status || 0) === 409) {
    return "Не удалось сменить статус: конфликт версии диаграммы. Обновите страницу и повторите.";
  }
  return fallback;
}

function collectIdsWithChildren(sessions) {
  const ids = new Set();
  function walk(list) {
    for (const s of list || []) {
      const sid = String(s?.id || "").trim();
      if (!sid) continue;
      if (s?.has_children) ids.add(sid);
      if (Array.isArray(s?.children)) walk(s.children);
    }
  }
  walk(sessions);
  return ids;
}

function collectSessionIdsRecursive(sessions) {
  const ids = [];
  function walk(list) {
    for (const s of list || []) {
      const sid = String(s?.id || "").trim();
      if (sid) ids.push(sid);
      if (Array.isArray(s?.children)) walk(s.children);
    }
  }
  walk(sessions);
  return ids;
}

function patchSessionInTree(sessions, sessionId, patch) {
  if (!Array.isArray(sessions)) return false;
  for (let i = 0; i < sessions.length; i += 1) {
    const s = sessions[i];
    if (String(s?.id || "").trim() === sessionId) {
      sessions[i] = { ...s, ...patch };
      return true;
    }
    if (Array.isArray(s?.children) && patchSessionInTree(s.children, sessionId, patch)) {
      return true;
    }
  }
  return false;
}

const EXPLORER_COLUMN_PROFILES = {
  tree: {
    showSignalColumns: false,
    showDiscussionColumn: false,
  },
  sessions: {
    showSignalColumns: true,
    showDiscussionColumn: true,
  },
};

function EntityTypePill({ type, label = "" }) {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "folder") {
    return <span className="inline-flex items-center rounded-full border border-sky-300/65 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg/85">{label || "Папка"}</span>;
  }
  if (normalized === "project") {
    return <span className="inline-flex items-center rounded-full border border-violet-300/65 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg/85">Проект</span>;
  }
  if (normalized === "session") {
    return <span className="inline-flex items-center rounded-full border border-emerald-300/65 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg/85">Сессия</span>;
  }
  return <span className="inline-flex items-center rounded-full border border-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg/70">—</span>;
}

function SortHeader({ label, sortKey, sort, onSort, align = "left", title = "" }) {
  const active = sort?.key === sortKey;
  const direction = active ? sort?.direction : "";
  const alignClass = align === "right" ? "justify-end text-right" : align === "center" ? "justify-center text-center" : "justify-start text-left";
  const nextDirection = active && direction === "asc" ? "по убыванию" : "по возрастанию";
  return (
    <button
      type="button"
      className={`inline-flex w-full items-center gap-1 rounded px-0 py-0 text-[11px] font-semibold uppercase tracking-wide text-inherit transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${alignClass}`}
      onClick={() => onSort(sortKey)}
      title={title || `Сортировать ${label} ${nextDirection}`}
      aria-label={`Сортировать ${label} ${nextDirection}`}
    >
      <span className="truncate">{label}</span>
      <span className={`inline-flex w-3 shrink-0 justify-center text-[10px] ${active ? "text-accent" : "text-transparent"}`} aria-hidden>
        {direction === "desc" ? "↓" : "↑"}
      </span>
    </button>
  );
}

function StatusBadge({ status, dotOnly = false }) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["draft", "in_progress", "review", "ready", "archived"].includes(normalized)) {
    const meta = getManualSessionStatusMeta(normalized);
    if (dotOnly) {
      return (
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${meta.badgeClass}`} title={`Статус: ${meta.label}`}>
          <span className="h-2 w-2 rounded-full bg-current" />
        </span>
      );
    }
    return (
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${meta.badgeClass}`}>
        {meta.label}
      </span>
    );
  }
  const map = {
    active: ["Активен", "border-emerald-300 bg-emerald-50 text-emerald-700"],
    on_hold: ["Пауза", "border-amber-300 bg-amber-50 text-amber-700"],
    done: ["Готов", "border-emerald-300 bg-emerald-50 text-emerald-700"],
    completed: ["Завершён", "border-emerald-300 bg-emerald-50 text-emerald-700"],
  };
  const [label, cls] = map[normalized] || ["—", "border-slate-300 bg-slate-100 text-slate-600"];
  if (dotOnly) {
    return (
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${cls}`} title={`Статус: ${label}`}>
        <span className="h-2 w-2 rounded-full bg-current" />
      </span>
    );
  }
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>{label}</span>;
}

function DodBar({ percent }) {
  const pct = normalizeDodPercent(percent);
  if (pct === null) {
    return <span className="text-xs text-muted">—</span>;
  }
  const cls = pct <= 30 ? "bg-rose-500" : pct <= 65 ? "bg-amber-400" : pct <= 80 ? "bg-lime-500" : "bg-emerald-700";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <span className="inline-block w-14 h-1.5 rounded-full bg-border overflow-hidden">
        <span className={`block h-full rounded-full ${cls}`} style={{ width: `${pct}%` }} />
      </span>
      <span>{pct}%</span>
    </span>
  );
}

function MetricCell({ label, value, warn = false, icon = null, emptyLabel = " " }) {
  const numericValue = Math.max(0, Number(value || 0) || 0);
  const metricLabel = label ? `${label}: ${numericValue}` : undefined;
  if (!numericValue) {
    return (
      <span className="text-[10px] text-muted/50" title={metricLabel} aria-label={metricLabel}>
        {emptyLabel}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center gap-1 text-xs font-semibold ${warn ? "text-warning" : "text-muted"}`}
      title={metricLabel}
      aria-label={metricLabel}
    >
      {icon ? <span aria-hidden>{icon}</span> : null}
      <span>{numericValue}</span>
    </span>
  );
}

function sessionDiscussionAttentionCount(aggregate) {
  if (!aggregate) return null;
  return Math.max(0, Number(aggregate?.attention_discussions_count || 0) || 0);
}

function LastActivityCell({ node, maxWidthClass = "max-w-[220px]", quiet = false }) {
  const label = activitySourceLabel(node);
  return (
    <td className={`px-2 py-2.5 text-xs ${quiet ? "text-fg/65" : "text-muted"}`}>
      <div className={`w-full ${maxWidthClass} truncate`} title={label}>
        {label}
      </div>
    </td>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const overlay = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-panel border border-border rounded-xl shadow-xl w-full max-w-sm mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-fg">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-fg text-lg leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
  if (typeof document === "undefined" || !document.body) return overlay;
  return createPortal(overlay, document.body);
}

function InputModal({ title, placeholder, initialValue = "", actionLabel = "Создать", onClose, onSubmit }) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const submit = async () => {
    const v = value.trim();
    if (!v) { setError("Нужно ввести название"); return; }
    setBusy(true);
    setError("");
    try {
      await onSubmit(v);
      onClose();
    } catch (e) {
      setError(String(e?.message || e || "Ошибка"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(""); }}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent mb-3"
        disabled={busy}
      />
      {error && <p className="text-xs text-danger mb-2">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="secondaryBtn h-8 px-3 text-sm" disabled={busy}>Отмена</button>
        <button onClick={submit} className="primaryBtn h-8 px-3 text-sm" disabled={busy || !value.trim()}>
          {busy ? "…" : actionLabel}
        </button>
      </div>
    </Modal>
  );
}

function ConfirmModal({ title, message, actionLabel = "Удалить", danger = true, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(String(e?.message || e || "Ошибка"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-muted mb-4">{message}</p>
      {error ? <p className="text-xs text-danger mb-3">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="secondaryBtn h-8 px-3 text-sm" disabled={busy}>Отмена</button>
        <button
          onClick={confirm}
          className={`h-8 px-3 text-sm rounded-lg font-medium ${danger ? "bg-danger text-white hover:bg-danger/80" : "primaryBtn"}`}
          disabled={busy}
        >
          {busy ? "…" : actionLabel}
        </button>
      </div>
    </Modal>
  );
}

function AssigneeCell({ item }) {
  const user = getExplorerBusinessAssignee(item);
  const fullName = formatExplorerUserDisplay(user);
  if (!fullName) {
    return <span className="text-[12.5px] text-muted/80">Не назначен</span>;
  }
  const jobTitle = String(user?.job_title || user?.role || "").trim();
  const tooltip = jobTitle ? `${fullName} · ${jobTitle}` : fullName;
  return (
    <span className="flex min-w-0 items-center gap-2" title={tooltip}>
      <span
        className="inline-flex h-[26px] w-[26px] shrink-0 select-none items-center justify-center rounded-full text-[10.5px] font-semibold tracking-[0.02em] text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
        style={{ backgroundColor: avatarColorFromName(fullName) }}
        aria-hidden
      >
        {initialsFromName(fullName)}
      </span>
      <span className="truncate text-[12.5px] text-muted">{firstName(fullName)}</span>
    </span>
  );
}

function CompositionCell({ item }) {
  const isFolder = String(item?.type || "").trim().toLowerCase() === "folder";
  // Знаменатель прогресса — только «активные» сессии (без архивных/удалённых).
  // Fallback на общий sessions_count для старых ответов API без trackable-полей.
  const total = isFolder
    ? (item?.descendant_trackable_sessions_count ?? item?.descendant_sessions_count)
    : (item?.trackable_sessions_count ?? item?.descendant_sessions_count ?? item?.sessions_count);
  const done = isFolder ? item?.descendant_done_sessions_count : item?.done_sessions_count;
  const pct = sessionsProgressPercent(done, total);
  return (
    <div className="flex min-w-0 items-center gap-3 text-[12.5px] text-muted">
      {isFolder ? (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title="Проектов в разделе">
          <IcoFolder className="h-3.5 w-3.5 shrink-0 text-muted/70" />
          <span className="font-semibold tabular-nums text-fg">{compositionProjectsText(item?.descendant_projects_count)}</span>
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={sessionsTooltipText(done, total)}>
        <span className="inline-block h-1 w-11 shrink-0 overflow-hidden rounded-full bg-border">
          <span
            className="block h-full rounded-full bg-emerald-600 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="font-mono text-[11.5px] tabular-nums">{sessionsCounterText(done, total)}</span>
      </span>
    </div>
  );
}

function UpdatedCell({ node }) {
  const epoch = node?.rollup_activity_at || node?.updated_at;
  const rel = formatRelativeTime(epoch);
  const label = activitySourceLabel(node);
  const hasLabel = Boolean(label) && label !== "—";
  const abs = formatAbsoluteDateTime(epoch);
  const title = [abs, hasLabel ? label : ""].filter(Boolean).join(" · ");
  return (
    <td className="px-2 py-2.5" title={title || undefined}>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="whitespace-nowrap text-[12.5px] font-semibold tabular-nums text-fg">{rel || "—"}</span>
        {hasLabel ? <span className="truncate text-xs text-muted/90">{label}</span> : null}
      </div>
    </td>
  );
}

// ─── P3 [А]: единый статус-контрол explorer (точка 7px + подпись + поповер) ──
// Заменяет прежний <select>: случайная смена при wheel/scroll невозможна —
// поповер открывается только явным кликом по бейджу.

// ─── P4 [А]: marquee длинных названий ─────────────────────────────────────────
// ellipsis + fade-маска всегда; прокрутка при hover — только если текст реально
// обрезан (scrollWidth > clientWidth) и нет prefers-reduced-motion (см. CSS).

function ExplorerMarqueeText({ text, className = "" }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return undefined;
    const measure = () => {
      const isTrunc = isExplorerTextTruncated(inner.scrollWidth, outer.clientWidth);
      setTruncated(isTrunc);
      const { shiftPx, durationSec } = explorerMarqueeMotion(inner.scrollWidth, outer.clientWidth);
      inner.style.setProperty("--explorer-marquee-x", `${-shiftPx}px`);
      inner.style.setProperty("--explorer-marquee-dur", `${durationSec}s`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [text]);
  return (
    <span ref={outerRef} className={`explorer-marquee ${truncated ? "is-truncated" : ""} ${className}`}>
      <span ref={innerRef} className="explorer-marquee__inner">{text}</span>
    </span>
  );
}

function StatusDotBadge({ domain, value }) {
  const entry = getExplorerStatusEntry(domain, value);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium" title={entry.label}>
      <span className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${entry.dotClass}`} aria-hidden />
      <span className={entry.textClass}>{entry.label}</span>
    </span>
  );
}

function StatusPopoverControl({ domain, value, disabled = false, onChange }) {
  const catalogValue = mapStatusToCatalog(domain, value);
  const [state, dispatch] = useReducer(explorerStatusChangeReducer, {
    current: catalogValue,
    pending: catalogValue,
    saving: false,
  });
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // синхронизация с серверным значением, пока не летит optimistic-запрос
  useEffect(() => {
    if (!state.saving) {
      const next = mapStatusToCatalog(domain, value);
      dispatch({ type: "success", value: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, value]);

  // закрытие по клику вне и по Escape
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const options = getExplorerStatusOptions(domain, state.current);
  const entry = getExplorerStatusEntry(domain, state.pending);

  const handleSelect = async (nextId) => {
    setOpen(false);
    if (nextId === state.current) return;
    dispatch({ type: "select", value: nextId });
    // catalog id == API value в обоих редактируемых доменах (folder context_status,
    // session manual status) — маппинг тождественный, см. explorerStatusCatalog.js.
    try {
      const ok = await onChange?.(nextId);
      if (ok === false) dispatch({ type: "failure" });
      else dispatch({ type: "success", value: nextId });
    } catch {
      dispatch({ type: "failure" });
    }
  };

  // клавиатурная навигация по пунктам: ↑/↓ — фокус, Enter/Space — выбор, Esc — закрыть
  const handleMenuKeyDown = (event) => {
    const items = Array.from(rootRef.current?.querySelectorAll('[role="menuitemradio"]') || []);
    const index = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      (items[index + 1] || items[0])?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      (items[index - 1] || items[items.length - 1])?.focus();
    }
  };

  return (
    <span ref={rootRef} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={disabled || state.saving}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1 py-1 text-xs font-medium transition-colors hover:bg-accentSoft/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-wait disabled:opacity-70"
        title={`Статус: ${entry.label}`}
        aria-label={`Статус: ${entry.label}`}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
      >
        <span className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${entry.dotClass}`} aria-hidden />
        <span className={entry.textClass}>{state.saving ? `${entry.label}…` : entry.label}</span>
      </button>
      {open ? (
        <span
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 min-w-[132px] rounded-lg border border-border bg-panel py-1 shadow-panel"
          onKeyDown={handleMenuKeyDown}
        >
          {options.map((option) => {
            const optionEntry = getExplorerStatusEntry(domain, option.id);
            const selected = option.id === state.current;
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected ? "true" : "false"}
                onClick={() => handleSelect(option.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accentSoft/40 focus:outline-none focus-visible:bg-accentSoft/50 ${selected ? "font-semibold text-fg" : "text-fg/85"}`}
              >
                <span className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${optionEntry.dotClass}`} aria-hidden />
                <span className="flex-1">{option.label}</span>
                <span className="w-3 text-accent" aria-hidden>{selected ? "✓" : ""}</span>
              </button>
            );
          })}
        </span>
      ) : null}
    </span>
  );
}

function assigneeMemberId(user) {
  return getExplorerAssignableUserId(user);
}

function assigneeMembersLoadTimeout() {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("assignee_members_timeout")), EXPLORER_ASSIGNEE_USERS_LOAD_TIMEOUT_MS);
  });
}

function AssigneeDialog({
  item,
  folderLabel = "Папка",
  users,
  loadingUsers = false,
  usersError = "",
  onClose,
  onSave,
}) {
  const [selectedUserId, setSelectedUserId] = useState(getExplorerAssigneeId(item));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = getExplorerAssigneeDialogTitle(item, { folderLabel });
  const filteredUsers = useMemo(() => filterExplorerAssignableUsers(users, query), [users, query]);

  useEffect(() => {
    setSelectedUserId(getExplorerAssigneeId(item));
    setQuery("");
    setError("");
  }, [item]);

  const submit = async (userId = selectedUserId) => {
    setBusy(true);
    setError("");
    try {
      await onSave(userId || null);
      onClose();
    } catch (e) {
      setError(String(e?.message || e || "Не удалось сохранить назначение"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError("");
          }}
          placeholder="Найти пользователя"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          disabled={busy || loadingUsers}
        />
        <div className="max-h-[280px] overflow-y-auto rounded-lg border border-border bg-bg/60 p-1.5">
          {loadingUsers ? (
            <div className="px-2.5 py-3 text-sm text-muted">Загрузка пользователей...</div>
          ) : filteredUsers.length ? (
            filteredUsers.map((user) => {
              const uid = assigneeMemberId(user);
              const name = formatExplorerUserDisplay(user) || uid;
              const email = String(user?.email || "").trim();
              const jobTitle = String(user?.job_title || "").trim();
              if (!uid) return null;
              return (
                <label
                  key={uid}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-2 text-sm text-fg transition-colors hover:bg-panelAlt"
                >
                  <input
                    type="radio"
                    name="explorer-assignee"
                    className="mt-1"
                    value={uid}
                    checked={selectedUserId === uid}
                    disabled={busy}
                    onChange={() => {
                      setSelectedUserId(uid);
                      setError("");
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{name}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                      {[email, jobTitle].filter(Boolean).join(" · ") || uid}
                    </span>
                  </span>
                </label>
              );
            })
          ) : (
            <div className="px-2.5 py-3 text-sm text-muted">
              {query ? "Пользователи не найдены." : "Нет доступных пользователей для назначения."}
            </div>
          )}
        </div>
        {usersError ? <p className="text-xs text-danger">{usersError}</p> : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="secondaryBtn h-8 px-3 text-sm" disabled={busy}>Отмена</button>
          <button
            onClick={() => submit(null)}
            className="secondaryBtn h-8 px-3 text-sm"
            disabled={busy || loadingUsers || (!getExplorerAssigneeId(item) && !selectedUserId)}
          >
            Очистить
          </button>
          <button
            onClick={() => submit()}
            className="primaryBtn h-8 px-3 text-sm"
            disabled={busy || loadingUsers || !selectedUserId}
          >
            {busy ? "…" : "Сохранить"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function folderMoveErrorMessage(resp) {
  const detail = resp?.data?.detail ?? resp?.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  const err = String(resp?.error || "").trim();
  if (err && err !== "[object Object]") return err;
  return "Не удалось переместить папку";
}

function projectMoveErrorMessage(resp) {
  const detail = resp?.data?.detail ?? resp?.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  const err = String(resp?.error || "").trim();
  if (err && err !== "[object Object]") return err;
  return "Не удалось переместить проект";
}

function MoveFolderDialog({
  workspaceId,
  folder,
  depth = 0,
  currentFolderId = "",
  currentParentId = "",
  rootItems,
  rootParentId = "",
  childItemsByFolder,
  onClose,
  onMoved,
}) {
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const folderLabel = folderDisplayLabel({ folder, depth, currentFolderId });
  const folderLabelAccusative = folderLabel === "Раздел" ? "раздел" : "папку";
  const targets = useMemo(
    () => buildFolderMoveTargets({
      rootItems,
      childItemsByFolder,
      rootParentId,
      movingFolder: folder,
      currentParentId,
    }),
    [rootItems, childItemsByFolder, rootParentId, folder, currentParentId],
  );
  const selectedTarget = targets.find((target) => target.id === selectedTargetId) || null;
  const hasEnabledTarget = targets.some((target) => !target.disabled);

  useEffect(() => {
    const current = targets.find((target) => target.id === selectedTargetId);
    if (current && !current.disabled) return;
    const firstEnabled = targets.find((target) => !target.disabled);
    setSelectedTargetId(firstEnabled ? firstEnabled.id : "");
  }, [targets, selectedTargetId]);

  const submit = async () => {
    if (!selectedTarget || selectedTarget.disabled) {
      setError("Выберите доступное расположение");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const resp = await apiMoveFolder(workspaceId, folder.id, selectedTarget.id);
      if (!resp?.ok) throw new Error(folderMoveErrorMessage(resp));
      await onMoved?.();
      onClose();
    } catch (e) {
      setError(String(e?.message || e || "Не удалось переместить папку"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Переместить ${folderLabelAccusative}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Выберите новое расположение для «{folder?.name || "Без названия"}». Нельзя переместить элемент внутрь самого себя или дочерней папки.
        </p>
        <div className="max-h-[280px] overflow-y-auto rounded-lg border border-border bg-bg/60 p-1.5">
          {targets.map((target) => (
            <label
              key={target.id || "__workspace_root__"}
              className={`flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ${
                target.disabled ? "cursor-not-allowed text-muted/55" : "text-fg hover:bg-panelAlt"
              }`}
            >
              <input
                type="radio"
                name="folder-move-target"
                className="mt-0.5"
                value={target.id}
                checked={selectedTargetId === target.id}
                disabled={target.disabled || busy}
                onChange={() => {
                  setSelectedTargetId(target.id);
                  setError("");
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{target.label}</span>
                {target.disabledReason ? (
                  <span className="mt-0.5 block text-[11px] text-muted/70">{target.disabledReason}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
        {!hasEnabledTarget ? (
          <p className="text-xs text-muted">
            Нет доступных загруженных расположений. Откройте или разверните нужную папку в Explorer и повторите перемещение.
          </p>
        ) : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="secondaryBtn h-8 px-3 text-sm" disabled={busy}>Отмена</button>
          <button
            onClick={submit}
            className="primaryBtn h-8 px-3 text-sm"
            disabled={busy || !selectedTarget || selectedTarget.disabled}
          >
            {busy ? "…" : "Переместить"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MoveProjectDialog({
  workspaceId,
  project,
  currentFolderId = "",
  currentFolder = null,
  rootItems,
  rootParentId = "",
  childItemsByFolder,
  onClose,
  onMoved,
}) {
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const targets = useMemo(
    () => buildProjectMoveTargets({
      rootItems,
      childItemsByFolder,
      rootParentId,
      project,
      currentFolderId,
      currentFolder,
    }),
    [rootItems, childItemsByFolder, rootParentId, project, currentFolderId, currentFolder],
  );
  const selectedTarget = targets.find((target) => target.id === selectedTargetId) || null;
  const hasEnabledTarget = targets.some((target) => !target.disabled);

  useEffect(() => {
    const current = targets.find((target) => target.id === selectedTargetId);
    if (current && !current.disabled) return;
    const firstEnabled = targets.find((target) => !target.disabled);
    setSelectedTargetId(firstEnabled ? firstEnabled.id : "");
  }, [targets, selectedTargetId]);

  const submit = async () => {
    if (!selectedTarget || selectedTarget.disabled) {
      setError("Выберите доступное расположение");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const resp = await apiMoveProject(workspaceId, project.id, selectedTarget.id);
      if (!resp?.ok) throw new Error(projectMoveErrorMessage(resp));
      await onMoved?.();
      onClose();
    } catch (e) {
      setError(String(e?.message || e || "Не удалось переместить проект"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Переместить проект" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Выберите раздел или папку, куда нужно переместить проект.
        </p>
        <div className="max-h-[280px] overflow-y-auto rounded-lg border border-border bg-bg/60 p-1.5">
          {targets.map((target) => (
            <label
              key={target.id}
              className={`flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ${
                target.disabled ? "cursor-not-allowed text-muted/55" : "text-fg hover:bg-panelAlt"
              }`}
            >
              <input
                type="radio"
                name="project-move-target"
                className="mt-0.5"
                value={target.id}
                checked={selectedTargetId === target.id}
                disabled={target.disabled || busy}
                onChange={() => {
                  setSelectedTargetId(target.id);
                  setError("");
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{target.label}</span>
                {target.disabledReason ? (
                  <span className="mt-0.5 block text-[11px] text-muted/70">{target.disabledReason}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
        {!hasEnabledTarget ? (
          <p className="text-xs text-muted">
            Нет доступных загруженных расположений. Откройте или разверните нужную папку в Explorer и повторите перемещение.
          </p>
        ) : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="secondaryBtn h-8 px-3 text-sm" disabled={busy}>Отмена</button>
          <button
            onClick={submit}
            className="primaryBtn h-8 px-3 text-sm"
            disabled={busy || !selectedTarget || selectedTarget.disabled}
          >
            {busy ? "…" : "Переместить"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ExplorerSearchBox({ id = "workspace-explorer-search", value, onChange, placeholder = "Поиск", className = "" }) {
  return (
    <div className={`flex h-8 max-w-full items-center gap-2 rounded-lg border border-border bg-bg px-2.5 ${className}`}>
      <span className="text-xs text-muted" aria-hidden>⌕</span>
      <label className="sr-only" htmlFor={id}>Поиск по workspace</label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-muted focus:outline-none"
        title="Поиск по workspace"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted transition-colors hover:bg-panelAlt hover:text-fg"
          title="Очистить поиск"
          aria-label="Очистить поиск"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function SearchResultRow({ result, onOpen }) {
  const entityType = result.type === "section" || result.type === "folder" ? "folder" : result.type;
  const metaParts = [
    result.pathLabel,
    result.statusLabel,
    result.assigneeMetaLabel,
    result.ownerLabel ? `Owner: ${result.ownerLabel}` : "",
    result.stageLabel,
  ]
    .filter(Boolean);
  return (
    <button
      type="button"
      onClick={() => onOpen(result)}
      className="w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-panelAlt focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <div className="flex min-w-0 items-center gap-2">
        <EntityTypePill type={entityType} label={result.typeLabel} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{result.title}</span>
      </div>
      {metaParts.length ? (
        <div className="mt-1 truncate text-xs text-muted">{metaParts.join(" · ")}</div>
      ) : result.subtitle ? (
        <div className="mt-1 truncate text-xs text-muted">{result.subtitle}</div>
      ) : null}
    </button>
  );
}

function ExplorerSearchResults({ model, onOpenResult }) {
  if (!model?.active) return null;
  const sourceCopy = model.source === "global"
    ? "Ищет разделы, папки, проекты и сессии во всей рабочей области."
    : "Поиск по загруженной структуре";
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-fg">Найдено: {model.total}</div>
          <div className="text-xs text-muted">{sourceCopy}</div>
        </div>
      </div>
      {model.loading ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-fg">Идёт поиск...</p>
        </div>
      ) : model.error ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-danger">Не удалось выполнить поиск.</p>
        </div>
      ) : model.total > 0 ? (
        <div className="space-y-4">
          {model.groups.map((group) => (
            <section key={group.type} className="space-y-1">
              <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{group.label}</div>
              <div className="rounded-lg border border-border bg-panel/40 p-1">
                {group.results.map((result) => (
                  <SearchResultRow key={`${result.type}-${result.id}`} result={result} onOpen={onOpenResult} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-fg">
            {model.source === "global" ? "Ничего не найдено во всей рабочей области." : "Ничего не найдено в текущей области."}
          </p>
          <p className="mt-1 max-w-md text-xs text-muted">{sourceCopy}</p>
        </div>
      )}
    </div>
  );
}

// ─── Workspace Sidebar Counters ───────────────────────────────────────────────

function useViewportBelow(breakpoint) {
  const [below, setBelow] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setBelow(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, [breakpoint]);
  return below;
}

const WorkspaceSidebarActiveCounters = React.memo(function WorkspaceSidebarActiveCounters({ workspaceId }) {
  const options = useMemo(
    () => ({
      ...explorerPageQueryOptions(workspaceId, ""),
      placeholderData: keepPreviousData,
      enabled: Boolean(workspaceId),
      refetchOnWindowFocus: false,
    }),
    [workspaceId]
  );
  const { data: page, isFetching } = useQuery(options);
  const items = Array.isArray(page?.items) ? page.items : [];
  const sectionCount = items.filter((item) => item?.type === "folder").length;
  // Root cause прежнего «0 проектов»: счётчик брал только top-level projects,
  // а в ФК все проекты лежат внутри разделов. Суммируем descendant_projects_count
  // по разделам и прибавляем проекты на верхнем уровне.
  const projectCount = items.reduce((sum, item) => {
    if (item?.type === "project") return sum + 1;
    if (item?.type === "folder") return sum + (item?.descendant_projects_count || 0);
    return sum;
  }, 0);
  const compact = useViewportBelow(1100);

  if (!workspaceId) return null;
  if (isFetching && !page) {
    return <span className="block h-3 w-20 rounded bg-border/50 animate-pulse" aria-hidden="true" />;
  }

  const full = `${workspaceSectionCounterText(sectionCount)} · ${compositionProjectsText(projectCount)}`;
  const shortLabel = `${sectionCount} · ${projectCount}`;
  const title = `Разделов: ${sectionCount} · Проектов: ${projectCount}`;

  return (
    <span
      className={`block whitespace-nowrap text-[11px] leading-tight ${isFetching ? "text-muted/40" : "text-muted/75"}`}
      title={title}
    >
      {compact ? shortLabel : full}
    </span>
  );
});

// ─── Explorer Left Column Header ──────────────────────────────────────────────
// Вынесен на верхний уровень: определение функции внутри render приводит к
// пересозданию компонента на каждом рендере и ломает stable reconciliation.

function ExplorerSidebarHeaderBlock() {
  const header = useExplorerSidebarHeader();
  return (
    <div
      className="h-10 border-b border-border flex items-center overflow-hidden whitespace-nowrap bg-panel"
      data-testid="explorer-sidebar-header"
    >
      {header || <span className="min-w-0 flex-1" aria-hidden="true" />}
    </div>
  );
}

// ─── Workspace Sidebar ────────────────────────────────────────────────────────

function WorkspaceSidebar({
  organizationName = "",
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  canCreateWorkspace = false,
  canRenameWorkspace = false,
  onWorkspaceRenamed,
}) {
  const [creating, setCreating] = useState(false);
  const [renamingWorkspace, setRenamingWorkspace] = useState(null);
  const queryClient = useQueryClient();
  const prefetchWorkspace = (wsId) => {
    if (!wsId || wsId === activeWorkspaceId) return;
    queryClient.prefetchQuery(explorerPageQueryOptions(wsId, ""));
  };
  return (
    <div className="h-full flex flex-col select-none">
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Organization</div>
          <div className="truncate text-xs text-fg/80" title={organizationName || "—"}>
            {organizationName || "—"}
          </div>
        </div>
      </div>
      <div className="px-3 pb-2 flex items-center justify-between border-b border-border/60">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Workspaces</span>
        {canCreateWorkspace ? (
          <button
            onClick={() => setCreating(true)}
            className="text-muted hover:text-fg transition-colors p-0.5 rounded"
            title="Новый workspace"
          >
            <IcoPlus />
          </button>
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto">
        {workspaces.length === 0 && (
          <p className="px-3 py-4 text-xs text-muted text-center">Нет workspaces</p>
        )}
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId;
          return (
            <div
              key={ws.id}
              onMouseEnter={() => prefetchWorkspace(ws.id)}
              onFocus={() => prefetchWorkspace(ws.id)}
              className={`w-full flex items-start gap-2 px-3 py-2 text-sm transition-colors rounded-none
                ${isActive
                  ? "bg-accentSoft text-accent font-medium"
                  : "text-fg hover:bg-bg"
                }`}
            >
              <button
                className={`min-w-0 flex-1 text-left ${isActive ? "flex flex-col" : "flex items-center gap-2"}`}
                onClick={() => onSelectWorkspace(ws.id)}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <IcoWorkspace className={isActive ? "text-accent" : "text-muted"} />
                  <span className="truncate">{ws.name}</span>
                </span>
                {isActive ? <WorkspaceSidebarActiveCounters workspaceId={ws.id} /> : null}
              </button>
              <span className="text-[10px] text-muted opacity-60 mt-0.5">{ws.role || "viewer"}</span>
              {canRenameWorkspace && isActive ? (
                <button className="text-muted hover:text-fg p-0.5 mt-0.5" title="Переименовать workspace" onClick={() => setRenamingWorkspace(ws)}>
                  <IcoEdit />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {creating && canCreateWorkspace && (
        <InputModal
          title="Новый Workspace"
          placeholder="Название workspace"
          actionLabel="Создать"
          onClose={() => setCreating(false)}
          onSubmit={onCreateWorkspace}
        />
      )}
      {renamingWorkspace ? (
        <InputModal
          title="Переименовать workspace"
          placeholder="Название workspace"
          initialValue={renamingWorkspace.name}
          actionLabel="Сохранить"
          onClose={() => setRenamingWorkspace(null)}
          onSubmit={async (name) => {
            const resp = await apiRenameWorkspace(renamingWorkspace.id, name);
            if (!resp?.ok) throw new Error(resp?.error || "Не удалось переименовать workspace");
            onWorkspaceRenamed?.();
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Context Menu (dropdown actions) ──────────────────────────────────────────

function ContextMenu({ items, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-30 bg-panel border border-border rounded-lg shadow-lg py-1 min-w-[140px]"
    >
      {items.map((item, i) =>
        item.separator
          ? <div key={i} className="my-1 border-t border-border" />
          : (
            <button
              key={i}
              onClick={() => { item.action(); onClose(); }}
              className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm transition-colors
                ${item.danger ? "text-danger hover:bg-danger/10" : "text-fg hover:bg-bg"}`}
            >
              {item.icon && <span className="opacity-70">{item.icon}</span>}
              {item.label}
            </button>
          )
      )}
    </div>
  );
}

// ─── Folder Row in Explorer ────────────────────────────────────────────────────

function FolderRow({
  folder,
  depth = 0,
  expanded = false,
  loading = false,
  onToggleExpand,
  onNavigate,
  onMove,
  onAssign,
  onContextStatusChange,
  workspaceId,
  onReload,
  canEdit = false,
  canDelete = false,
  currentFolderId = "",
  showSignalColumns = false,
  columnLayout,
}) {
  const layout = columnLayout || getExplorerColumnLayout(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const expandable = hasFolderChildren(folder);
  const leftPadding = 8 + depth * 18;
  const folderLabel = folderDisplayLabel({ folder, depth, currentFolderId });
  const folderLabelAccusative = folderLabel === "Раздел" ? "раздел" : "папку";
  const folderLabelGenitive = folderLabel === "Раздел" ? "раздела" : "папки";
  const folderLabelInstrumental = folderLabel === "Раздел" ? "разделом" : "папкой";
  const assigneeActionLabel = getExplorerAssigneeActionLabel(folder);

  const menuItems = [
    { label: "Открыть", icon: <IcoChevron right />, action: () => onNavigate(folder) },
    ...(expandable ? [{ label: expanded ? "Свернуть" : "Развернуть", icon: <IcoChevron right={!expanded} />, action: () => onToggleExpand(folder) }] : []),
    ...(canEdit ? [
      { label: assigneeActionLabel, icon: <IcoEdit />, action: () => onAssign?.(folder, folderLabel) },
      { label: "Переместить", icon: <IcoMove />, action: () => onMove?.(folder) },
      { label: "Переименовать", icon: <IcoEdit />, action: () => setRenaming(true) },
    ] : []),
    ...(canDelete ? [{ separator: true }, { label: "Удалить", icon: <IcoTrash />, danger: true, action: () => setDeleting(true) }] : []),
  ];

  return (
    <>
      <tr className="group hover:bg-accentSoft/30 transition-colors">
        <td className="px-2 py-2.5 text-sm font-medium text-fg">
          <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${leftPadding}px` }}>
            {expandable ? (
              <button
                type="button"
                onClick={() => onToggleExpand(folder)}
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-panelAlt/70 text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${loading ? "cursor-wait border-border/70" : "border-border/70 hover:border-border hover:bg-bg hover:text-fg active:bg-panelAlt"}`}
                disabled={loading}
                title={expanded ? `Скрыть вложенные элементы ${folderLabelGenitive}` : `Показать вложенные элементы ${folderLabelGenitive}`}
                aria-label={expanded ? `Скрыть вложенные элементы ${folderLabelGenitive} ${folder.name}` : `Показать вложенные элементы ${folderLabelGenitive} ${folder.name}`}
                aria-expanded={expanded ? "true" : "false"}
              >
                {loading ? (
                  <IcoSpinner className="animate-spin" />
                ) : (
                  <IcoChevron right className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} />
                )}
              </button>
            ) : (
              <span className="inline-flex h-6 w-6 shrink-0 rounded-md border border-transparent" aria-hidden />
            )}
            <IcoFolder className="shrink-0 text-accent/80" />
            <button
              className="block min-w-0 flex-1 text-left hover:underline"
              onClick={() => onNavigate(folder)}
              title={folder.name}
              data-testid={`folder-navigate-${folder.id}`}
            >
              <ExplorerMarqueeText text={folder.name} />
            </button>
          </div>
          {layout.compact ? (
            <div className="explorer-row-meta" style={{ paddingLeft: `${leftPadding + 32}px` }}>{buildExplorerRowMeta(folder, "folder")}</div>
          ) : null}
        </td>
        {layout.showType ? (
          <td className="px-2 py-2.5 text-xs text-muted"><EntityTypePill type="folder" label={folderLabel} /></td>
        ) : null}
        {layout.showComposition ? <td className="px-2 py-2.5"><CompositionCell item={folder} /></td> : null}
        {layout.showAssignee ? <td className="px-2 py-2.5"><AssigneeCell item={folder} /></td> : null}
        {showSignalColumns ? <td className="px-2 py-2.5 text-xs text-muted text-center">—</td> : null}
        {showSignalColumns ? <td className="px-2 py-2.5 text-xs text-muted text-center">—</td> : null}
        <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
          {canEdit && isExplorerContextStatusEditable(folder) ? (
            <StatusPopoverControl
              domain="folder"
              value={folder.context_status}
              disabled={loading}
              onChange={(nextStatus) => onContextStatusChange(folder, nextStatus)}
            />
          ) : (
            <StatusDotBadge domain="folder" value={folder.context_status} />
          )}
        </td>
        {layout.showUpdated ? <UpdatedCell node={folder} /> : null}
        <td className="px-2 py-2.5 w-8 text-right relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="opacity-45 group-hover:opacity-100 text-muted hover:text-fg px-1 py-0.5 rounded transition-all"
            title={`Действия с ${folderLabelInstrumental}`}
            aria-label={`Действия с ${folderLabelInstrumental}`}
          >
            ···
          </button>
          {menuOpen && <ContextMenu items={menuItems} onClose={() => setMenuOpen(false)} />}
        </td>
      </tr>
      {renaming && canEdit && (
        <InputModal
          title={`Переименовать ${folderLabelAccusative}`}
          placeholder="Новое название"
          initialValue={folder.name}
          actionLabel="Сохранить"
          onClose={() => setRenaming(false)}
          onSubmit={async (name) => {
            const resp = await apiRenameFolder(workspaceId, folder.id, name);
            if (!resp?.ok) throw new Error(resp?.error || "Не удалось переименовать");
            onReload();
          }}
        />
      )}
      {deleting && canDelete && (
        <ConfirmModal
          title={`Удалить ${folderLabelAccusative}`}
          message={`Удалить ${folderLabelAccusative} «${folder.name}»? Если внутри есть элементы, нужно подтвердить удаление с каскадом.`}
          actionLabel="Удалить"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const firstAttempt = await apiDeleteFolder(workspaceId, folder.id, false);
            if (!firstAttempt?.ok) {
              if (Number(firstAttempt?.status || 0) !== 409) {
                throw new Error(firstAttempt?.error || "Не удалось удалить папку");
              }
              const cascadeAttempt = await apiDeleteFolder(workspaceId, folder.id, true);
              if (!cascadeAttempt?.ok) {
                throw new Error(cascadeAttempt?.error || "Не удалось удалить папку с содержимым");
              }
            }
            onReload();
          }}
        />
      )}
    </>
  );
}

// ─── Project Row in Explorer ───────────────────────────────────────────────────

function ProjectRow({
  project,
  depth = 0,
  expanded = false,
  expandable = false,
  sessionsLoading = false,
  onToggleExpand,
  onClick,
  onMove,
  onAssign,
  onReload,
  canMove = false,
  canAssign = false,
  canRename = false,
  canDelete = false,
  showSignalColumns = false,
  columnLayout,
  uploadState = null,
  onFileDrop,
  onUploadRetry,
}) {
  const layout = columnLayout || getExplorerColumnLayout(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // P6 [Г]: строка проекта — drop-зона для .bpmn/.xml (подсветка при drag-over).
  const [fileDragOver, setFileDragOver] = useState(false);
  const leftPadding = 8 + depth * 18;
  const projectHref = buildAppWorkspaceHref({ projectId: project?.id || project?.project_id });
  const assigneeActionLabel = getExplorerAssigneeActionLabel(project);
  const menuItems = [
    { label: "Открыть", icon: <IcoChevron right />, action: () => onClick(project) },
    ...(canAssign ? [{ label: assigneeActionLabel, icon: <IcoEdit />, action: () => onAssign?.(project) }] : []),
    ...(canMove ? [{ label: "Переместить", icon: <IcoMove />, action: () => onMove?.(project) }] : []),
    ...(canRename ? [{ label: "Переименовать", icon: <IcoEdit />, action: () => setRenaming(true) }] : []),
    ...(canDelete ? [{ separator: true }, { label: "Удалить", icon: <IcoTrash />, danger: true, action: () => setDeleting(true) }] : []),
  ];
  return (
    <>
      <tr
        className={`group transition-colors ${fileDragOver ? "bg-accentSoft/40 outline-2 outline-dashed outline-accent/70 outline-offset-[-2px]" : "hover:bg-accentSoft/30"}`}
        data-testid={`project-row-${String(project?.id || "")}`}
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes?.("Files")) {
            e.preventDefault();
            e.stopPropagation();
            setFileDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setFileDragOver(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer?.files?.length) return;
          e.preventDefault();
          e.stopPropagation();
          setFileDragOver(false);
          onFileDrop?.(project, e.dataTransfer.files[0]);
        }}
      >
        <td className="px-2 py-2.5 text-sm font-medium text-fg">
          <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${leftPadding}px` }}>
            {expandable ? (
              <button
                type="button"
                onClick={() => onToggleExpand?.(project)}
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-panelAlt/70 text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${sessionsLoading ? "cursor-wait border-border/70" : "border-border/70 hover:border-border hover:bg-bg hover:text-fg active:bg-panelAlt"}`}
                disabled={sessionsLoading}
                title={expanded ? "Скрыть сессии проекта" : "Показать сессии проекта"}
                aria-label={expanded ? `Скрыть сессии проекта ${project.name}` : `Показать сессии проекта ${project.name}`}
                aria-expanded={expanded ? "true" : "false"}
              >
                {sessionsLoading ? (
                  <IcoSpinner className="animate-spin" />
                ) : (
                  <IcoChevron right className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} />
                )}
              </button>
            ) : (
              <span className="inline-flex h-6 w-6 shrink-0 rounded-md border border-transparent" aria-hidden />
            )}
            <IcoProject className="shrink-0 text-accent" />
            <AppRouteLink
              className="block min-w-0 flex-1 text-left"
              href={projectHref}
              onNavigate={() => onClick(project)}
              title={project.name}
            >
              <ExplorerMarqueeText text={project.name} className="hover:underline" />
            </AppRouteLink>
          </div>
          {layout.compact ? (
            <div className="explorer-row-meta" style={{ paddingLeft: `${leftPadding + 32}px` }}>{buildExplorerRowMeta(project, "project")}</div>
          ) : null}
          {uploadState && uploadState.stage && uploadState.stage !== "done" ? (
            <div className="mt-0.5 text-[11px]" style={{ paddingLeft: `${leftPadding + 32}px` }}>
              <PendingUploadStageLabel
                upload={{ ...uploadState, tempId: String(project?.id || "") }}
                onRetry={() => onUploadRetry?.(String(project?.id || ""))}
              />
            </div>
          ) : null}
        </td>
        {layout.showType ? (
          <td className="px-2 py-2.5 text-xs text-muted"><EntityTypePill type="project" /></td>
        ) : null}
        {layout.showComposition ? <td className="px-2 py-2.5"><CompositionCell item={project} /></td> : null}
        {layout.showAssignee ? <td className="px-2 py-2.5"><AssigneeCell item={project} /></td> : null}
        {showSignalColumns ? <td className="px-2 py-2.5 text-center"><MetricCell value={project.attention_count} warn /></td> : null}
        {showSignalColumns ? <td className="px-2 py-2.5 text-center"><MetricCell value={project.reports_count} /></td> : null}
        <td className="px-2 py-2.5">
          <StatusDotBadge domain="project" value={project.status} />
        </td>
        {layout.showUpdated ? <UpdatedCell node={project} /> : null}
        <td className={`px-2 py-2.5 text-right ${layout.compact ? "w-8" : "w-[88px]"}`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1.5">
            {layout.compact ? null : (
              <AppRouteLink
                className="secondaryBtn h-7 min-h-0 px-2 text-xs whitespace-nowrap transition-colors hover:border-accent/40 hover:text-fg"
                href={projectHref}
                onNavigate={() => onClick(project)}
              >
                Открыть проект
              </AppRouteLink>
            )}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="opacity-55 group-hover:opacity-100 text-muted hover:text-fg px-1 py-0.5 rounded transition-all"
              title="Действия с проектом"
              aria-label="Действия с проектом"
            >···</button>
            {menuOpen && <ContextMenu items={menuItems} onClose={() => setMenuOpen(false)} />}
          </div>
        </td>
      </tr>
      {renaming && canRename ? (
        <InputModal
          title="Переименовать проект"
          placeholder="Новое название проекта"
          initialValue={project.name}
          actionLabel="Сохранить"
          onClose={() => setRenaming(false)}
          onSubmit={async (name) => {
            const resp = await apiPatchProject(project.id, { title: name });
            if (!resp?.ok) throw new Error(resp?.error || "Не удалось переименовать проект");
            onReload?.();
          }}
        />
      ) : null}
      {deleting && canDelete ? (
        <ConfirmModal
          title="Удалить проект"
          message={`Удалить проект «${project.name}» вместе со всеми сессиями?`}
          actionLabel="Удалить"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const resp = await apiDeleteProject(project.id);
            if (!resp?.ok) throw new Error(resp?.error || "Не удалось удалить проект");
            onReload?.();
          }}
        />
      ) : null}
    </>
  );
}

// ─── P2 [Б]: Session rows под раскрытым проектом (3-й уровень дерева) ────────

function SessionTreeRow({ session, project, depth = 0, showSignalColumns = false, onOpen, onStatusChange, columnLayout }) {
  const layout = columnLayout || getExplorerColumnLayout(0);
  const leftPadding = 8 + depth * 18;
  const isSubprocess = Boolean(session?.is_subprocess) || Boolean(session?.parent_session_id);
  const sessionHref = buildAppWorkspaceHref({
    projectId: session?.project_id || project?.id,
    sessionId: session?.id || session?.session_id,
  });
  const parentSessionHref = isSubprocess
    ? buildAppWorkspaceHref({
        projectId: session?.project_id || project?.id,
        sessionId: session?.parent_session_id,
      })
    : sessionHref;
  function handleRowOpen(event) {
    if (isSubprocess) return; // подпроцесс: переход к родительской сессии через ссылку
    const target = event?.target;
    if (target instanceof Element && target.closest("a[href],button,select,input,textarea,label")) {
      return;
    }
    if (!shouldHandleClientNavigation(event)) return;
    onOpen?.(session);
  }
  return (
    <tr className={`group transition-colors ${isSubprocess ? "opacity-90 cursor-default" : "cursor-pointer hover:bg-accentSoft/30"}`} onClick={handleRowOpen}>
      <td className="px-2 py-2 text-sm font-medium text-fg">
        <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${leftPadding}px` }}>
          <span className="inline-flex h-6 w-6 shrink-0 rounded-md border border-transparent" aria-hidden />
          <IcoSession className={`shrink-0 ${isSubprocess ? "text-muted/60" : "text-muted"}`} />
          {isSubprocess ? (
            <a
              className="block min-w-0 flex-1 text-left text-fg/70"
              href={parentSessionHref}
              title={session.name || session.title}
            >
              <ExplorerMarqueeText text={session.name || session.title || "Сессия"} className="font-normal hover:underline" />
            </a>
          ) : (
            <AppRouteLink
              className="block min-w-0 flex-1 text-left"
              href={sessionHref}
              onNavigate={() => onOpen?.(session)}
              title={session.name || session.title}
            >
              <ExplorerMarqueeText text={session.name || session.title || "Сессия"} className="font-normal hover:underline" />
            </AppRouteLink>
          )}
        </div>
        {layout.compact ? (
          <div className="explorer-row-meta" style={{ paddingLeft: `${leftPadding + 32}px` }}>{buildExplorerRowMeta(session, "session")}</div>
        ) : null}
      </td>
      {layout.showType ? <td className="px-2 py-2 text-xs text-muted">—</td> : null}
      {layout.showComposition ? <td className="px-2 py-2" /> : null}
      {layout.showAssignee ? <td className="px-2 py-2" /> : null}
      {showSignalColumns ? <td className="px-2 py-2" /> : null}
      {showSignalColumns ? <td className="px-2 py-2" /> : null}
      <td className="px-2 py-2">
        <StatusPopoverControl
          domain="session"
          value={session.status}
          disabled={isSubprocess}
          onChange={(nextStatus) => onStatusChange?.(session, nextStatus)}
        />
      </td>
      {layout.showUpdated ? <UpdatedCell node={session} /> : null}
      <td className={`px-2 py-2 text-right ${layout.compact ? "w-8" : "w-[88px]"}`} onClick={(e) => e.stopPropagation()}>
        {!layout.compact && !isSubprocess ? (
          <AppRouteLink
            className="secondaryBtn h-7 min-h-0 px-2 text-xs whitespace-nowrap transition-colors hover:border-accent/40 hover:text-fg opacity-0 group-hover:opacity-100"
            href={sessionHref}
            onNavigate={() => onOpen?.(session)}
          >
            Открыть
          </AppRouteLink>
        ) : null}
      </td>
    </tr>
  );
}

// Строки сессий раскрытого проекта: lazy react-query (модуль монтируется только
// при expanded → запрос уходит один раз, дальше cache 5 мин). Ошибка — строка
// с retry (refetch).
function ProjectSessionsRows({
  project,
  depth = 0,
  workspaceId,
  folderId = "",
  breadcrumbBase = [],
  showSignalColumns = false,
  colSpan = 7,
  onOpenSession,
  onSessionStatusChange,
  columnLayout,
}) {
  const projectId = String(project?.id || "").trim();
  const sessionsQuery = useQuery({
    ...projectSessionsQueryOptions(workspaceId, projectId),
    enabled: Boolean(workspaceId) && Boolean(projectId),
  });
  const sessions = Array.isArray(sessionsQuery.data) ? sessionsQuery.data : [];
  const projectContext = {
    projectId,
    workspaceId,
    folderId: folderId || "",
    breadcrumbBase,
    projectTitle: project?.name || project?.title || "",
  };
  const openSession = (session) => {
    void onOpenSession?.({
      ...session,
      project_id: session?.project_id || projectId,
      workspace_id: workspaceId,
      projectContext,
    }, { openTab: "diagram", source: "workspace_explorer_tree_session" });
  };

  if (sessionsQuery.isPending) {
    return <InlineLoadingRow depth={depth} colSpan={colSpan} />;
  }
  if (sessionsQuery.isError) {
    return (
      <InlineErrorRow
        depth={depth}
        colSpan={colSpan}
        message={String(sessionsQuery.error?.message || "Не удалось загрузить сессии проекта.")}
        onRetry={() => sessionsQuery.refetch()}
      />
    );
  }
  if (sessions.length === 0) {
    return <InlineEmptyRow depth={depth} colSpan={colSpan} text="В проекте нет сессий" />;
  }
  return sessions.map((session) => (
    <SessionTreeRow
      key={`session-${session.id || session.session_id}`}
      session={session}
      project={project}
      depth={depth}
      showSignalColumns={showSignalColumns}
      onOpen={openSession}
      onStatusChange={onSessionStatusChange}
      columnLayout={columnLayout}
    />
  ));
}

function InlineLoadingRow({ depth = 0, colSpan = 8 }) {
  const leftPadding = 8 + depth * 18;
  return (
    <tr>
      <td className="px-2 py-2.5 text-sm">
        <div style={{ paddingLeft: `${leftPadding}px` }} className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-panelAlt/50 text-muted">
            <IcoSpinner className="animate-spin" />
          </span>
          <span className="h-4 w-4 shrink-0" />
          <div className="h-5 w-full max-w-[220px] animate-pulse rounded bg-border/40" />
        </div>
      </td>
      <td colSpan={colSpan} className="px-2 py-2.5" />
    </tr>
  );
}

function InlineEmptyRow({ depth = 0, colSpan = 8, text = "В папке нет вложенных папок или проектов" }) {
  const leftPadding = 8 + depth * 18;
  return (
    <tr>
      <td className="px-2 py-2.5 text-xs text-muted">
        <div style={{ paddingLeft: `${leftPadding}px` }} className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-6 w-6 shrink-0 rounded-md border border-transparent" aria-hidden />
          <span className="h-4 w-4 shrink-0" />
          <span className="truncate">{text}</span>
        </div>
      </td>
      <td colSpan={colSpan} className="px-2 py-2.5" />
    </tr>
  );
}

// ─── P6 [Г]: транзиентная строка/карточка upload-сессии (стадии + retry) ────

function PendingUploadStageLabel({ upload, onRetry }) {
  const stage = String(upload?.stage || "");
  if (stage === "error") {
    return (
      <span className="inline-flex items-center gap-2 text-danger/90" data-testid="session-upload-stage" data-stage="error">
        <span className="truncate" title={upload?.error || ""}>Ошибка{upload?.error ? `: ${upload.error}` : ""}</span>
        {upload?.sessionId ? (
          <button
            type="button"
            className="secondaryBtn h-6 min-h-0 shrink-0 px-2 text-xs"
            data-testid="session-upload-retry"
            onClick={(e) => { e.stopPropagation(); onRetry?.(upload.tempId); }}
          >
            Повторить
          </button>
        ) : null}
      </span>
    );
  }
  const label = uploadStageLabel(stage);
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-muted" data-testid="session-upload-stage" data-stage={stage}>
      <IcoSpinner className="animate-spin" />
      {label}
    </span>
  );
}

function PendingUploadRow({ upload, onRetry }) {
  return (
    <tr className="bg-accentSoft/15" data-testid="session-upload-transient-row">
      <td className="px-3 py-2 w-5" />
      <td className="px-2 py-2 text-sm font-medium text-fg">
        <div className="flex min-w-0 items-center gap-2">
          <IcoSession className="shrink-0 text-muted" />
          <span className="truncate">{upload.name}</span>
        </div>
      </td>
      <td className="px-2 py-2 text-xs text-muted">—</td>
      <td className="hidden sm:table-cell px-2 py-2 text-[11px] text-fg/65">
        <PendingUploadStageLabel upload={upload} onRetry={onRetry} />
      </td>
      <td colSpan={7} className="px-2 py-2" />
    </tr>
  );
}

function PendingUploadCard({ upload, onRetry }) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-panel2/40 px-3 py-2 text-sm"
      data-testid="session-upload-transient-row"
    >
      <IcoSession className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate font-medium text-fg">{upload.name}</span>
      <PendingUploadStageLabel upload={upload} onRetry={onRetry} />
    </div>
  );
}

function InlineErrorRow({ depth = 0, message = "", colSpan = 8, onRetry = null }) {  const leftPadding = 8 + depth * 18;
  const text = String(message || "").trim() || "Не удалось загрузить вложенные элементы.";
  return (
    <tr>
      <td className="px-2 py-2.5 text-xs text-danger/90">
        <div style={{ paddingLeft: `${leftPadding}px` }} className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-6 w-6 shrink-0 rounded-md border border-danger/30 bg-danger/5" aria-hidden />
          <span className="h-4 w-4 shrink-0" />
          <span className="truncate">{text}</span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="secondaryBtn h-6 min-h-0 px-2 text-xs shrink-0"
              title="Повторить загрузку"
            >
              Повторить
            </button>
          ) : null}
        </div>
      </td>
      <td colSpan={colSpan} className="px-2 py-2.5" />
    </tr>
  );
}

// ─── Explorer Pane (folder contents) ─────────────────────────────────────────

function ExplorerPane({
  activeOrgId,
  orgs = [],
  currentUser = null,
  workspaceId,
  folderId,
  onNavigateToFolder,
  onNavigateToProject,
  onNavigateToBreadcrumb,
  onOpenSession,
  permissions,
  portalHeader = true,
}) {
  const queryClient = useQueryClient();
  // P5 [В]: explorer page payload lives in react-query cache. On workspace
  // switch keepPreviousData keeps the previous page rendered (no skeleton,
  // header DOM node is preserved); hover-prefetch in WorkspaceSidebar makes
  // the target workspace resolve instantly from cache.
  const pageQuery = useQuery({
    ...explorerPageQueryOptions(workspaceId, folderId || ""),
    enabled: Boolean(workspaceId),
    placeholderData: keepPreviousData,
  });
  const page = pageQuery.data || null;
  const loading = !page && pageQuery.isPending;
  const [actionError, setActionError] = useState("");
  // Успешный refetch сбрасывает action-ошибку (раньше это делал setError("")
  // в начале load()). Зависимость от dataUpdatedAt — срабатывает только на
  // новые данные, без эффект-петли; query-error не затирается, т.к. имеет
  // приоритет в `error` ниже.
  useEffect(() => {
    if (pageQuery.isSuccess) setActionError("");
  }, [pageQuery.dataUpdatedAt, pageQuery.isSuccess]);
  const error = pageQuery.error
    ? String(pageQuery.error?.message || "Ошибка загрузки")
    : actionError;
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [movingFolder, setMovingFolder] = useState(null);
  const [movingProject, setMovingProject] = useState(null);
  const [moveNotice, setMoveNotice] = useState("");
  const [assigneeDialog, setAssigneeDialog] = useState(null);
  const [assigneeMembersState, setAssigneeMembersState] = useState({
    orgId: "",
    items: [],
    loading: false,
    loaded: false,
    error: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [globalSearchState, setGlobalSearchState] = useState({
    query: "",
    loading: false,
    error: "",
    model: null,
  });
  const [explorerSort, setExplorerSort] = useState(null);
  const [treeStateByContext, setTreeStateByContext] = useState({});
  const [activeTab, setActiveTab] = useState("projects");
  const inFlightFolderLoadsRef = useRef(new Set());
  const contextKey = `${String(workspaceId || "").trim()}::${String(folderId || "").trim()}`;

  // P1 [А]: свернутость дерева переживает reload — Preferences API.
  // Значение ключа explorer.tree.collapsed = Record<workspaceId, string[] ЯВНО
  // раскрытых узлов> (дефолт дерева — «всё свёрнуто»). persistedExpandedRef —
  // fallback-карта {fid: true} из GET-снапшота; явные toggle'ы в
  // treeState.expandedByFolder (включая false) имеют приоритет при merge.
  const prefsQuery = useQuery({
    queryKey: USER_PREFERENCES_QUERY_KEY,
    queryFn: fetchUserPreferences,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const [persistTick, setPersistTick] = useState(0);
  const persistedExpandedRef = useRef({});
  const treeSaverRef = useRef(null);
  if (!treeSaverRef.current) {
    treeSaverRef.current = createExplorerTreeSaver({
      onSnapshot: (doc) => {
        const collapsed = doc?.preferences?.[EXPLORER_TREE_COLLAPSED_KEY] || {};
        persistedExpandedRef.current = Object.fromEntries(
          Object.entries(collapsed).map(([ws, ids]) => [
            ws,
            Object.fromEntries((Array.isArray(ids) ? ids : []).map((id) => [String(id), true])),
          ]),
        );
        setPersistTick((t) => t + 1);
      },
    });
  }
  useEffect(() => {
    if (prefsQuery.data) treeSaverRef.current.attach(prefsQuery.data);
  }, [prefsQuery.data]);

  const mergedExpandedByFolder = useMemo(
    () => ({
      ...(persistedExpandedRef.current[String(workspaceId || "").trim()] || {}),
      ...treeStateByContext[contextKey]?.expandedByFolder,
    }),
    // persistTick — пересчёт после применения серверного снапшота (ref не триггерит render)
    [workspaceId, contextKey, treeStateByContext, persistTick],
  );

  const treeState = treeStateByContext[contextKey] || {
    expandedByFolder: {},
    childItemsByFolder: {},
    loadingByFolder: {},
    loadErrorByFolder: {},
  };

  const setTreeStateForContext = useCallback((updater) => {
    setTreeStateByContext((prev) => {
      const current = prev[contextKey] || {
        expandedByFolder: {},
        childItemsByFolder: {},
        loadingByFolder: {},
        loadErrorByFolder: {},
      };
      const next = typeof updater === "function" ? updater(current) : updater;
      if (!next || next === current) return prev;
      return { ...prev, [contextKey]: next };
    });
  }, [contextKey]);

  const load = useCallback(async ({ resetInlineChildren = false } = {}) => {
    if (!workspaceId) return;
    if (resetInlineChildren) {
      setTreeStateForContext((prev) => ({
        ...prev,
        childItemsByFolder: {},
        loadingByFolder: {},
        loadErrorByFolder: {},
      }));
    }
    await queryClient.invalidateQueries({
      queryKey: explorerPageQueryKey(workspaceId, folderId || ""),
      refetchType: "active",
    });
  }, [workspaceId, folderId, queryClient, setTreeStateForContext]);

  const rootItems = useMemo(() => (Array.isArray(page?.items) ? page.items : []), [page]);
  const isEmpty = !loading && !error && rootItems.length === 0;
  const treeColumnProfile = EXPLORER_COLUMN_PROFILES.tree;

  // P4 [А]: адаптив по ширине КОНТЕЙНЕРА таблицы (сайдбар схлопывается —
  // media queries по viewport не подходят). ResizeObserver + чистая функция
  // getExplorerColumnLayout (пороги/приоритеты — explorerColumnVisibility.js).
  // Callback ref: таблица монтируется условно (после загрузки данных), поэтому
  // effect с [] не подходит — RO подключаем в момент появления контейнера.
  const explorerTableContainerRef = useRef(null);
  const explorerTableRORef = useRef(null);
  const [explorerTableWidth, setExplorerTableWidth] = useState(0);
  const explorerTableContainerCallbackRef = useCallback((el) => {
    if (explorerTableRORef.current) {
      explorerTableRORef.current.disconnect();
      explorerTableRORef.current = null;
    }
    explorerTableContainerRef.current = el;
    if (!el) return;
    setExplorerTableWidth(Math.round(el.clientWidth || 0));
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect?.width || 0);
      setExplorerTableWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    explorerTableRORef.current = ro;
  }, []);
  useEffect(() => () => {
    if (explorerTableRORef.current) {
      explorerTableRORef.current.disconnect();
      explorerTableRORef.current = null;
    }
  }, []);
  const explorerColumnLayout = useMemo(
    () => getExplorerColumnLayout(explorerTableWidth, { signalColumns: treeColumnProfile.showSignalColumns }),
    [explorerTableWidth, treeColumnProfile.showSignalColumns],
  );
  // Часть А-2 (nav-zone): однострочная навигационная полоса — адаптив по
  // ширине контейнера (useElementWidth + getNavSingleLineLayout).
  const [explorerNavRef, explorerNavWidth] = useElementWidth();
  const explorerNavLayout = getNavSingleLineLayout(explorerNavWidth);
  const folderCopy = useMemo(() => folderCreateCopy(folderId || ""), [folderId]);
  const contextHeaderTitle = folderId
    ? "Для папок: количество проектов"
    : "Для разделов: количество проектов";

  // ── P6 [Г]: dnd-upload .bpmn/.xml на строке ПРОЕКТА в дереве explorer ────
  // Строки раздела/папки — НЕ drop-зона (обработчики только на ProjectRow).
  // Зона не пересекается с bpmnFileDrop на канвасе (#721): тот живёт в
  // SessionView; здесь stopPropagation на всякий случай вложенности.
  const [projectUploads, setProjectUploads] = useState({});
  const updateProjectUpload = useCallback((projectId, patch) => {
    const pid = String(projectId || "").trim();
    if (!pid) return;
    setProjectUploads((prev) => ({ ...prev, [pid]: { ...(prev[pid] || {}), ...patch } }));
  }, []);
  const clearProjectUpload = useCallback((projectId) => {
    const pid = String(projectId || "").trim();
    setProjectUploads((prev) => {
      if (!prev[pid]) return prev;
      const next = { ...prev };
      delete next[pid];
      return next;
    });
  }, []);
  const handleProjectFileDrop = useCallback(async (project, file) => {
    const pid = String(project?.id || "").trim();
    if (!pid || !file || !permissions?.canCreate) return;
    const name = stripBpmnExtension(file.name) || "Сессия";
    const verdict = validateBpmnUploadFile(file);
    if (!verdict.ok) {
      updateProjectUpload(pid, { stage: "error", error: verdict.error, sessionId: "", file, name });
      return;
    }
    updateProjectUpload(pid, { stage: "creating", error: "", sessionId: "", file, name });
    const res = await createSessionWithBpmnUpload({
      workspaceId,
      projectId: pid,
      name,
      file,
      onStage: (stage) => updateProjectUpload(pid, { stage }),
    });
    updateProjectUpload(pid, { stage: res.stage, sessionId: res.sessionId, error: res.error });
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: projectSessionsQueryKey(pid) });
      load({ resetInlineChildren: true });
      setTimeout(() => clearProjectUpload(pid), 1200);
    }
  }, [workspaceId, permissions?.canCreate, queryClient, load, updateProjectUpload, clearProjectUpload]);
  const handleProjectUploadRetry = useCallback(async (projectId) => {
    const pid = String(projectId || "").trim();
    const item = projectUploads[pid];
    if (!item?.sessionId || !item?.file) return;
    updateProjectUpload(pid, { stage: "uploading", error: "" });
    const res = await uploadSessionBpmnOnly({
      sessionId: item.sessionId,
      file: item.file,
      onStage: (stage) => updateProjectUpload(pid, { stage }),
    });
    updateProjectUpload(pid, { stage: res.stage, error: res.error });
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: projectSessionsQueryKey(pid) });
      load({ resetInlineChildren: true });
      setTimeout(() => clearProjectUpload(pid), 1200);
    }
  }, [projectUploads, queryClient, load, updateProjectUpload, clearProjectUpload]);

  const sortedRootItems = useMemo(
    () => sortExplorerItems(rootItems, explorerSort, { isRoot: !folderId }),
    [rootItems, explorerSort, folderId],
  );
  const sortedChildItemsByFolder = useMemo(
    () => sortExplorerChildItemsByFolder(treeState.childItemsByFolder, explorerSort),
    [treeState.childItemsByFolder, explorerSort],
  );
  const handleExplorerSort = useCallback((key) => {
    setExplorerSort((prev) => toggleExplorerSort(prev, key));
  }, []);

  const visibleRows = useMemo(
    () => buildVisibleRows({
      rootItems: sortedRootItems,
      expandedByFolder: mergedExpandedByFolder,
      childItemsByFolder: sortedChildItemsByFolder,
      loadingByFolder: treeState.loadingByFolder,
      loadErrorByFolder: treeState.loadErrorByFolder,
      preserveItemOrder: Boolean(explorerSort),
    }),
    [sortedRootItems, mergedExpandedByFolder, sortedChildItemsByFolder, treeState.loadingByFolder, treeState.loadErrorByFolder, explorerSort]
  );
  const inlineColSpan = explorerVisibleColumnCount(explorerColumnLayout, { signalColumns: treeColumnProfile.showSignalColumns });
  const searchIndex = useMemo(
    () => buildExplorerSearchIndex({
      rootItems,
      childItemsByFolder: treeState.childItemsByFolder,
      rootParentId: folderId || "",
      breadcrumbs: page?.breadcrumbs || [],
    }),
    [rootItems, treeState.childItemsByFolder, folderId, page?.breadcrumbs],
  );
  const searchModel = useMemo(
    () => filterExplorerSearchResults(searchIndex, searchQuery),
    [searchIndex, searchQuery],
  );
  const responsibleAssigneeUsers = useMemo(
    () => mergeExplorerAssignableCurrentUser(
      assigneeMembersState.items,
      currentUser,
      { orgId: activeOrgId, orgs },
    ),
    [assigneeMembersState.items, currentUser, activeOrgId, orgs],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const query = String(debouncedSearchQuery || "").trim();
    if (!workspaceId || query.length < 2) {
      setGlobalSearchState({ query, loading: false, error: "", model: null });
      return undefined;
    }
    let disposed = false;
    setGlobalSearchState((prev) => ({
      query,
      loading: true,
      error: "",
      model: prev.query === query ? prev.model : null,
    }));
    apiSearchExplorer(workspaceId, query, { limit: 50 })
      .then((resp) => {
        if (disposed) return;
        if (!resp?.ok) throw new Error(resp?.error || "Не удалось выполнить поиск.");
        setGlobalSearchState({
          query,
          loading: false,
          error: "",
          model: buildExplorerGlobalSearchModel(resp?.data || resp, query),
        });
      })
      .catch(() => {
        if (disposed) return;
        setGlobalSearchState({ query, loading: false, error: "Не удалось выполнить поиск.", model: null });
      });
    return () => {
      disposed = true;
    };
  }, [debouncedSearchQuery, workspaceId]);
  const visibleSearchModel = useMemo(() => {
    const query = String(searchQuery || "").trim();
    if (query.length < 2) return searchModel;
    if (globalSearchState.loading) {
      return { active: true, query, total: 0, groups: [], results: [], source: "global", loading: true };
    }
    if (globalSearchState.error) {
      return { active: true, query, total: 0, groups: [], results: [], source: "global", error: globalSearchState.error };
    }
    return globalSearchState.model || { active: true, query, total: 0, groups: [], results: [], source: "global" };
  }, [searchQuery, searchModel, globalSearchState]);

  useEffect(() => {
    if (!assigneeDialog) return;
    const oid = String(activeOrgId || "").trim();
    if (!oid) {
      setAssigneeMembersState({ orgId: "", items: [], loading: false, loaded: true, error: "Не выбрана организация" });
      return;
    }
    let disposed = false;
    setAssigneeMembersState({ orgId: oid, items: [], loading: true, loaded: false, error: "" });
    Promise.race([
      apiListOrgAssignableUsers(oid),
      assigneeMembersLoadTimeout(),
    ]).then((resp) => {
      if (disposed) return;
      const normalized = normalizeExplorerAssignableUsersResponse(resp);
      setAssigneeMembersState({
        orgId: oid,
        items: normalized.items,
        loading: false,
        loaded: true,
        error: normalized.error,
      });
    }).catch((e) => {
      if (disposed) return;
      setAssigneeMembersState({
        orgId: oid,
        items: [],
        loading: false,
        loaded: true,
        error: "Не удалось загрузить пользователей.",
      });
    });
    return () => { disposed = true; };
  }, [activeOrgId, assigneeDialog]);

  const parentIdForRowFolder = useCallback((folder, depth = 0) => {
    const explicitParentId = String(folder?.parent_id ?? folder?.parentId ?? "").trim();
    if (explicitParentId) return explicitParentId;
    return Number(depth || 0) === 0 ? String(folderId || "").trim() : "";
  }, [folderId]);

  const currentFolderMoveTarget = useMemo(() => {
    const fid = String(folderId || "").trim();
    if (!fid) return null;
    const breadcrumbs = Array.isArray(page?.breadcrumbs) ? page.breadcrumbs : [];
    const currentIndex = breadcrumbs.findIndex((crumb) => String(crumb?.type || "") === "folder" && String(crumb?.id || "") === fid);
    const currentCrumb = currentIndex >= 0 ? breadcrumbs[currentIndex] : page?.context?.folder;
    if (!currentCrumb) return null;
    const previousFolder = currentIndex > 0 ? breadcrumbs[currentIndex - 1] : null;
    const parentId = String(previousFolder?.type || "") === "folder" ? String(previousFolder?.id || "") : "";
    return {
      id: fid,
      type: "folder",
      name: String(currentCrumb?.name || ""),
      parent_id: parentId,
    };
  }, [folderId, page]);

  const handleSaveAssignee = useCallback(async (dialog, userId) => {
    const item = dialog?.item || {};
    const kind = dialog?.kind || getExplorerAssigneeKind(item);
    const normalizedUserId = String(userId || "").trim() || null;
    if (kind === "responsible") {
      const resp = await apiUpdateFolder(workspaceId, item.id, { responsible_user_id: normalizedUserId });
      if (!resp?.ok) throw new Error(resp?.error || "Не удалось сохранить ответственного");
      await load({ resetInlineChildren: true });
      setMoveNotice(normalizedUserId ? "Ответственный назначен." : "Назначение очищено.");
      return;
    }
    if (kind === "executor") {
      const resp = await apiPatchProject(item.id, { executor_user_id: normalizedUserId });
      if (!resp?.ok) throw new Error(resp?.error || "Не удалось сохранить исполнителя");
      await load({ resetInlineChildren: true });
      setMoveNotice(normalizedUserId ? "Исполнитель назначен." : "Назначение очищено.");
      return;
    }
    throw new Error("Назначение недоступно для этого элемента");
  }, [load, workspaceId]);

  const handleFolderContextStatusChange = useCallback(async (folder, nextStatus) => {
    const normalizedStatus = normalizeExplorerContextStatus(nextStatus);
    const folderIdToUpdate = String(folder?.id || "").trim();
    if (!workspaceId || !folderIdToUpdate) return false;
    setActionError("");
    setMoveNotice("");
    try {
      const resp = await apiUpdateFolder(workspaceId, folderIdToUpdate, { context_status: normalizedStatus });
      if (!resp?.ok) {
        throw new Error(resp?.status === 0
          ? "Не удалось обновить статус. Проверьте соединение и повторите."
          : resp?.error || "Не удалось обновить статус");
      }
      await load({ resetInlineChildren: true });
      setMoveNotice("Статус обновлён.");
      return true;
    } catch (e) {
      setActionError(String(e?.message || e || "Не удалось обновить статус"));
      return false;
    }
  }, [load, workspaceId]);

  const handleTreeSessionStatusChange = useCallback(async (session, nextStatus) => {
    const sessionId = String(session?.id || session?.session_id || "").trim();
    const normalizedStatus = String(nextStatus || "").trim();
    if (!sessionId || !normalizedStatus) return false;
    setActionError("");
    setMoveNotice("");
    try {
      const sessionSnapshot = await apiGetSession(sessionId);
      const baseVersion = Number(sessionSnapshot?.session?.diagram_state_version);
      if (!sessionSnapshot?.ok || !Number.isFinite(baseVersion) || baseVersion < 0) {
        throw new Error(sessionSnapshot?.status === 0
          ? "Не удалось получить актуальную версию сессии. Проверьте соединение и повторите."
          : formatSessionPatchError(sessionSnapshot, "Не удалось получить актуальную версию сессии"));
      }
      const resp = await apiPatchSession(sessionId, {
        status: normalizedStatus,
        base_diagram_state_version: baseVersion,
      });
      if (!resp?.ok) {
        throw new Error(resp?.status === 0
          ? "Не удалось обновить статус. Проверьте соединение и повторите."
          : resp?.status === 409
            ? "Переход в выбранный статус недоступен для текущего состояния сессии."
            : formatSessionPatchError(resp));
      }
      await queryClient.invalidateQueries({
        queryKey: projectSessionsQueryKey(session?.project_id),
        refetchType: "active",
      });
      setMoveNotice("Статус обновлён.");
      return true;
    } catch (e) {
      setActionError(String(e?.message || e || "Не удалось обновить статус"));
      return false;
    }
  }, [queryClient]);

  const ensureFolderChildrenLoaded = useCallback(async (targetFolderId) => {
    const fid = String(targetFolderId || "").trim();
    if (!workspaceId || !fid) return;
    const alreadyLoaded = Array.isArray(treeState.childItemsByFolder?.[fid]);
    const alreadyLoading = Boolean(treeState.loadingByFolder?.[fid]) || inFlightFolderLoadsRef.current.has(fid);
    if (alreadyLoaded || alreadyLoading) return;

    inFlightFolderLoadsRef.current.add(fid);
    setTreeStateForContext((prev) => {
      return {
        ...prev,
        loadingByFolder: { ...prev.loadingByFolder, [fid]: true },
        loadErrorByFolder: { ...prev.loadErrorByFolder, [fid]: "" },
      };
    });
    try {
      const resp = await apiGetExplorerPage(workspaceId, fid);
      if (!resp?.ok) throw new Error(resp?.error || "Ошибка загрузки вложенной папки");
      const nestedPage = resp?.data || resp;
      const items = Array.isArray(nestedPage?.items) ? nestedPage.items : [];
      setTreeStateForContext((prev) => ({
        ...prev,
        childItemsByFolder: { ...prev.childItemsByFolder, [fid]: items },
        loadErrorByFolder: { ...prev.loadErrorByFolder, [fid]: "" },
      }));
    } catch (e) {
      const message = String(e?.message || "Ошибка загрузки вложенной папки");
      setActionError(message);
      setTreeStateForContext((prev) => ({
        ...prev,
        loadErrorByFolder: { ...prev.loadErrorByFolder, [fid]: message },
      }));
    } finally {
      inFlightFolderLoadsRef.current.delete(fid);
      setTreeStateForContext((prev) => ({
        ...prev,
        loadingByFolder: { ...prev.loadingByFolder, [fid]: false },
      }));
    }
  }, [workspaceId, treeState.childItemsByFolder, treeState.loadingByFolder, setTreeStateForContext]);

  const handleToggleExpand = useCallback((folder) => {
    const fid = String(folder?.id || "").trim();
    if (!fid || !hasFolderChildren(folder)) return;
    // merge с persisted-fallback: persisted-раскрытый узел без явного toggle
    // считается раскрытым; первый toggle его сворачивает (nextExpanded=false).
    const nextExpanded = !Boolean(mergedExpandedByFolder?.[fid]);
    setTreeStateForContext((prev) => ({
      ...prev,
      expandedByFolder: { ...prev.expandedByFolder, [fid]: nextExpanded },
    }));
    treeSaverRef.current?.schedule(
      workspaceId,
      expandedIdsFromMap({ ...mergedExpandedByFolder, [fid]: nextExpanded }),
    );
    if (nextExpanded) {
      void ensureFolderChildrenLoaded(fid);
    }
  }, [mergedExpandedByFolder, workspaceId, setTreeStateForContext, ensureFolderChildrenLoaded]);

  // P2 [Б]: раскрытие проекта — тот же expanded-map и saver (id проекта
  // добавляется в тот же preferences-список expanded-ids). Дочерние сессии
  // грузит ProjectSessionsRows через react-query (lazy), здесь только toggle.
  const handleToggleProjectExpand = useCallback((project) => {
    const pid = String(project?.id || "").trim();
    if (!pid || !projectHasSessions(project)) return;
    const nextExpanded = !Boolean(mergedExpandedByFolder?.[pid]);
    setTreeStateForContext((prev) => ({
      ...prev,
      expandedByFolder: { ...prev.expandedByFolder, [pid]: nextExpanded },
    }));
    treeSaverRef.current?.schedule(
      workspaceId,
      expandedIdsFromMap({ ...mergedExpandedByFolder, [pid]: nextExpanded }),
    );
  }, [mergedExpandedByFolder, workspaceId, setTreeStateForContext]);

  const handleOpenSearchResult = useCallback((result) => {
    const target = result?.target || {};
    if (target.kind === "folder" && target.folderId) {
      setSearchQuery("");
      onNavigateToFolder(target.folderId);
      return;
    }
    if (target.kind === "project" && target.projectId) {
      setSearchQuery("");
      onNavigateToProject(target.projectId, { breadcrumbBase: target.breadcrumbBase || page?.breadcrumbs || [] });
      return;
    }
    if (target.kind === "session" && target.session) {
      setSearchQuery("");
      const targetBreadcrumbBase = normalizeProjectBreadcrumbBase(target.breadcrumbBase || page?.breadcrumbs || []);
      const parentFolderCrumb = [...targetBreadcrumbBase].reverse().find((crumb) => crumb.type === "folder") || null;
      void onOpenSession?.({
        ...target.session,
        project_id: target.projectId || target.session.project_id,
        workspace_id: workspaceId,
        projectContext: {
          projectId: target.projectId || target.session.project_id,
          workspaceId,
          folderId: parentFolderCrumb?.id || "",
          breadcrumbBase: targetBreadcrumbBase,
          projectTitle: target.session.project_name || target.session.project_title || "",
        },
      }, { openTab: "diagram", source: "workspace_explorer_search_session" });
    }
  }, [onNavigateToFolder, onNavigateToProject, onOpenSession, page?.breadcrumbs, workspaceId]);

  const headerCrumbs = Array.isArray(page?.breadcrumbs) ? page.breadcrumbs : [];
  const headerCrumbItems = headerCrumbs.map((crumb, index) => ({
    key: `${crumb.type}-${crumb.id || "root"}`,
    label: crumb.name,
    // Текущий сегмент заменяет H1 — testid заголовка живёт на нём.
    testId: index === headerCrumbs.length - 1 ? "explorer-section-title" : undefined,
    onClick:
      index < headerCrumbs.length - 1
        ? () => {
            if (crumb.type === "workspace") onNavigateToBreadcrumb(workspaceId, "");
            else onNavigateToBreadcrumb(workspaceId, crumb.id);
          }
        : undefined,
  }));
  const parentHeaderCrumb = headerCrumbs.length > 1 ? headerCrumbs[headerCrumbs.length - 2] : null;
  // Часть А: хедер раздела порталится в общий слот workspaceMain (пиксель-в-пиксель).
  // Когда открыт проект, ExplorerPane остаётся смонтированным (скрытым) — портал глушим.
  const navSlotEl = useWorkspaceMainNavSlot();
  const headerSlotEl = portalHeader ? navSlotEl : null;
  const explorerHeaderLayout = getWorkspaceHeaderLayout(explorerNavWidth);
  const createFolderLabel = explorerHeaderLayout.shortCreateLabels
    ? folderCopy.createLabel.replace(/^Создать\s+/, "")
    : folderCopy.createLabel;
  // Блок «назад» для левой колонки (uiux/sidebar-header-join-v1).
  // Кнопка показывается всегда: на корне disabled, на вложенных уровнях активна.
  const isExplorerRoot = !folderId;
  const explorerBackLabel = isExplorerRoot
    ? "Назад"
    : parentHeaderCrumb && parentHeaderCrumb.type !== "workspace"
      ? "Назад к разделу"
      : "Назад к разделам";
  const explorerBackTitle = isExplorerRoot
    ? "Вы на верхнем уровне"
    : explorerBackLabel;
  const explorerSidebarHeader = (
    <button
      type="button"
      disabled={isExplorerRoot}
      onClick={() =>
        parentHeaderCrumb && parentHeaderCrumb.type !== "workspace"
          ? onNavigateToBreadcrumb(workspaceId, parentHeaderCrumb.id)
          : onNavigateToBreadcrumb(workspaceId, "")
      }
      className={`w-full h-full flex items-center gap-2 px-3 text-sm text-left transition-colors rounded-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60
        ${isExplorerRoot
          ? "text-muted/60 cursor-default"
          : "text-fg hover:bg-bg"
        }`}
      title={explorerBackTitle}
      aria-label={explorerBackLabel}
      data-testid="explorer-back-sections"
    >
      <IcoArrowLeft className="shrink-0" />
      <span className="truncate">{explorerBackLabel}</span>
    </button>
  );
  // Хук должен вызываться на каждом рендере ДО любого раннего return.
  useSetExplorerSidebarHeader(explorerSidebarHeader);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="space-y-2 w-full max-w-lg px-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-border/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const explorerHeader = (
      <div className="px-4 pr-5 border-b border-border flex-shrink-0 bg-panel" data-testid="explorer-header">
        {/* Часть А-2 (nav-zone): одна строка ~40px — путь (текущий сегмент = заголовок),
            табы, поиск, создание. Кнопка «назад» живёт в левой колонке.
            Счётчики workspace перенесены в сайдбар (uiux/ws-counters-to-sidebar-v1).
            Без переносов; жертвы по ширине контейнера: поиск сжимается → крошки «…». */}
        <div
          ref={explorerNavRef}
          className="flex h-10 min-w-0 flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap"
          data-nav-width={Math.round(explorerNavWidth)}
        >
          <TextBreadcrumbs
            crumbs={headerCrumbItems}
            dataTestId="explorer-breadcrumbs"
            singleLine
            forceCollapse={explorerNavWidth < 900}
            currentClassName="text-[15px] font-semibold min-w-[12ch]"
          />
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            <div className="hidden sm:flex h-7 items-center rounded-lg border border-border bg-panel p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab("projects")}
                className={`rounded-md px-2.5 py-0.5 text-xs font-medium transition ${
                  activeTab === "projects" ? "bg-accent text-white" : "text-muted hover:text-fg hover:bg-panel2"
                }`}
              >
                Проекты
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("analytics")}
                className={`rounded-md px-2.5 py-0.5 text-xs font-medium transition ${
                  activeTab === "analytics" ? "bg-accent text-white" : "text-muted hover:text-fg hover:bg-panel2"
                }`}
              >
                Аналитика
              </button>
            </div>
            <ExplorerSearchBox
              id="workspace-explorer-tree-search"
              value={searchQuery}
              onChange={setSearchQuery}
              className={explorerHeaderLayout.searchIconOnly ? "w-[140px]" : "w-[260px]"}
            />
            {permissions?.canCreate ? (
              <button
                onClick={() => setCreatingFolder(true)}
                className="secondaryBtn h-7 px-2.5 text-xs flex items-center gap-1"
              >
                <IcoPlus className="opacity-70" /> {createFolderLabel}
              </button>
            ) : null}
            {/* Project can only be created inside a folder, not at workspace root */}
            {folderId && permissions?.canCreate ? (
              <button
                onClick={() => setCreatingProject(true)}
                className="primaryBtn h-7 px-2.5 text-xs flex items-center gap-1"
              >
                <IcoPlus /> Проект
              </button>
            ) : permissions?.canCreate ? (
              <span
                className="secondaryBtn h-7 px-2.5 text-xs opacity-40 cursor-not-allowed"
                title="Войдите в папку, чтобы создать проект"
              >
                <IcoPlus className="opacity-50" /> Проект
              </span>
            ) : null}
          </div>
        </div>
      </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {headerSlotEl ? createPortal(explorerHeader, headerSlotEl) : explorerHeader}

      {error && (
        <div className="px-4 py-3 text-sm text-danger bg-danger/5 border-b border-border">{error}</div>
      )}
      {moveNotice ? (
        <div className="px-4 py-2 text-sm text-accent bg-accentSoft/40 border-b border-border">{moveNotice}</div>
      ) : null}

      {activeTab === "analytics" ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <AnalyticsPage scope="workspace" scopeId={workspaceId} module="overview" orgId={activeOrgId} embedded />
        </div>
      ) : visibleSearchModel.active ? (
        <ExplorerSearchResults model={visibleSearchModel} onOpenResult={handleOpenSearchResult} />
      ) : !isEmpty ? (
        // Сетка ширин таблицы «Проекты» (ТЗ п.8): «Название» — единственная
        // колонка с гарантированным min-width (≥260px) и flex-растяжением;
        // остальные колонки фиксированы: Тип 88 + Состав 210 + Ответственный 176
        // + Статус 88 + Обновлено 190 + Действия 32 = 784 (+72 с сигнальными).
        // P4 [А]: временный горизонтальный скролл <1044px ЗАМЕНЁН адаптивом по
        // ширине контейнера (ResizeObserver + getExplorerColumnLayout): колонки
        // скрываются по приоритету Обновлено → Ответственный → Состав; <680px —
        // двухстрочные строки без шапки. Горизонтального скролла нет нигде.
        <div
          className="flex-1 overflow-auto"
          ref={explorerTableContainerCallbackRef}
          data-testid="explorer-table-container"
          data-layout-width={explorerTableWidth}
          data-layout-compact={explorerColumnLayout.compact ? "1" : "0"}
        >
          <table
            className="w-full table-fixed text-left border-collapse"
          >
            <colgroup>
              <col style={explorerColumnLayout.compact ? undefined : { minWidth: explorerColumnLayout.nameMinWidth }} />
              {explorerColumnLayout.showType ? <col className="w-[88px]" /> : null}
              {explorerColumnLayout.showComposition ? <col className="w-[210px]" /> : null}
              {explorerColumnLayout.showAssignee ? <col className="w-[176px]" /> : null}
              {treeColumnProfile.showSignalColumns ? <col className="w-[36px]" /> : null}
              {treeColumnProfile.showSignalColumns ? <col className="w-[36px]" /> : null}
              <col className="w-[88px]" />
              {explorerColumnLayout.showUpdated ? <col className="w-[190px]" /> : null}
              <col className={explorerColumnLayout.compact ? "w-8" : "w-[88px]"} />
            </colgroup>
            {explorerColumnLayout.compact ? null : (
            <thead>
              <tr className="border-b border-border/80 bg-panelAlt/25 text-[11px] uppercase tracking-wide text-fg/65">
                <th className="px-2 py-2" aria-sort={explorerSort?.key === "name" ? (explorerSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Название" sortKey="name" sort={explorerSort} onSort={handleExplorerSort} />
                </th>
                {explorerColumnLayout.showType ? (
                <th className="px-2 py-2" aria-sort={explorerSort?.key === "type" ? (explorerSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Тип" sortKey="type" sort={explorerSort} onSort={handleExplorerSort} />
                </th>
                ) : null}
                {explorerColumnLayout.showComposition ? (
                <th className="px-2 py-2" title={contextHeaderTitle}>
                  Состав
                </th>
                ) : null}
                {explorerColumnLayout.showAssignee ? (
                <th className="px-2 py-2" aria-sort={explorerSort?.key === "assignee" ? (explorerSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Ответственный / Исполнитель" sortKey="assignee" sort={explorerSort} onSort={handleExplorerSort} title="Сортирует разделы и папки по ответственному, проекты — по исполнителю." />
                </th>
                ) : null}
                {treeColumnProfile.showSignalColumns ? <th className="px-2 py-2 text-center">⚠</th> : null}
                {treeColumnProfile.showSignalColumns ? <th className="px-2 py-2 text-center">📋</th> : null}
                <th className="px-2 py-2" aria-sort={explorerSort?.key === "status" ? (explorerSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Статус" sortKey="status" sort={explorerSort} onSort={handleExplorerSort} />
                </th>
                {explorerColumnLayout.showUpdated ? (
                <th className="px-2 py-2" aria-sort={explorerSort?.key === "updatedAt" ? (explorerSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Обновлено" sortKey="updatedAt" sort={explorerSort} onSort={handleExplorerSort} />
                </th>
                ) : null}
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            )}
            <tbody className="divide-y divide-border/65">
              {visibleRows.map((row, index) => {
                if (row.rowType === "loading") {
                  return <InlineLoadingRow key={`loading-${row.parentId}-${index}`} depth={row.depth} colSpan={inlineColSpan} />;
                }
                if (row.rowType === "empty") {
                  return <InlineEmptyRow key={`empty-${row.parentId}-${index}`} depth={row.depth} colSpan={inlineColSpan} />;
                }
                if (row.rowType === "error") {
                  return <InlineErrorRow key={`error-${row.parentId}-${index}`} depth={row.depth} message={row.message} colSpan={inlineColSpan} />;
                }
                if (row.rowType === "folder") {
                  const folder = row.node;
                  return (
                    <FolderRow
                      key={`folder-${folder.id}`}
                      folder={folder}
                      depth={row.depth}
                      expanded={row.expanded}
                      loading={row.loading}
                      workspaceId={workspaceId}
                      onToggleExpand={handleToggleExpand}
                      onNavigate={() => onNavigateToFolder(folder.id)}
                      onMove={() => {
                        setMoveNotice("");
                        setMovingFolder({
                          folder,
                          depth: row.depth,
                          currentParentId: parentIdForRowFolder(folder, row.depth),
                        });
                      }}
                      onAssign={(targetFolder, targetLabel) => {
                        setMoveNotice("");
                        setAssigneeDialog({
                          item: targetFolder,
                          kind: "responsible",
                          folderLabel: targetLabel,
                        });
                      }}
                      onContextStatusChange={handleFolderContextStatusChange}
                      onReload={() => load({ resetInlineChildren: true })}
                      canEdit={!!permissions?.canRenameFolder}
                      canDelete={!!permissions?.canDeleteFolder}
                      currentFolderId={folderId || ""}
                      showSignalColumns={treeColumnProfile.showSignalColumns}
                      columnLayout={explorerColumnLayout}
                    />
                  );
                }
                const project = row.node;
                if (row.rowType === "project-sessions") {
                  return (
                    <ProjectSessionsRows
                      key={`project-sessions-${row.parentId}`}
                      project={project}
                      depth={row.depth}
                      workspaceId={workspaceId}
                      folderId={folderId || ""}
                      breadcrumbBase={page?.breadcrumbs || []}
                      showSignalColumns={treeColumnProfile.showSignalColumns}
                      colSpan={inlineColSpan}
                      onOpenSession={onOpenSession}
                      onSessionStatusChange={handleTreeSessionStatusChange}
                      columnLayout={explorerColumnLayout}
                    />
                  );
                }
                return (
                  <ProjectRow
                    key={`project-${project.id}`}
                    project={project}
                    depth={row.depth}
                    expanded={row.expanded}
                    expandable={row.expandable}
                    onToggleExpand={handleToggleProjectExpand}
                    onClick={() => onNavigateToProject(project.id, { breadcrumbBase: page?.breadcrumbs || [] })}
                    onMove={() => {
                      setMoveNotice("");
                      setMovingProject(project);
                    }}
                    onAssign={(targetProject) => {
                      setMoveNotice("");
                      setAssigneeDialog({
                        item: targetProject,
                        kind: "executor",
                        folderLabel: "",
                      });
                    }}
                    onReload={() => load({ resetInlineChildren: true })}
                    canMove={!!permissions?.canRenameProject}
                    canAssign={!!permissions?.canRenameProject}
                    canRename={!!permissions?.canRenameProject}
                    canDelete={!!permissions?.canDeleteProject}
                    showSignalColumns={treeColumnProfile.showSignalColumns}
                    columnLayout={explorerColumnLayout}
                    uploadState={projectUploads[String(project.id || "")]}
                    onFileDrop={handleProjectFileDrop}
                    onUploadRetry={handleProjectUploadRetry}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <IcoFolder className="w-12 h-12 text-muted/30" />
          <div className="text-center">
            <p className="text-base font-medium text-fg mb-1">
              {folderCopy.emptyTitle}
            </p>
            <p className="text-sm text-muted">
              {folderCopy.emptyHint}
            </p>
          </div>
          <div className="flex gap-2">
            {permissions?.canCreate ? (
              <button
                onClick={() => setCreatingFolder(true)}
                className="secondaryBtn h-8 px-4 text-sm flex items-center gap-1"
              >
                <IcoPlus className="opacity-70" /> {folderCopy.createLabel}
              </button>
            ) : null}
            {folderId && permissions?.canCreate ? (
              <button
                onClick={() => setCreatingProject(true)}
                className="primaryBtn h-8 px-4 text-sm flex items-center gap-1"
              >
                <IcoPlus /> Создать проект
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Modals */}
      {creatingFolder && permissions?.canCreate ? (
        <InputModal
          title={folderCopy.modalTitle}
          placeholder={folderCopy.placeholder}
          onClose={() => setCreatingFolder(false)}
          onSubmit={async (name) => {
            const resp = await apiCreateFolder(workspaceId, { name, parent_id: folderId || "" });
            if (!resp?.ok) throw new Error(resp?.error || "Не удалось создать папку");
            load({ resetInlineChildren: true });
          }}
        />
      ) : null}
      {creatingProject && permissions?.canCreate ? (
        <InputModal
          title="Новый проект"
          placeholder="Название проекта"
          onClose={() => setCreatingProject(false)}
          onSubmit={async (name) => {
            if (!folderId) {
              throw new Error("Выберите папку перед созданием проекта");
            }
            const resp = await apiCreateProject(workspaceId, folderId, { name });
            if (!resp?.ok) throw new Error(resp?.error || "Не удалось создать проект");
            load({ resetInlineChildren: true });
          }}
        />
      ) : null}
      {movingFolder && permissions?.canRenameFolder ? (
        <MoveFolderDialog
          workspaceId={workspaceId}
          folder={movingFolder.folder}
          depth={movingFolder.depth}
          currentFolderId={folderId || ""}
          currentParentId={movingFolder.currentParentId}
          rootItems={rootItems}
          rootParentId={folderId || ""}
          childItemsByFolder={treeState.childItemsByFolder}
          onClose={() => setMovingFolder(null)}
          onMoved={async () => {
            const label = folderDisplayLabel({
              folder: movingFolder.folder,
              depth: movingFolder.depth,
              currentFolderId: folderId || "",
            });
            await load({ resetInlineChildren: true });
            setMoveNotice(label === "Раздел" ? "Раздел перемещён." : "Папка перемещена.");
          }}
        />
      ) : null}
      {movingProject && permissions?.canRenameProject ? (
        <MoveProjectDialog
          workspaceId={workspaceId}
          project={movingProject}
          currentFolderId={movingProject.folder_id || folderId || ""}
          currentFolder={currentFolderMoveTarget}
          rootItems={rootItems}
          rootParentId={folderId || ""}
          childItemsByFolder={treeState.childItemsByFolder}
          onClose={() => setMovingProject(null)}
          onMoved={async () => {
            await load({ resetInlineChildren: true });
            setMoveNotice("Проект перемещён.");
          }}
        />
      ) : null}
      {assigneeDialog ? (
        <AssigneeDialog
          item={assigneeDialog.item}
          folderLabel={assigneeDialog.folderLabel}
          users={assigneeDialog.kind === "responsible" ? responsibleAssigneeUsers : assigneeMembersState.items}
          loadingUsers={assigneeMembersState.loading}
          usersError={assigneeMembersState.error}
          onClose={() => setAssigneeDialog(null)}
          onSave={(userId) => handleSaveAssignee(assigneeDialog, userId)}
        />
      ) : null}
    </div>
  );
}

// ─── Session Row ──────────────────────────────────────────────────────────────

function SessionRow({
  session,
  onOpen,
  isOpening = false,
  onReload,
  onSessionPatched,
  onSessionStatusChange,
  canRename = false,
  canDelete = false,
  canChangeStatus = false,
  showSignalColumns = true,
  showDiscussionColumn = false,
  notesAggregate = null,
  depth = 0,
  treeMode = false,
  isExpanded = false,
  isLoadingChildren = false,
  onToggleExpand,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [creatingSubprocesses, setCreatingSubprocesses] = useState(false);
  const sessionStatusMeta = getManualSessionStatusMeta(session.status || "draft");
  const hasChildren = Boolean(session?.has_children);
  const showChevron = treeMode && hasChildren;
  const titleSizeClass = treeMode ? (depth > 0 ? "text-sm" : "text-[15px]") : "text-sm";
  const rowBgClass = treeMode && depth > 0 ? "bg-gray-50 border-l-2 border-gray-200" : "";
  const leftPadding = treeMode ? 8 + depth * 18 : undefined;

  function openSession(options = {}) {
    if (isOpening) return;
    onOpen(session, {
      openTab: "diagram",
      source: "workspace_explorer_session_row",
      ...(options || {}),
    });
  }

  function handleRowOpen(event) {
    if (isOpening) return;
    const target = event?.target;
    if (target instanceof Element && target.closest("a[href],button,select,input,textarea,label,[data-stop-row-open='1']")) {
      return;
    }
    if (!shouldHandleClientNavigation(event)) return;
    openSession({ source: "workspace_explorer_session_row" });
  }
  const sessionHref = buildAppWorkspaceHref({
    projectId: session?.project_id,
    sessionId: session?.id || session?.session_id,
  });
  const discussionAttentionCount = sessionDiscussionAttentionCount(notesAggregate);
  const rowAttentionCount = discussionAttentionCount === null
    ? Math.max(0, Number(session.attention_count || 0) || 0)
    : discussionAttentionCount;
  const rowAttentionLabel = discussionAttentionCount === null
    ? "Требует внимания"
    : "Требует внимания из обсуждений";
  return (
    <>
      <tr
        className={`group transition-colors cursor-pointer ${isOpening ? "bg-accentSoft/20" : "hover:bg-accentSoft/30"} ${rowBgClass}`}
        onClick={handleRowOpen}
        aria-busy={isOpening ? "true" : undefined}
      >
        <td className="px-3 py-2 w-5"><IcoSession className="text-muted" /></td>
        <td className={`px-2 py-2 font-medium text-fg ${titleSizeClass}`}>
          <div className="min-w-0 flex items-center gap-1" style={{ paddingLeft: leftPadding }}>
            {showChevron ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand?.(session.id);
                }}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:text-gray-600"
                title={isExpanded ? "Свернуть" : "Развернуть"}
                aria-label={isExpanded ? "Свернуть подпроцессы" : "Развернуть подпроцессы"}
                data-stop-row-open="1"
              >
                {isLoadingChildren ? (
                  <IcoSpinner className="h-4 w-4 animate-spin" />
                ) : (
                  <IcoChevron right={!isExpanded} className="h-4 w-4" />
                )}
              </button>
            ) : treeMode ? (
              <span className="inline-block h-6 w-6 shrink-0" aria-hidden />
            ) : null}
            <AppRouteLink
              className={`block min-w-0 flex-1 ${isOpening ? "cursor-progress text-muted" : ""}`}
              href={sessionHref}
              onNavigate={() => openSession({ source: "workspace_explorer_session_title" })}
              title={session.name}
              aria-busy={isOpening ? "true" : undefined}
            >
              <span className="block truncate hover:underline">{session.name}</span>
              {treeMode && depth > 0 && session?.element_id_in_parent ? (
                <span className="block truncate text-[10px] text-gray-500">{session.element_id_in_parent}</span>
              ) : null}
            </AppRouteLink>
            {Number(session?.activity_count) > 0 ? (
              <span
                className="ml-1.5 inline-flex shrink-0 items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-muted"
                title="Элементов процесса"
              >
                {session.activity_count}
              </span>
            ) : null}
            {Number(session?.children_count) > 0 ? (
              <span
                className="ml-1.5 inline-flex shrink-0 items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600"
                title={`${session.children_count} подпроцессов`}
              >
                {session.children_count}
              </span>
            ) : null}
            {treeMode && depth > 0 && (!session?.bpmn_xml || String(session.bpmn_xml).length < 500) ? (
              <span
                className="ml-1.5 inline-flex shrink-0 items-center text-[10px] text-gray-400"
                title="Пустой шаблон"
              >
                📝
              </span>
            ) : null}
            {depth === 0 && Number(session?.subprocesses_count || 0) > Number(session?.children_count || 0) ? (
              <button
                type="button"
                disabled={creatingSubprocesses}
                onClick={async (e) => {
                  e.stopPropagation();
                  setCreatingSubprocesses(true);
                  try {
                    const remaining = Number(session?.subprocesses_count || 0) - Number(session?.children_count || 0);
                    const resp = await apiCreateSubprocessSessions(session?.id || session?.session_id, { loadAll: true });
                    if (!resp?.ok) {
                      window.alert?.(String(resp?.error || "Не удалось догрузить подпроцессы"));
                      return;
                    }
                    onReload?.();
                  } finally {
                    setCreatingSubprocesses(false);
                  }
                }}
                className="ml-2 inline-flex shrink-0 items-center rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                data-stop-row-open="1"
              >
                {creatingSubprocesses
                  ? "Загрузка..."
                  : `Загрузить остальные ${Number(session?.subprocesses_count || 0) - Number(session?.children_count || 0)}`}
              </button>
            ) : null}
          </div>
        </td>
        <td className="px-2 py-2">
          {canChangeStatus ? (
            <StatusPopoverControl
              domain="session"
              value={session.status}
              onChange={(nextStatus) => onSessionStatusChange?.(session, nextStatus)}
            />
          ) : (
            <StatusBadge status={session.status} />
          )}
        </td>
        {/* P6 [Г]: стадия — без вечного «—»: fallback на derived-статус */}
        <td className="hidden sm:table-cell px-2 py-2 text-[11px] text-fg/65">{session.stage || sessionStatusMeta.label || "—"}</td>
        <td className="hidden md:table-cell px-2 py-2">
          {session.owner
            ? <span className="text-[11px] text-fg/65 truncate block max-w-[88px]" title={session.owner.name || session.owner.id}>{session.owner.name || session.owner.id}</span>
            : <span className="text-[11px] text-muted/65">—</span>}
        </td>
        <td className="px-2 py-2"><DodBar percent={session.dod_percent} /></td>
        {showDiscussionColumn ? (
          <td className="px-2 py-2 text-center" title="Открытые обсуждения">
            <div className="flex min-w-0 justify-center">
              <NotesAggregateBadge
                aggregate={notesAggregate}
                compact
                compactNumericOnly
                label="Обсуждения"
                className="border-border bg-white/85 px-1.5 py-0 text-[10px]"
              />
            </div>
          </td>
        ) : null}
        {showSignalColumns ? (
          <td className="px-2 py-2 text-center" title={rowAttentionLabel}>
            <MetricCell label={rowAttentionLabel} value={rowAttentionCount} warn icon="⚠" emptyLabel="—" />
          </td>
        ) : null}
        {showSignalColumns ? (
          <td className="px-2 py-2 text-center" title="Отчёты">
            <MetricCell value={session.reports_count} />
          </td>
        ) : null}
        <td className="px-2 py-2 text-[11px] text-fg/65 text-right">{ts(session.updated_at)}</td>
        <td className="px-2 py-2 text-right w-[88px]">
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <AppRouteLink
              className={`secondaryBtn h-7 min-h-0 px-2 text-xs whitespace-nowrap transition-colors ${isOpening ? "cursor-progress" : "hover:border-accent/40 hover:text-fg"}`}
              href={sessionHref}
              onNavigate={() => openSession({ source: "workspace_explorer_session_cta" })}
              aria-busy={isOpening ? "true" : undefined}
            >
              {isOpening ? (
                <span className="inline-flex items-center gap-1.5">
                  <IcoSpinner className="animate-spin" />
                  Открывается...
                </span>
              ) : (
                "Открыть сессию"
              )}
            </AppRouteLink>
            {(canRename || canDelete) ? (
              <div className="relative">
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-transparent text-muted transition-colors hover:border-border hover:bg-panelAlt hover:text-fg"
                  onClick={() => setMenuOpen((v) => !v)}
                  title="Действия сессии"
                  aria-label="Действия сессии"
                >
                  ···
                </button>
                {menuOpen ? (
                  <ContextMenu
                    items={[
                      ...(canRename ? [{ label: "Переименовать", icon: <IcoEdit />, action: () => setRenaming(true) }] : []),
                      ...(canDelete ? [{ separator: true }, {
                        label: "Удалить",
                        icon: <IcoTrash />,
                        danger: true,
                        action: async () => {
                          const dangerous = String(session.status || "").trim().toLowerCase();
                          const message = dangerous === "ready" || dangerous === "archived"
                            ? `Удалить сессию «${session.name}» с финальным статусом?`
                            : `Удалить сессию «${session.name}»?`;
                          if (!window.confirm(message)) return;
                          const resp = await apiDeleteSession(session.id);
                          if (!resp?.ok) {
                            window.alert(String(resp?.error || "Не удалось удалить сессию"));
                            return;
                          }
                          onReload?.();
                        },
                      }] : []),
                    ]}
                    onClose={() => setMenuOpen(false)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </td>
      </tr>
      {renaming && canRename ? (
        <InputModal
          title="Переименовать сессию"
          placeholder="Новое название сессии"
          initialValue={session.name}
          actionLabel="Сохранить"
          onClose={() => setRenaming(false)}
          onSubmit={async (name) => {
            const resp = await apiPatchSession(session.id, { title: name });
            if (!resp?.ok) throw new Error(resp?.error || "Не удалось переименовать сессию");
            onSessionPatched?.(session.id, { name, updated_at: Math.floor(Date.now() / 1000) });
            onReload?.();
          }}
        />
      ) : null}
    </>
  );
}

// ─── Session Tree Rows ────────────────────────────────────────────────────────

function SessionTreeRows({
  sessions,
  depth = 0,
  sort = null,
  expanded,
  loadingChildren,
  childrenCache,
  childrenErrors,
  onToggleExpand,
  onReloadChildren,
  onOpen,
  isOpening,
  onReload,
  onSessionPatched,
  onSessionStatusChange,
  canRename,
  canDelete,
  canChangeStatus,
  showSignalColumns,
  showDiscussionColumn,
  noteAggregatesBySessionId,
  eagerTree = false,
}) {
  const sorted = useMemo(() => sortProjectSessions(sessions, sort), [sessions, sort]);
  return sorted.map((session) => {
    const sid = String(session?.id || "").trim();
    const isExpanded = eagerTree ? expanded.has(sid) : expanded.has(sid);
    const isLoading = eagerTree ? false : loadingChildren.has(sid);
    const children = eagerTree ? (session?.children || []) : (childrenCache[sid] || []);
    const childError = eagerTree ? "" : (childrenErrors[sid] || "");
    const indent = 8 + (depth + 1) * 18;
    return (
      <React.Fragment key={`session-${sid}-depth-${depth}`}>
        <SessionRow
          session={session}
          depth={depth}
          treeMode
          isExpanded={isExpanded}
          isLoadingChildren={isLoading}
          onToggleExpand={onToggleExpand}
          onOpen={onOpen}
          isOpening={isOpening === sid}
          onReload={onReload}
          onSessionPatched={onSessionPatched}
          onSessionStatusChange={onSessionStatusChange}
          canRename={canRename}
          canDelete={canDelete}
          canChangeStatus={canChangeStatus}
          showSignalColumns={showSignalColumns}
          showDiscussionColumn={showDiscussionColumn}
          notesAggregate={noteAggregatesBySessionId?.get(sid) || null}
        />
        {isExpanded ? (
          isLoading ? (
            <tr className="bg-gray-50/50 transition-opacity duration-200">
              <td colSpan={99} className="px-2 py-2 text-sm text-gray-500">
                <span className="inline-flex items-center gap-2" style={{ paddingLeft: indent }}>
                  <IcoSpinner className="h-4 w-4 animate-spin" /> Загрузка…
                </span>
              </td>
            </tr>
          ) : childError ? (
            <tr className="bg-gray-50/50 transition-opacity duration-200">
              <td colSpan={99} className="px-2 py-2 text-sm text-red-600">
                <span className="inline-flex items-center gap-2" style={{ paddingLeft: indent }}>
                  Ошибка загрузки
                  <button
                    type="button"
                    onClick={() => onReloadChildren(sid)}
                    className="text-xs underline hover:text-red-700"
                  >
                    Повторить
                  </button>
                </span>
              </td>
            </tr>
          ) : children.length === 0 ? (
            <tr className="bg-gray-50/50 transition-opacity duration-200">
              <td colSpan={99} className="px-2 py-2 text-sm text-gray-500">
                <span style={{ paddingLeft: indent }}>Нет подпроцессов</span>
              </td>
            </tr>
          ) : (
            <SessionTreeRows
              sessions={children}
              depth={depth + 1}
              sort={sort}
              expanded={expanded}
              loadingChildren={loadingChildren}
              childrenCache={childrenCache}
              childrenErrors={childrenErrors}
              onToggleExpand={onToggleExpand}
              onReloadChildren={onReloadChildren}
              onOpen={onOpen}
              isOpening={isOpening}
              onReload={onReload}
              onSessionPatched={onSessionPatched}
              onSessionStatusChange={onSessionStatusChange}
              canRename={canRename}
              canDelete={canDelete}
              canChangeStatus={canChangeStatus}
              showSignalColumns={showSignalColumns}
              showDiscussionColumn={showDiscussionColumn}
              noteAggregatesBySessionId={noteAggregatesBySessionId}
              eagerTree={eagerTree}
            />
          )
        ) : null}
      </React.Fragment>
    );
  });
}

// ─── Project Pane (sessions list) ─────────────────────────────────────────────

function ProjectPane({ workspaceId, projectId, onBack, onOpenSession, breadcrumbBase, permissions, activeOrgId }) {
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  // P6 [Г]: dnd-upload .bpmn/.xml на таблице сессий проекта.
  // pendingUploads — транзиентные строки создания/upload (стадии + retry).
  const [pendingUploads, setPendingUploads] = useState([]);
  const [tableDragOver, setTableDragOver] = useState(false);
  const pendingUploadSeq = useRef(0);
  const [openingSessionId, setOpeningSessionId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionSort, setSessionSort] = useState(null);
  const [activeTab, setActiveTab] = useState("sessions");
  const openingSessionIdRef = useRef("");

  const treeEnabled = useFeatureFlag("workspace_session_tree_view");
  const [expandedSessionIds, setExpandedSessionIds] = useState(() => new Set());
  const [sessionChildrenCache, setSessionChildrenCache] = useState({});
  const [loadingSessionChildren, setLoadingSessionChildren] = useState(() => new Set());
  const [sessionChildrenErrors, setSessionChildrenErrors] = useState({});

  const projectSessionsQuery = useQuery({
    ...projectSessionsQueryOptions(workspaceId, projectId),
    enabled: Boolean(workspaceId) && Boolean(projectId),
  });

  // Lazy tree only: children are loaded on demand via expand button.
  const eagerTree = false;

  const load = useCallback(async () => {
    if (!workspaceId || !projectId) return;
    setLoading(true);
    setError("");
    try {
      let resp;
      if (eagerTree) {
        resp = await apiGetProjectPage(workspaceId, projectId, { tree: true });
      } else if (treeEnabled) {
        resp = await apiGetProjectPage(workspaceId, projectId, { rootOnly: true, includeChildrenMeta: true });
      } else {
        resp = await apiGetProjectPage(workspaceId, projectId);
      }
      if (!resp?.ok) throw new Error(resp?.error || "Ошибка загрузки");
      const data = resp?.data || resp;
      setPage(data);
      if (eagerTree && Array.isArray(data?.sessions)) {
        setExpandedSessionIds(collectIdsWithChildren(data.sessions));
      }
    } catch (e) {
      setError(String(e?.message || "Ошибка загрузки"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, projectId, treeEnabled, eagerTree]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    openingSessionIdRef.current = "";
    setOpeningSessionId("");
  }, [projectId]);

  useEffect(() => {
    // When the server-side session list is refreshed (e.g. after BPMN upload
    // invalidates the project-sessions query), drop cached children so expanded
    // sessions reload their subprocess lists from the new XML.
    if (!treeEnabled) return;
    setSessionChildrenCache({});
  }, [projectSessionsQuery.data, treeEnabled]);

  // ── P6 [Г]: dnd-upload .bpmn/.xml на таблице сессий проекта ──────────────
  const updatePendingUpload = useCallback((tempId, patch) => {
    setPendingUploads((prev) => prev.map((u) => (u.tempId === tempId ? { ...u, ...patch } : u)));
  }, []);
  const finishPendingUpload = useCallback((tempId) => {
    setPendingUploads((prev) => prev.filter((u) => u.tempId !== tempId));
  }, []);
  const handleSessionFileDrop = useCallback(async (file) => {
    if (!file || !permissions?.canCreate) return;
    const tempId = `upl-${++pendingUploadSeq.current}`;
    const name = stripBpmnExtension(file.name) || "Сессия";
    const verdict = validateBpmnUploadFile(file);
    if (!verdict.ok) {
      setPendingUploads((prev) => [...prev, { tempId, name, stage: "error", error: verdict.error, sessionId: "", file }]);
      return;
    }
    setPendingUploads((prev) => [...prev, { tempId, name, stage: "creating", error: "", sessionId: "", file }]);
    const res = await createSessionWithBpmnUpload({
      workspaceId,
      projectId,
      name,
      file,
      onStage: (stage) => updatePendingUpload(tempId, { stage }),
    });
    updatePendingUpload(tempId, { stage: res.stage, sessionId: res.sessionId, error: res.error });
    if (res.ok) {
      load();
      setTimeout(() => finishPendingUpload(tempId), 1200);
    }
  }, [workspaceId, projectId, permissions?.canCreate, load, updatePendingUpload, finishPendingUpload]);
  const handlePendingUploadRetry = useCallback(async (tempId) => {
    const item = pendingUploads.find((u) => u.tempId === tempId);
    if (!item?.sessionId || !item?.file) return;
    updatePendingUpload(tempId, { stage: "uploading", error: "" });
    const res = await uploadSessionBpmnOnly({
      sessionId: item.sessionId,
      file: item.file,
      onStage: (stage) => updatePendingUpload(tempId, { stage }),
    });
    updatePendingUpload(tempId, { stage: res.stage, error: res.error });
    if (res.ok) {
      load();
      setTimeout(() => finishPendingUpload(tempId), 1200);
    }
  }, [pendingUploads, load, updatePendingUpload, finishPendingUpload]);
  const sessionTableDropZoneProps = {
    "data-testid": "project-sessions-dropzone",
    onDragOver: (e) => {
      if (e.dataTransfer?.types?.includes?.("Files")) {
        e.preventDefault();
        e.stopPropagation();
        setTableDragOver(true);
      }
    },
    onDragLeave: (e) => {
      e.preventDefault();
      setTableDragOver(false);
    },
    onDrop: (e) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      e.stopPropagation();
      setTableDragOver(false);
      void handleSessionFileDrop(e.dataTransfer.files[0]);
    },
  };

  const handleSessionPatched = useCallback((sessionId, patch = {}) => {
    const sid = String(sessionId || "").trim();
    if (!sid) return;
    setPage((prev) => {
      if (!prev || !Array.isArray(prev.sessions)) return prev;
      const nextSessions = JSON.parse(JSON.stringify(prev.sessions));
      const changed = patchSessionInTree(nextSessions, sid, patch);
      if (!changed) return prev;
      return { ...prev, sessions: nextSessions };
    });
  }, []);

  const handleSessionStatusChange = useCallback(async (session, nextStatus) => {
    const sid = String(session?.id || session?.session_id || "").trim();
    const normalizedStatus = String(nextStatus || "").trim();
    if (!sid || !normalizedStatus) return false;
    try {
      const sessionSnapshot = await apiGetSession(sid);
      const baseVersion = Number(sessionSnapshot?.session?.diagram_state_version);
      if (!sessionSnapshot?.ok || !Number.isFinite(baseVersion) || baseVersion < 0) {
        window.alert(formatSessionPatchError(sessionSnapshot, "Не удалось получить актуальную версию сессии"));
        return false;
      }
      const resp = await apiPatchSession(sid, {
        status: normalizedStatus,
        base_diagram_state_version: baseVersion,
      });
      if (!resp?.ok) {
        const message = resp?.status === 409
          ? "Переход в выбранный статус недоступен для текущего состояния сессии."
          : formatSessionPatchError(resp);
        window.alert(message);
        return false;
      }
      handleSessionPatched(sid, {
        status: String(resp?.session?.interview?.status || normalizedStatus),
        updated_at: Number(resp?.session?.updated_at || Math.floor(Date.now() / 1000)),
      });
      await load();
      return true;
    } catch (e) {
      window.alert(String(e?.message || "Не удалось обновить статус сессии"));
      return false;
    }
  }, [handleSessionPatched, load]);

  const handleProjectStatusChange = useCallback(async (nextStatus) => {
    if (!projectId || !nextStatus) return false;
    const apiStatus = mapCatalogStatusToProjectApi(nextStatus);
    const resp = await apiPatchProject(projectId, { status: apiStatus });
    if (!resp?.ok) {
      setError(String(resp?.error || "Не удалось обновить статус проекта"));
      return false;
    }
    await load();
    return true;
  }, [projectId, load, setError]);

  const loadSessionChildren = useCallback(async (sessionId) => {
    const sid = String(sessionId || "").trim();
    if (!sid || loadingSessionChildren.has(sid)) return;
    setLoadingSessionChildren((prev) => new Set(prev).add(sid));
    setSessionChildrenErrors((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
    try {
      const resp = await apiGetSessionChildren(sid);
      if (!resp?.ok) throw new Error(resp?.error || "Ошибка загрузки");
      setSessionChildrenCache((prev) => ({ ...prev, [sid]: resp?.data || [] }));
    } catch (e) {
      setSessionChildrenErrors((prev) => ({ ...prev, [sid]: String(e?.message || "Ошибка загрузки") }));
    } finally {
      setLoadingSessionChildren((prev) => {
        const next = new Set(prev);
        next.delete(sid);
        return next;
      });
    }
  }, [loadingSessionChildren]);

  const toggleSessionExpand = useCallback((sessionId) => {
    const sid = String(sessionId || "").trim();
    if (!sid) return;
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) {
        next.delete(sid);
      } else {
        next.add(sid);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!treeEnabled) return;
    expandedSessionIds.forEach((sid) => {
      if (!sessionChildrenCache[sid] && !loadingSessionChildren.has(sid) && !sessionChildrenErrors[sid]) {
        loadSessionChildren(sid);
      }
    });
  }, [treeEnabled, expandedSessionIds, sessionChildrenCache, loadingSessionChildren, sessionChildrenErrors, loadSessionChildren]);

  const proj = page?.project;
  const sessions = page?.sessions || [];
  const sortedSessions = useMemo(
    () => sortProjectSessions(sessions, sessionSort),
    [sessions, sessionSort],
  );
  const handleSessionSort = useCallback((key) => {
    setSessionSort((prev) => toggleExplorerSort(prev, key));
  }, []);
  const sessionAggregateIds = useMemo(() => {
    const rootIds = sessions.map((item) => item?.id || item?.session_id).filter(Boolean);
    if (!treeEnabled) return rootIds;
    if (eagerTree) {
      return collectSessionIdsRecursive(sessions);
    }
    const ids = new Set(rootIds);
    function addCached(parentId) {
      const list = sessionChildrenCache[parentId] || [];
      list.forEach((child) => {
        const cid = String(child?.id || child?.session_id || "").trim();
        if (!cid) return;
        ids.add(cid);
        if (expandedSessionIds.has(cid)) addCached(cid);
      });
    }
    sessions.forEach((s) => {
      const sid = String(s?.id || "").trim();
      if (sid && expandedSessionIds.has(sid)) addCached(sid);
    });
    return Array.from(ids);
  }, [sessions, treeEnabled, eagerTree, sessionChildrenCache, expandedSessionIds]);
  const noteAggregatesBySessionId = useSessionNoteAggregates(sessionAggregateIds);
  const isEmpty = !loading && !error && sessions.length === 0;
  const sessionColumnProfile = EXPLORER_COLUMN_PROFILES.sessions;
  const backCrumbs = normalizeProjectBreadcrumbBase(breadcrumbBase);
  const parentFolderCrumb = [...backCrumbs].reverse().find((crumb) => crumb.type === "folder") || null;
  const projectContext = {
    projectId,
    workspaceId,
    folderId: parentFolderCrumb?.id || "",
    breadcrumbBase: backCrumbs,
    projectTitle: proj?.name || proj?.title || "",
  };
  const handleOpenSessionRequest = useCallback(async (sessionLike, options = {}) => {
    const row = sessionLike && typeof sessionLike === "object" ? sessionLike : {};
    const sid = String(row?.id || row?.session_id || "").trim();
    if (!sid) return;
    if (openingSessionIdRef.current) return;
    openingSessionIdRef.current = sid;
    setOpeningSessionId(sid);
    try {
      await onOpenSession?.({
        ...row,
        project_id: row?.project_id || projectId,
        workspace_id: row?.workspace_id || workspaceId,
        projectContext,
      }, {
        ...options,
        openTab: options?.openTab || "diagram",
        source: options?.source || "workspace_explorer_session_list",
      });
    } finally {
      if (openingSessionIdRef.current === sid) {
        openingSessionIdRef.current = "";
        setOpeningSessionId((prev) => (prev === sid ? "" : prev));
      }
    }
  }, [onOpenSession, projectContext, projectId, workspaceId]);

  const projectBreadcrumbTrail = buildProjectBreadcrumbTrail(backCrumbs, proj?.name || "");
  const projectCrumbItems = projectBreadcrumbTrail.map((c, index) => ({
    key: `${c.type}-${c.id || "project"}`,
    label: c.name,
    // Текущий сегмент заменяет H1 — testid заголовка живёт на нём.
    testId: index === projectBreadcrumbTrail.length - 1 ? "project-title" : undefined,
    onClick: c.active ? undefined : () => onBack(c),
  }));
  // Часть А-2 (nav-zone): однострочная полоса — адаптив по ширине контейнера.
  const [projectNavRef, projectNavWidth] = useElementWidth();
  const projectNavLayout = getWorkspaceHeaderLayout(projectNavWidth);
  const normalizedProjectStatus = String(proj?.status || "").trim().toLowerCase();
  const parentCrumb = backCrumbs.length ? backCrumbs[backCrumbs.length - 1] : null;
  // Прямой переход по URL (без контекста explorer): назад — в раздел проекта
  // (folder_id из карточки проекта) или в корень рабочей области.
  const projectBackCrumb = parentCrumb
    || (proj ? { type: proj.folder_id ? "folder" : "workspace", id: proj.folder_id || "" } : null);
  const sessionCount = Number(proj?.sessions_count || sessions.length || 0) || 0;
  const searchIndex = useMemo(
    () => buildProjectSessionSearchIndex({
      project: proj,
      sessions,
      breadcrumbBase: backCrumbs,
    }),
    [proj, sessions, backCrumbs],
  );
  const searchModel = useMemo(
    () => filterExplorerSearchResults(searchIndex, searchQuery),
    [searchIndex, searchQuery],
  );
  const handleOpenSearchResult = useCallback((result) => {
    const target = result?.target || {};
    if (target.kind === "session" && target.session) {
      setSearchQuery("");
      handleOpenSessionRequest({
        ...target.session,
        project_id: projectId,
        workspace_id: workspaceId,
      });
      return;
    }
    if (target.kind === "project") {
      setSearchQuery("");
    }
  }, [handleOpenSessionRequest, projectId, workspaceId]);

  // Блок «назад» для левой колонки (uiux/sidebar-header-join-v1).
  // На уровне проекта кнопка всегда активна.
  const projectBackLabel = "Назад к проекту";
  const projectSidebarHeader = (
    <button
      type="button"
      onClick={() => onBack(projectBackCrumb)}
      className="w-full h-full flex items-center gap-2 px-3 text-sm text-left text-fg hover:bg-bg transition-colors rounded-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      title={projectBackLabel}
      aria-label={projectBackLabel}
      data-testid="project-back-section"
    >
      <IcoArrowLeft className="shrink-0" />
      <span className="truncate">{projectBackLabel}</span>
    </button>
  );
  // Хук должен вызываться на каждом рендере ДО любого раннего return.
  useSetExplorerSidebarHeader(projectSidebarHeader);

  // Часть А: хедер проекта порталится в общий слот workspaceMain (пиксель-в-пиксель).
  const navSlotEl = useWorkspaceMainNavSlot();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="space-y-2 w-full max-w-lg px-6">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-border/30 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="flex-1 flex items-center justify-center p-8 text-danger text-sm">{error}</div>;
  }

  const createSessionLabel = projectNavLayout.shortCreateLabels ? "Сессия" : "Новая сессия";
  const sessionCountersFull = `Сессии: ${sessionCount}`;
  const sessionCountersShort = String(sessionCount);

  const projectHeader = (
      <div className="px-4 border-b border-border flex-shrink-0 bg-panel" data-testid="project-header">
        {/* Часть А-2 (nav-zone): одна строка ~40px — путь (текущий сегмент = заголовок),
            статус, табы, поиск, создание, мета справа. Кнопка «назад» живёт в левой колонке. */}
        <div
          ref={projectNavRef}
          className="flex h-10 min-w-0 flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap"
          data-nav-width={Math.round(projectNavWidth)}
        >
          <TextBreadcrumbs
            crumbs={projectCrumbItems}
            dataTestId="project-breadcrumbs"
            singleLine
            forceCollapse={projectNavWidth < 900}
            currentClassName="text-[15px] font-semibold min-w-[12ch]"
          />
          {proj ? (
            <StatusPopoverControl
              domain="project"
              value={proj.status}
              onChange={handleProjectStatusChange}
            />
          ) : null}
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            <div className="flex h-7 items-center rounded-lg border border-border bg-panel p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab("sessions")}
                className={`rounded-md px-2.5 py-0.5 text-xs font-medium transition ${
                  activeTab === "sessions" ? "bg-accent text-white" : "text-muted hover:text-fg hover:bg-panel2"
                }`}
              >
                Сессии
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("analytics")}
                className={`rounded-md px-2.5 py-0.5 text-xs font-medium transition ${
                  activeTab === "analytics" ? "bg-accent text-white" : "text-muted hover:text-fg hover:bg-panel2"
                }`}
              >
                Аналитика
              </button>
            </div>
            <ExplorerSearchBox
              id="workspace-explorer-project-search"
              value={searchQuery}
              onChange={setSearchQuery}
              className={projectNavLayout.searchIconOnly ? "w-[140px]" : "w-[260px]"}
            />
            {permissions?.canCreate ? (
              <button onClick={() => setCreating(true)} className="primaryBtn h-7 px-3 text-xs flex items-center gap-1">
                <IcoPlus /> {createSessionLabel}
              </button>
            ) : null}
            {projectNavLayout.showCounters || projectNavLayout.shortCounters ? (
              <span
                className="shrink-0 text-xs text-muted"
                title={projectNavLayout.shortCounters ? sessionCountersFull : undefined}
                data-testid="project-meta"
              >
                {projectNavLayout.showCounters
                  ? `· ${sessionCountersFull}`
                  : `· ${sessionCountersShort}`}
              </span>
            ) : null}
          </div>
        </div>
      </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {navSlotEl ? createPortal(projectHeader, navSlotEl) : projectHeader}

      {activeTab === "analytics" ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <AnalyticsPage scope="project" scopeId={projectId} module="overview" orgId={activeOrgId} embedded />
        </div>
      ) : null}

      {searchModel.active ? (
        <ExplorerSearchResults model={searchModel} onOpenResult={handleOpenSearchResult} />
      ) : isEmpty ? (
        <div
          className={`flex-1 flex flex-col items-center justify-center gap-4 p-8 transition-colors ${tableDragOver ? "bg-accentSoft/30 outline-2 outline-dashed outline-accent/60 outline-offset-[-6px]" : ""}`}
          {...sessionTableDropZoneProps}
        >
          <IcoSession className="w-10 h-10 text-muted/30" />
          <div className="text-center">
            <p className="text-base font-medium text-fg mb-1">Нет сессий</p>
            <p className="text-sm text-muted">Создайте первую сессию для этого проекта</p>
            {permissions?.canCreate ? (
              <p className="mt-1 text-xs text-muted">Или перетащите сюда файл .bpmn/.xml</p>
            ) : null}
          </div>
          {pendingUploads.length ? (
            <div className="w-full max-w-lg grid gap-1.5">
              {pendingUploads.map((u) => (
                <PendingUploadCard key={u.tempId} upload={u} onRetry={handlePendingUploadRetry} />
              ))}
            </div>
          ) : null}
          {permissions?.canCreate ? (
            <button onClick={() => setCreating(true)} className="primaryBtn h-8 px-4 text-sm flex items-center gap-1">
              <IcoPlus /> Создать сессию
            </button>
          ) : null}
        </div>
      ) : (
        <div
          className={`flex-1 overflow-y-auto transition-colors ${tableDragOver ? "bg-accentSoft/25 outline-2 outline-dashed outline-accent/60 outline-offset-[-6px]" : ""}`}
          {...sessionTableDropZoneProps}
        >
          <table className="w-full text-left border-collapse">
            <colgroup>
              <col className="w-5" />
              <col />
              <col className="w-[154px]" />
              <col className="w-[92px]" />
              <col className="w-[96px]" />
              <col className="w-[90px]" />
              {sessionColumnProfile.showDiscussionColumn ? <col className="w-[76px]" /> : null}
              {sessionColumnProfile.showSignalColumns ? <col className="w-[76px]" /> : null}
              {sessionColumnProfile.showSignalColumns ? <col className="w-[42px]" /> : null}
              <col className="w-[104px]" />
              <col className="w-[88px]" />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border/80 bg-panelAlt/95 text-[11px] uppercase tracking-wide text-fg/65 backdrop-blur-sm">
                <th className="px-3 py-2 w-5" />
                <th className="px-2 py-2" aria-sort={sessionSort?.key === "name" ? (sessionSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Название" sortKey="name" sort={sessionSort} onSort={handleSessionSort} />
                </th>
                <th className="px-2 py-2" aria-sort={sessionSort?.key === "status" ? (sessionSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Статус" sortKey="status" sort={sessionSort} onSort={handleSessionSort} />
                </th>
                <th className="hidden sm:table-cell px-2 py-2" aria-sort={sessionSort?.key === "stage" ? (sessionSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Стадия" sortKey="stage" sort={sessionSort} onSort={handleSessionSort} />
                </th>
                <th className="hidden md:table-cell px-2 py-2" aria-sort={sessionSort?.key === "owner" ? (sessionSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Owner" sortKey="owner" sort={sessionSort} onSort={handleSessionSort} />
                </th>
                <th className="px-2 py-2">DoD</th>
                {sessionColumnProfile.showDiscussionColumn ? (
                  <th className="px-2 py-2 text-center" title="Открытые обсуждения" aria-label="Колонка открытых обсуждений">
                    Обс.
                  </th>
                ) : null}
                {sessionColumnProfile.showSignalColumns ? (
                  <th className="px-2 py-2 text-center" title="Требует внимания" aria-label="Колонка Требует внимания">
                    <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap">
                      <span aria-hidden>⚠</span>
                      <span>Вним.</span>
                    </span>
                  </th>
                ) : null}
                {sessionColumnProfile.showSignalColumns ? (
                  <th className="px-2 py-2 text-center" title="Отчёты" aria-label="Колонка отчётов">
                    <span aria-hidden>📋</span>
                  </th>
                ) : null}
                <th className="px-2 py-2 text-right" aria-sort={sessionSort?.key === "updatedAt" ? (sessionSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Обновлена" sortKey="updatedAt" sort={sessionSort} onSort={handleSessionSort} align="right" />
                </th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/65">
              {pendingUploads.map((u) => (
                <PendingUploadRow key={u.tempId} upload={u} onRetry={handlePendingUploadRetry} />
              ))}
              {treeEnabled ? (
                <SessionTreeRows
                  sessions={sortedSessions}
                  sort={sessionSort}
                  expanded={expandedSessionIds}
                  loadingChildren={loadingSessionChildren}
                  childrenCache={sessionChildrenCache}
                  childrenErrors={sessionChildrenErrors}
                  onToggleExpand={toggleSessionExpand}
                  onReloadChildren={loadSessionChildren}
                  onOpen={(sess, options) => handleOpenSessionRequest({
                    ...sess,
                    project_id: projectId,
                    workspace_id: workspaceId,
                  }, options)}
                  isOpening={openingSessionId}
                  onReload={load}
                  onSessionPatched={handleSessionPatched}
                  onSessionStatusChange={handleSessionStatusChange}
                  canRename={!!permissions?.canRenameSession}
                  canDelete={!!permissions?.canDeleteSession}
                  canChangeStatus={!!permissions?.canChangeStatus}
                  showSignalColumns={sessionColumnProfile.showSignalColumns}
                  showDiscussionColumn={sessionColumnProfile.showDiscussionColumn}
                  noteAggregatesBySessionId={noteAggregatesBySessionId}
                  eagerTree={eagerTree}
                />
              ) : (
                sortedSessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    notesAggregate={noteAggregatesBySessionId.get(String(s?.id || s?.session_id || "").trim()) || null}
                    isOpening={openingSessionId === String(s.id || s.session_id || "").trim()}
                        onOpen={(sess, options) => handleOpenSessionRequest({
                          ...sess,
                          project_id: projectId,
                          workspace_id: workspaceId,
                        }, options)}
                    onReload={load}
                    onSessionPatched={handleSessionPatched}
                    onSessionStatusChange={handleSessionStatusChange}
                    canRename={!!permissions?.canRenameSession}
                    canDelete={!!permissions?.canDeleteSession}
                    canChangeStatus={!!permissions?.canChangeStatus}
                    showSignalColumns={sessionColumnProfile.showSignalColumns}
                    showDiscussionColumn={sessionColumnProfile.showDiscussionColumn}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {creating && permissions?.canCreate ? (
        <SessionCreateModal
          sessions={sessions}
          onClose={() => setCreating(false)}
          onSubmit={async ({ name, processLayer, derivedFrom }) => {
            const resp = await apiCreateSession(workspaceId, projectId, {
              name,
              process_layer: processLayer,
              derived_from_session_id: derivedFrom,
            });
            if (!resp?.ok) throw new Error(resp?.error || "Не удалось создать сессию");
            const sessionId = String(resp?.data?.id || "").trim();
            load();
            return { sessionId };
          }}
          onUploadFile={async (sessionId, file) => {
            const res = await uploadSessionBpmnOnly({ sessionId, file });
            if (res.ok) load();
            return res;
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Root WorkspaceExplorer ────────────────────────────────────────────────────

export default function WorkspaceExplorer({
  activeOrgId,
  onOpenSession,
  requestProjectId,
  requestProjectWorkspaceId = "",
  requestProjectContext = null,
  onClearRequestedProject,
}) {
  const { user, orgs } = useAuth();
  const {
    currentOrgName,
    currentOrgActive,
    permissions,
    workspaces,
    wsLoading,
    wsError,
    activeWorkspaceId,
    currentFolderId,
    currentProjectId,
    breadcrumbBase,
    projectRestoreStatus,
    handleSelectWorkspace,
    handleCreateWorkspace,
    handleNavigateToFolder,
    handleNavigateToProject,
    handleNavigateToBreadcrumb,
    handleBackFromProject,
    handleWorkspaceRenamed,
  } = useWorkspaceExplorerController({
    activeOrgId,
    requestProjectId,
    requestProjectWorkspaceId,
    requestProjectContext,
    onClearRequestedProject,
    orgs,
    isAdmin: Boolean(user?.is_admin),
  });

  if (wsLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-sm text-muted animate-pulse">Загрузка workspaces…</div>
      </div>
    );
  }

  if (wsError) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center text-danger text-sm">{wsError}</div>
      </div>
    );
  }

  return (
    <ExplorerSidebarProvider>
      <div className="h-full flex flex-col min-h-0 bg-bg font-sans">
        {!currentOrgActive ? (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            <strong>Организация деактивирована.</strong>{" "}
            Создание и редактирование сессий недоступно. Обратитесь к администратору.
          </div>
        ) : null}
        <div className="h-full flex flex-row min-h-0 font-sans">
          {/* Left column: back button on top, workspace list below (single surface). */}
          <div className="min-w-[15rem] w-fit shrink-0 flex flex-col bg-panel rounded-l-[0.875rem] rounded-r-none border border-border border-r-0 overflow-hidden">
            <ExplorerSidebarHeaderBlock />
            <div className="flex-1 overflow-hidden">
              <WorkspaceSidebar
                organizationName={currentOrgName}
                workspaces={workspaces}
                activeWorkspaceId={activeWorkspaceId}
                onSelectWorkspace={handleSelectWorkspace}
                onCreateWorkspace={handleCreateWorkspace}
                canCreateWorkspace={permissions.canManageUsers}
                canRenameWorkspace={permissions.canRenameWorkspace}
                onWorkspaceRenamed={handleWorkspaceRenamed}
              />
            </div>
          </div>

          {/* Right pane — Explorer + Project (both mounted; only one visible at a time).
               ExplorerPane is kept in DOM so its loaded state survives project round-trips. */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
            {requestProjectId && projectRestoreStatus === "resolving" ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted">
                Восстанавливаем проект…
              </div>
            ) : !activeWorkspaceId ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted">
                Выберите workspace слева
              </div>
            ) : (
              <>
                {/* ExplorerPane: always mounted, hidden while a project is open */}
                <div className={`absolute inset-0 flex flex-col min-h-0 ${currentProjectId ? "invisible pointer-events-none" : ""}`}>
                  <ExplorerPane
                    activeOrgId={activeOrgId}
                    orgs={orgs}
                    currentUser={user}
                    workspaceId={activeWorkspaceId}
                    folderId={currentFolderId}
                    onNavigateToFolder={handleNavigateToFolder}
                    onNavigateToProject={handleNavigateToProject}
                    onNavigateToBreadcrumb={handleNavigateToBreadcrumb}
                    onOpenSession={onOpenSession}
                    permissions={permissions}
                    portalHeader={!currentProjectId}
                  />
                </div>

                {/* ProjectPane: only rendered while a project is selected */}
                {currentProjectId && (
                  <div className="absolute inset-0 flex flex-col min-h-0">
                    <ProjectPane
                      workspaceId={activeWorkspaceId}
                      projectId={currentProjectId}
                      onBack={handleBackFromProject}
                      onOpenSession={onOpenSession}
                      activeOrgId={activeOrgId}
                      breadcrumbBase={breadcrumbBase}
                      permissions={permissions}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </ExplorerSidebarProvider>
  );
}
