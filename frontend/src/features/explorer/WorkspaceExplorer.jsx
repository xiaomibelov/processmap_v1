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

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
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
} from "./explorerApi.js";
import { apiDeleteProject, apiDeleteSession, apiGetSession, apiListOrgMembers, apiPatchProject, apiPatchSession } from "../../lib/api";
import {
  MANUAL_SESSION_STATUSES,
  getManualSessionStatusMeta,
} from "../workspace/workspacePermissions";
import { useAuth } from "../auth/AuthProvider.jsx";
import { buildVisibleRows, hasFolderChildren } from "./work3TreeState.js";
import { useWorkspaceExplorerController } from "./useWorkspaceExplorerController.js";
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
  getExplorerAssigneeActionLabel,
  getExplorerAssigneeDialogTitle,
  getExplorerAssigneeId,
  getExplorerAssigneeKind,
  getExplorerBusinessAssignee,
  getExplorerBusinessAssigneeLabel,
  normalizeExplorerAssignableUsersResponse,
} from "./explorerAssigneeModel.js";
import {
  getExplorerContextStatusLabel,
  getExplorerContextStatusOptions,
  isExplorerContextStatusEditable,
  normalizeExplorerContextStatus,
} from "./explorerContextStatusModel.js";
import AppRouteLink from "../../components/navigation/AppRouteLink.jsx";
import NotesAggregateBadge from "../../components/NotesAggregateBadge.jsx";
import { useSessionNoteAggregates } from "../../lib/sessionNoteAggregates.js";
import { buildAppWorkspaceHref, shouldHandleClientNavigation } from "../navigation/appLinkBehavior.js";

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
  if (!epoch) return "";
  const d = new Date(epoch * 1000);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "только что";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} д назад`;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
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
    if (code === "DIAGRAM_STATE_BASE_VERSION_REQUIRED") {
      return "Не удалось сменить статус: требуется актуальная версия диаграммы. Обновите страницу и повторите.";
    }
    if (code === "DIAGRAM_STATE_CONFLICT") {
      return "Не удалось сменить статус: обнаружен конфликт версии диаграммы. Обновите страницу и повторите.";
    }
    try {
      const packed = JSON.stringify(detail);
      if (packed && packed !== "{}") return `${fallback}: ${packed}`;
    } catch {
      // ignore serialization errors
    }
  }

  const err = String(resp?.error || "").trim();
  if (err && err !== "[object Object]") return err;

  if (Number(resp?.status || 0) === 409) {
    return "Не удалось сменить статус: конфликт версии диаграммы. Обновите страницу и повторите.";
  }
  return fallback;
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

function StatusBadge({ status }) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["draft", "in_progress", "review", "ready", "archived"].includes(normalized)) {
    const meta = getManualSessionStatusMeta(normalized);
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

function BreadcrumbChip({ children, active = false, onClick }) {
  const className = active
    ? "inline-flex max-w-[180px] items-center truncate rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1 text-xs font-medium text-fg"
    : "inline-flex max-w-[180px] items-center truncate rounded-full border border-border bg-panelAlt/50 px-2.5 py-1 text-xs text-muted transition-colors hover:border-border/80 hover:bg-panelAlt hover:text-fg";
  if (typeof onClick === "function") {
    return (
      <button type="button" onClick={onClick} className={className}>
        <span className="truncate">{children}</span>
      </button>
    );
  }
  return (
    <span className={className}>
      <span className="truncate">{children}</span>
    </span>
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
  const label = getExplorerBusinessAssigneeLabel(item);
  const empty = label === "—";
  const user = getExplorerBusinessAssignee(item);
  const title = empty ? "Не назначен" : formatExplorerUserDisplay(user);
  return (
    <span
      className={`block max-w-[150px] truncate text-[11px] ${empty ? "text-muted/70" : "text-fg/70"}`}
      title={title || label}
    >
      {label}
    </span>
  );
}

function contextStatusClass(value) {
  const normalized = normalizeExplorerContextStatus(value);
  if (normalized === "as_is") return "border-cyan-300/70 bg-cyan-500/12 text-fg/85";
  if (normalized === "to_be") return "border-amber-300/75 bg-amber-400/15 text-fg/85";
  return "border-border/80 bg-panelAlt/45 text-muted";
}

function ContextStatusBadge({ value }) {
  const normalized = normalizeExplorerContextStatus(value);
  return (
    <span
      className={`inline-flex h-7 min-w-[62px] items-center justify-center rounded-full border px-2 text-xs font-semibold ${contextStatusClass(normalized)}`}
      title={getExplorerContextStatusLabel(normalized)}
    >
      {getExplorerContextStatusLabel(normalized)}
    </span>
  );
}

function ContextStatusControl({ item, disabled = false, onChange }) {
  const normalized = normalizeExplorerContextStatus(item?.context_status);
  const [pendingStatus, setPendingStatus] = useState(normalized);
  const [saving, setSaving] = useState(false);
  const options = useMemo(() => getExplorerContextStatusOptions(), []);

  useEffect(() => {
    setPendingStatus(normalized);
  }, [normalized]);

  const handleChange = async (event) => {
    const nextStatus = normalizeExplorerContextStatus(event.target.value);
    setPendingStatus(nextStatus);
    if (nextStatus === normalized) return;
    setSaving(true);
    try {
      const ok = await onChange?.(item, nextStatus);
      if (ok === false) setPendingStatus(normalized);
    } catch {
      setPendingStatus(normalized);
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={pendingStatus}
      onChange={handleChange}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      disabled={disabled || saving}
      className={`h-7 w-[86px] rounded-full border px-2 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-60 ${contextStatusClass(pendingStatus)}`}
      title="Статус контекста"
      aria-label="Статус контекста"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function assigneeMemberId(user) {
  return String(user?.user_id || user?.id || "").trim();
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
  return (
    <div className="h-full flex flex-col border-r border-border bg-panel2 select-none">
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
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-none
              ${ws.id === activeWorkspaceId
                ? "bg-accentSoft text-accent font-medium"
                : "text-fg hover:bg-bg"
              }`}
          >
            <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelectWorkspace(ws.id)}>
              <IcoWorkspace className={ws.id === activeWorkspaceId ? "text-accent" : "text-muted"} />
              <span className="truncate">{ws.name}</span>
            </button>
            <span className="text-[10px] text-muted opacity-60">{ws.role || "viewer"}</span>
            {canRenameWorkspace && ws.id === activeWorkspaceId ? (
              <button className="text-muted hover:text-fg p-0.5" title="Переименовать workspace" onClick={() => setRenamingWorkspace(ws)}>
                <IcoEdit />
              </button>
            ) : null}
          </div>
        ))}
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

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({ crumbs, onNavigate }) {
  return (
    <nav className="flex items-center gap-1 text-sm text-muted overflow-x-auto whitespace-nowrap pb-0.5">
      {crumbs.map((crumb, i) => (
        <React.Fragment key={`${crumb.type}-${crumb.id}`}>
          {i > 0 && <IcoChevron right className="text-muted/50 shrink-0" />}
          <button
            onClick={() => onNavigate(crumb)}
            className={`hover:text-fg transition-colors truncate max-w-[160px] ${
              i === crumbs.length - 1 ? "text-fg font-medium pointer-events-none" : "hover:underline"
            }`}
          >
            {crumb.name}
          </button>
        </React.Fragment>
      ))}
    </nav>
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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const expandable = hasFolderChildren(folder);
  const leftPadding = 8 + depth * 18;
  const dodPercent = normalizeDodPercent(folder.rollup_dod_percent);
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
            <button className="block min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onNavigate(folder)} title={folder.name}>
              {folder.name}
            </button>
          </div>
        </td>
        <td className="px-2 py-2.5 text-xs text-muted"><EntityTypePill type="folder" label={folderLabel} /></td>
        <td className="px-2 py-2.5 text-xs text-muted text-center">
          {folder.child_folder_count ?? 0} / {folder.descendant_sessions_count ?? 0}
        </td>
        <td className="px-2 py-2.5 text-xs text-muted text-center">
          <span className="text-[11px] text-fg/60">Проектов: {folder.descendant_projects_count ?? 0}</span>
        </td>
        <td className="px-2 py-2.5"><AssigneeCell item={folder} /></td>
        <td className="px-2 py-2.5">
          {dodPercent && dodPercent > 0 ? <DodBar percent={dodPercent} /> : <span className="text-xs text-muted/70">—</span>}
        </td>
        {showSignalColumns ? <td className="px-2 py-2.5 text-xs text-muted text-center">—</td> : null}
        {showSignalColumns ? <td className="px-2 py-2.5 text-xs text-muted text-center">—</td> : null}
        <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
          {canEdit && isExplorerContextStatusEditable(folder) ? (
            <ContextStatusControl
              item={folder}
              disabled={loading}
              onChange={onContextStatusChange}
            />
          ) : (
            <ContextStatusBadge value={folder.context_status} />
          )}
        </td>
        <td className="px-2 py-2.5 text-xs text-fg/60 text-right">{ts(folder.rollup_activity_at || folder.updated_at) || "—"}</td>
        <LastActivityCell node={folder} maxWidthClass="max-w-[180px]" quiet />
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
  onClick,
  onMove,
  onAssign,
  onReload,
  canMove = false,
  canAssign = false,
  canRename = false,
  canDelete = false,
  showSignalColumns = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const leftPadding = 8 + depth * 18;
  const dodPercent = normalizeDodPercent(project.dod_percent);
  const normalizedStatus = String(project.status || "").trim().toLowerCase();
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
      <tr className="group hover:bg-accentSoft/30 transition-colors">
        <td className="px-2 py-2.5 text-sm font-medium text-fg">
          <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${leftPadding}px` }}>
            <span className="inline-flex h-6 w-6 shrink-0 rounded-md border border-transparent" aria-hidden />
            <IcoProject className="shrink-0 text-accent" />
            <AppRouteLink
              className="block min-w-0 flex-1 truncate text-left hover:underline"
              href={projectHref}
              onNavigate={() => onClick(project)}
              title={project.name}
            >
              {project.name}
            </AppRouteLink>
          </div>
        </td>
        <td className="px-2 py-2.5 text-xs text-muted"><EntityTypePill type="project" /></td>
        <td className="px-2 py-2.5 text-center">
          <span className="text-xs text-muted">{project.descendant_sessions_count ?? project.sessions_count ?? 0} сессий</span>
        </td>
        <td className="px-2 py-2.5">
          <span className="text-xs text-muted/70">—</span>
        </td>
        <td className="px-2 py-2.5"><AssigneeCell item={project} /></td>
        <td className="px-2 py-2.5">
          {dodPercent && dodPercent > 0 ? <DodBar percent={dodPercent} /> : <span className="text-xs text-muted/70">—</span>}
        </td>
        {showSignalColumns ? <td className="px-2 py-2.5 text-center"><MetricCell value={project.attention_count} warn /></td> : null}
        {showSignalColumns ? <td className="px-2 py-2.5 text-center"><MetricCell value={project.reports_count} /></td> : null}
        <td className="px-2 py-2.5">
          {!normalizedStatus || normalizedStatus === "active"
            ? <span className="text-xs text-muted/70">—</span>
            : <StatusBadge status={project.status} />}
        </td>
        <td className="px-2 py-2.5 text-xs text-fg/60 text-right">{ts(project.rollup_activity_at || project.updated_at) || "—"}</td>
        <LastActivityCell node={project} maxWidthClass="max-w-[180px]" quiet />
        <td className="px-2 py-2.5 w-8 text-right relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="opacity-45 group-hover:opacity-100 text-muted hover:text-fg px-1 py-0.5 rounded transition-all"
            title="Действия с проектом"
            aria-label="Действия с проектом"
          >···</button>
          {menuOpen && <ContextMenu items={menuItems} onClose={() => setMenuOpen(false)} />}
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

function InlineEmptyRow({ depth = 0, colSpan = 8 }) {
  const leftPadding = 8 + depth * 18;
  return (
    <tr>
      <td className="px-2 py-2.5 text-xs text-muted">
        <div style={{ paddingLeft: `${leftPadding}px` }} className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-6 w-6 shrink-0 rounded-md border border-transparent" aria-hidden />
          <span className="h-4 w-4 shrink-0" />
          <span className="truncate">В папке нет вложенных папок или проектов</span>
        </div>
      </td>
      <td colSpan={colSpan} className="px-2 py-2.5" />
    </tr>
  );
}

function InlineErrorRow({ depth = 0, message = "", colSpan = 8 }) {
  const leftPadding = 8 + depth * 18;
  const text = String(message || "").trim() || "Не удалось загрузить вложенные элементы.";
  return (
    <tr>
      <td className="px-2 py-2.5 text-xs text-danger/90">
        <div style={{ paddingLeft: `${leftPadding}px` }} className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-6 w-6 shrink-0 rounded-md border border-danger/30 bg-danger/5" aria-hidden />
          <span className="h-4 w-4 shrink-0" />
          <span className="truncate">{text}</span>
        </div>
      </td>
      <td colSpan={colSpan} className="px-2 py-2.5" />
    </tr>
  );
}

// ─── Explorer Pane (folder contents) ─────────────────────────────────────────

function ExplorerPane({
  activeOrgId,
  workspaceId,
  folderId,
  onNavigateToFolder,
  onNavigateToProject,
  onNavigateToBreadcrumb,
  onOpenSession,
  permissions,
}) {
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  const inFlightFolderLoadsRef = useRef(new Set());
  const contextKey = `${String(workspaceId || "").trim()}::${String(folderId || "").trim()}`;

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
    setLoading(true);
    setError("");
    try {
      const resp = await apiGetExplorerPage(workspaceId, folderId || "");
      if (!resp?.ok) throw new Error(resp?.error || "Ошибка загрузки");
      setPage(resp?.data || resp);
    } catch (e) {
      setError(String(e?.message || "Ошибка загрузки"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, folderId, setTreeStateForContext]);

  useEffect(() => { load(); }, [load]);

  const rootItems = useMemo(() => (Array.isArray(page?.items) ? page.items : []), [page]);
  const isEmpty = !loading && !error && rootItems.length === 0;
  const treeColumnProfile = EXPLORER_COLUMN_PROFILES.tree;
  const inlineColSpan = treeColumnProfile.showSignalColumns ? 11 : 9;
  const folderCopy = useMemo(() => folderCreateCopy(folderId || ""), [folderId]);
  const folderCountHeader = folderId ? "Папки / Сессии" : "Разделы / Сессии";
  const contextHeaderTitle = folderId
    ? "Для папок: количество проектов"
    : "Для разделов: количество проектов";

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
      expandedByFolder: treeState.expandedByFolder,
      childItemsByFolder: sortedChildItemsByFolder,
      loadingByFolder: treeState.loadingByFolder,
      loadErrorByFolder: treeState.loadErrorByFolder,
      preserveItemOrder: Boolean(explorerSort),
    }),
    [sortedRootItems, treeState.expandedByFolder, sortedChildItemsByFolder, treeState.loadingByFolder, treeState.loadErrorByFolder, explorerSort]
  );
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
    if (assigneeMembersState.orgId === oid && (assigneeMembersState.loaded || assigneeMembersState.loading)) return;
    let disposed = false;
    setAssigneeMembersState({ orgId: oid, items: [], loading: true, loaded: false, error: "" });
    Promise.race([
      apiListOrgMembers(oid),
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
  }, [activeOrgId, assigneeDialog, assigneeMembersState.loaded, assigneeMembersState.loading, assigneeMembersState.orgId]);

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
    setError("");
    setMoveNotice("");
    try {
      const resp = await apiUpdateFolder(workspaceId, folderIdToUpdate, { context_status: normalizedStatus });
      if (!resp?.ok) throw new Error(resp?.error || "Не удалось обновить статус");
      await load({ resetInlineChildren: true });
      setMoveNotice("Статус обновлён.");
      return true;
    } catch (e) {
      setError(String(e?.message || e || "Не удалось обновить статус"));
      return false;
    }
  }, [load, workspaceId]);

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
      setError(message);
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
    const nextExpanded = !Boolean(treeState.expandedByFolder?.[fid]);
    setTreeStateForContext((prev) => ({
      ...prev,
      expandedByFolder: { ...prev.expandedByFolder, [fid]: nextExpanded },
    }));
    if (nextExpanded) {
      void ensureFolderChildrenLoaded(fid);
    }
  }, [treeState.expandedByFolder, setTreeStateForContext, ensureFolderChildrenLoaded]);

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
      void onOpenSession?.({
        ...target.session,
        project_id: target.projectId || target.session.project_id,
        workspace_id: workspaceId,
      });
    }
  }, [onNavigateToFolder, onNavigateToProject, onOpenSession, page?.breadcrumbs, workspaceId]);

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

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-border flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
        <Breadcrumb
          crumbs={page?.breadcrumbs || []}
          onNavigate={(crumb) => {
            if (crumb.type === "workspace") onNavigateToBreadcrumb(workspaceId, "");
            else onNavigateToBreadcrumb(workspaceId, crumb.id);
          }}
        />
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <ExplorerSearchBox
            id="workspace-explorer-tree-search"
            value={searchQuery}
            onChange={setSearchQuery}
            className="w-[260px]"
          />
          {permissions?.canCreate ? (
            <button
              onClick={() => setCreatingFolder(true)}
              className="secondaryBtn h-7 px-2.5 text-xs flex items-center gap-1"
            >
              <IcoPlus className="opacity-70" /> {folderCopy.createLabel}
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

      {error && (
        <div className="px-4 py-3 text-sm text-danger bg-danger/5 border-b border-border">{error}</div>
      )}
      {moveNotice ? (
        <div className="px-4 py-2 text-sm text-accent bg-accentSoft/40 border-b border-border">{moveNotice}</div>
      ) : null}

      {visibleSearchModel.active ? (
        <ExplorerSearchResults model={visibleSearchModel} onOpenResult={handleOpenSearchResult} />
      ) : !isEmpty ? (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full table-fixed text-left border-collapse">
            <colgroup>
              <col />
              <col className="w-[88px]" />
              <col className="w-[108px]" />
              <col className="w-[112px]" />
              <col className="w-[136px]" />
              <col className="w-[92px]" />
              {treeColumnProfile.showSignalColumns ? <col className="w-[36px]" /> : null}
              {treeColumnProfile.showSignalColumns ? <col className="w-[36px]" /> : null}
              <col className="w-[88px]" />
              <col className="w-[96px]" />
              <col className="w-[180px]" />
              <col className="w-8" />
            </colgroup>
            <thead>
              <tr className="border-b border-border/80 bg-panelAlt/25 text-[11px] uppercase tracking-wide text-fg/65">
                <th className="px-2 py-2" aria-sort={explorerSort?.key === "name" ? (explorerSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Название" sortKey="name" sort={explorerSort} onSort={handleExplorerSort} />
                </th>
                <th className="px-2 py-2" aria-sort={explorerSort?.key === "type" ? (explorerSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Тип" sortKey="type" sort={explorerSort} onSort={handleExplorerSort} />
                </th>
                <th className="px-2 py-2 text-center">{folderCountHeader}</th>
                <th className="px-2 py-2" title={contextHeaderTitle}>
                  Контекст
                </th>
                <th className="px-2 py-2" aria-sort={explorerSort?.key === "assignee" ? (explorerSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Ответственный / Исполнитель" sortKey="assignee" sort={explorerSort} onSort={handleExplorerSort} title="Сортирует разделы и папки по ответственному, проекты — по исполнителю." />
                </th>
                <th className="px-2 py-2">DoD</th>
                {treeColumnProfile.showSignalColumns ? <th className="px-2 py-2 text-center">⚠</th> : null}
                {treeColumnProfile.showSignalColumns ? <th className="px-2 py-2 text-center">📋</th> : null}
                <th className="px-2 py-2" aria-sort={explorerSort?.key === "status" ? (explorerSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Статус" sortKey="status" sort={explorerSort} onSort={handleExplorerSort} />
                </th>
                <th className="px-2 py-2 text-right" aria-sort={explorerSort?.key === "updatedAt" ? (explorerSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Обновлён" sortKey="updatedAt" sort={explorerSort} onSort={handleExplorerSort} align="right" />
                </th>
                <th className="px-2 py-2">Последнее изменение</th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
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
                    />
                  );
                }
                const project = row.node;
                return (
                  <ProjectRow
                    key={`project-${project.id}`}
                    project={project}
                    depth={row.depth}
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
          users={assigneeMembersState.items}
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
  canRename = false,
  canDelete = false,
  canChangeStatus = false,
  showSignalColumns = true,
  showDiscussionColumn = false,
  notesAggregate = null,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(String(session.status || "draft"));
  const sessionStatusMeta = getManualSessionStatusMeta(pendingStatus);
  useEffect(() => {
    setPendingStatus(String(session.status || "draft"));
  }, [session.status]);

  function handleRowOpen(event) {
    if (isOpening) return;
    const target = event?.target;
    if (target instanceof Element && target.closest("a[href],button,select,input,textarea,label,[data-stop-row-open='1']")) {
      return;
    }
    if (!shouldHandleClientNavigation(event)) return;
    onOpen(session);
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
        className={`group transition-colors cursor-pointer ${isOpening ? "bg-accentSoft/20" : "hover:bg-accentSoft/30"}`}
        onClick={handleRowOpen}
        aria-busy={isOpening ? "true" : undefined}
      >
        <td className="px-3 py-2.5 w-5"><IcoSession className="text-muted" /></td>
        <td className="px-2 py-2.5 text-sm font-medium text-fg">
          <div className="min-w-0">
            <AppRouteLink
              className={`block min-w-0 truncate ${isOpening ? "cursor-progress text-muted" : "hover:underline"}`}
              href={sessionHref}
              onNavigate={() => onOpen(session)}
              title={session.name}
              aria-busy={isOpening ? "true" : undefined}
            >
              {session.name}
            </AppRouteLink>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-normal text-accent/75">
                <span>{isOpening ? "Открываем сессию" : "Открыть сессию"}</span>
                <IcoChevron right className="text-[10px]" />
              </span>
            </div>
          </div>
        </td>
        <td className="px-2 py-2.5">
          {canChangeStatus ? (
            <select
              className={`h-8 min-h-0 w-[138px] rounded-full border px-3 text-xs font-medium outline-none transition-colors ${sessionStatusMeta.selectClass}`}
              value={String(session.status || "draft")}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onFocus={(e) => e.stopPropagation()}
              onChange={async (e) => {
                e.stopPropagation();
                const next = String(e.target.value || "").trim();
                if (!next || next === String(session.status || "draft")) return;
                setPendingStatus(next);

                const sessionSnapshot = await apiGetSession(session.id);
                const baseVersion = Number(sessionSnapshot?.session?.diagram_state_version);
                if (!sessionSnapshot?.ok || !Number.isFinite(baseVersion) || baseVersion < 0) {
                  setPendingStatus(String(session.status || "draft"));
                  window.alert(formatSessionPatchError(sessionSnapshot, "Не удалось получить актуальную версию сессии"));
                  return;
                }

                const resp = await apiPatchSession(session.id, {
                  status: next,
                  base_diagram_state_version: baseVersion,
                });
                if (!resp?.ok) {
                  setPendingStatus(String(session.status || "draft"));
                  window.alert(formatSessionPatchError(resp));
                  return;
                }
                onSessionPatched?.(session.id, {
                  status: String(resp?.session?.interview?.status || next),
                  updated_at: Number(resp?.session?.updated_at || Math.floor(Date.now() / 1000)),
                });
                onReload?.();
              }}
            >
              {MANUAL_SESSION_STATUSES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          ) : (
            <StatusBadge status={session.status} />
          )}
        </td>
        <td className="px-2 py-2.5 text-[11px] text-fg/65">{session.stage || "—"}</td>
        <td className="px-2 py-2.5">
          {session.owner
            ? <span className="text-[11px] text-fg/65 truncate block max-w-[88px]" title={session.owner.name || session.owner.id}>{session.owner.name || session.owner.id}</span>
            : <span className="text-[11px] text-muted/65">—</span>}
        </td>
        <td className="px-2 py-2.5"><DodBar percent={session.dod_percent} /></td>
        {showDiscussionColumn ? (
          <td className="px-2 py-2.5 text-center" title="Открытые обсуждения">
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
          <td className="px-2 py-2.5 text-center" title={rowAttentionLabel}>
            <MetricCell label={rowAttentionLabel} value={rowAttentionCount} warn icon="⚠" emptyLabel="—" />
          </td>
        ) : null}
        {showSignalColumns ? (
          <td className="px-2 py-2.5 text-center" title="Отчёты">
            <MetricCell value={session.reports_count} />
          </td>
        ) : null}
        <td className="px-2 py-2.5 text-[11px] text-fg/65 text-right">{ts(session.updated_at)}</td>
        <td className="px-2 py-2.5 text-right">
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <AppRouteLink
              className={`secondaryBtn h-7 min-h-0 px-3 text-xs whitespace-nowrap transition-colors ${isOpening ? "cursor-progress" : "hover:border-accent/40 hover:text-fg"}`}
              href={sessionHref}
              onNavigate={() => onOpen(session)}
              aria-busy={isOpening ? "true" : undefined}
            >
              {isOpening ? (
                <span className="inline-flex items-center gap-1.5">
                  <IcoSpinner className="animate-spin" />
                  Открывается...
                </span>
              ) : (
                "Открыть"
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

// ─── Project Pane (sessions list) ─────────────────────────────────────────────

function ProjectPane({ workspaceId, projectId, onBack, onOpenSession, breadcrumbBase, permissions }) {
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [openingSessionId, setOpeningSessionId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionSort, setSessionSort] = useState(null);
  const openingSessionIdRef = useRef("");

  const load = useCallback(async () => {
    if (!workspaceId || !projectId) return;
    setLoading(true);
    setError("");
    try {
      const resp = await apiGetProjectPage(workspaceId, projectId);
      if (!resp?.ok) throw new Error(resp?.error || "Ошибка загрузки");
      setPage(resp?.data || resp);
    } catch (e) {
      setError(String(e?.message || "Ошибка загрузки"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    openingSessionIdRef.current = "";
    setOpeningSessionId("");
  }, [projectId]);

  const handleSessionPatched = useCallback((sessionId, patch = {}) => {
    const sid = String(sessionId || "").trim();
    if (!sid) return;
    setPage((prev) => {
      if (!prev || !Array.isArray(prev.sessions)) return prev;
      return {
        ...prev,
        sessions: prev.sessions.map((row) => {
          if (String(row?.id || "") !== sid) return row;
          return {
            ...row,
            ...(Object.prototype.hasOwnProperty.call(patch, "status") ? { status: patch.status } : {}),
            ...(Object.prototype.hasOwnProperty.call(patch, "name") ? { name: patch.name } : {}),
            ...(Object.prototype.hasOwnProperty.call(patch, "updated_at") ? { updated_at: patch.updated_at } : {}),
          };
        }),
      };
    });
  }, []);

  const proj = page?.project;
  const sessions = page?.sessions || [];
  const sortedSessions = useMemo(
    () => sortProjectSessions(sessions, sessionSort),
    [sessions, sessionSort],
  );
  const handleSessionSort = useCallback((key) => {
    setSessionSort((prev) => toggleExplorerSort(prev, key));
  }, []);
  const sessionAggregateIds = useMemo(
    () => sessions.map((item) => item?.id || item?.session_id).filter(Boolean),
    [sessions],
  );
  const noteAggregatesBySessionId = useSessionNoteAggregates(sessionAggregateIds);
  const isEmpty = !loading && !error && sessions.length === 0;
  const sessionColumnProfile = EXPLORER_COLUMN_PROFILES.sessions;
  const handleOpenSessionRequest = useCallback(async (sessionLike) => {
    const row = sessionLike && typeof sessionLike === "object" ? sessionLike : {};
    const sid = String(row?.id || row?.session_id || "").trim();
    if (!sid) return;
    if (openingSessionIdRef.current) return;
    openingSessionIdRef.current = sid;
    setOpeningSessionId(sid);
    try {
      await onOpenSession?.(sessionLike);
    } finally {
      if (openingSessionIdRef.current === sid) {
        openingSessionIdRef.current = "";
        setOpeningSessionId((prev) => (prev === sid ? "" : prev));
      }
    }
  }, [onOpenSession]);

  const backCrumbs = normalizeProjectBreadcrumbBase(breadcrumbBase);
  const projectBreadcrumbTrail = buildProjectBreadcrumbTrail(backCrumbs, proj?.name || "");
  const parentCrumb = backCrumbs.length ? backCrumbs[backCrumbs.length - 1] : null;
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

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-border flex-shrink-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {parentCrumb ? (
            <button
              type="button"
              onClick={() => onBack(parentCrumb)}
              className="secondaryBtn h-8 min-h-0 px-3 text-xs font-medium"
            >
              ← Назад к разделу
            </button>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/70">Навигация</span>
            {projectBreadcrumbTrail.map((c, i) => (
              <React.Fragment key={`${c.type}-${c.id}`}>
                {i > 0 && <IcoChevron right className="shrink-0 text-muted/35" />}
                {c.active ? (
                  <BreadcrumbChip active>{c.name}</BreadcrumbChip>
                ) : (
                  <BreadcrumbChip onClick={() => onBack(c)}>{c.name}</BreadcrumbChip>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {proj && (
          <div className="mt-2 text-xs text-muted">
            Сессии: {sessionCount}
          </div>
        )}
      </div>

      {/* Sessions */}
      <div className="px-4 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Сессии</span>
        <ExplorerSearchBox
          id="workspace-explorer-project-search"
          value={searchQuery}
          onChange={setSearchQuery}
          className="ml-auto w-[260px]"
        />
        {permissions?.canCreate ? (
          <button onClick={() => setCreating(true)} className="primaryBtn h-7 px-3 text-xs flex items-center gap-1">
            <IcoPlus /> Новая сессия
          </button>
        ) : null}
      </div>

      {searchModel.active ? (
        <ExplorerSearchResults model={searchModel} onOpenResult={handleOpenSearchResult} />
      ) : isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <IcoSession className="w-10 h-10 text-muted/30" />
          <div className="text-center">
            <p className="text-base font-medium text-fg mb-1">Нет сессий</p>
            <p className="text-sm text-muted">Создайте первую сессию для этого проекта</p>
          </div>
          {permissions?.canCreate ? (
            <button onClick={() => setCreating(true)} className="primaryBtn h-8 px-4 text-sm flex items-center gap-1">
              <IcoPlus /> Создать сессию
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
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
              <col className="w-[124px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border/80 bg-panelAlt/25 text-[11px] uppercase tracking-wide text-fg/65">
                <th className="px-3 py-2 w-5" />
                <th className="px-2 py-2" aria-sort={sessionSort?.key === "name" ? (sessionSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Название" sortKey="name" sort={sessionSort} onSort={handleSessionSort} />
                </th>
                <th className="px-2 py-2" aria-sort={sessionSort?.key === "status" ? (sessionSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Статус" sortKey="status" sort={sessionSort} onSort={handleSessionSort} />
                </th>
                <th className="px-2 py-2" aria-sort={sessionSort?.key === "stage" ? (sessionSort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Стадия" sortKey="stage" sort={sessionSort} onSort={handleSessionSort} />
                </th>
                <th className="px-2 py-2" aria-sort={sessionSort?.key === "owner" ? (sessionSort.direction === "asc" ? "ascending" : "descending") : "none"}>
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
              {sortedSessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  notesAggregate={noteAggregatesBySessionId.get(String(s?.id || s?.session_id || "").trim()) || null}
                  isOpening={openingSessionId === String(s.id || s.session_id || "").trim()}
                  onOpen={(sess) => handleOpenSessionRequest({
                    ...sess,
                    project_id: projectId,
                    workspace_id: workspaceId,
                  })}
                  onReload={load}
                  onSessionPatched={handleSessionPatched}
                  canRename={!!permissions?.canRenameSession}
                  canDelete={!!permissions?.canDeleteSession}
                  canChangeStatus={!!permissions?.canChangeStatus}
                  showSignalColumns={sessionColumnProfile.showSignalColumns}
                  showDiscussionColumn={sessionColumnProfile.showDiscussionColumn}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && permissions?.canCreate ? (
        <InputModal
          title="Новая сессия"
          placeholder="Название сессии"
          onClose={() => setCreating(false)}
          onSubmit={async (name) => {
            const resp = await apiCreateSession(workspaceId, projectId, { name });
            if (!resp?.ok) throw new Error(resp?.error || "Не удалось создать сессию");
            load();
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
  onClearRequestedProject,
}) {
  const { user, orgs } = useAuth();
  const {
    currentOrgName,
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
    <div className="h-full flex flex-row min-h-0 bg-bg font-sans">
      {/* Left sidebar — Workspaces */}
      <div className="w-48 shrink-0">
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

      {/* Right pane — Explorer + Project (both mounted; only one visible at a time).
           ExplorerPane is kept in DOM so its loaded state survives project round-trips.
           This eliminates the refetch that used to happen when navigating back. */}
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
                workspaceId={activeWorkspaceId}
                folderId={currentFolderId}
                onNavigateToFolder={handleNavigateToFolder}
                onNavigateToProject={handleNavigateToProject}
                onNavigateToBreadcrumb={handleNavigateToBreadcrumb}
                onOpenSession={onOpenSession}
                permissions={permissions}
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
                  breadcrumbBase={breadcrumbBase}
                  permissions={permissions}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
