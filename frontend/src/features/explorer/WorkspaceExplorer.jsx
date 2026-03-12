/**
 * WorkspaceExplorer — Finder-like navigator for Workspaces → Folders → Projects → Sessions.
 *
 * Layout:
 *   [ WorkspaceSidebar ] | [ ExplorerPane / ProjectPane ]
 *
 * Rules (enforced in UI):
 *   • Folder shows only: name, child_folder_count, child_project_count (no DoD/Owner/Attention)
 *   • Project shows: name, sessions_count, owner, dod_percent, attention_count, reports_count, status
 *   • Session shows: name, stage, owner, dod_percent, attention_count, reports_count, status
 *   • Session cannot be in folder directly — always inside project
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  apiListWorkspaces,
  apiCreateWorkspace,
  apiRenameWorkspace,
  apiFindProjectWorkspace,
  apiGetExplorerPage,
  apiCreateFolder,
  apiRenameFolder,
  apiDeleteFolder,
  apiCreateProject,
  apiGetProjectPage,
  apiCreateSession,
  apiMoveFolder,
} from "./explorerApi.js";
import { apiDeleteProject, apiDeleteSession, apiPatchProject, apiPatchSession } from "../../lib/api";
import {
  buildWorkspacePermissions,
  MANUAL_SESSION_STATUSES,
  getManualSessionStatusMeta,
} from "../workspace/workspacePermissions";
import { useAuth } from "../auth/AuthProvider.jsx";
import {
  canRestoreRequestedProject,
  normalizeRequestedProjectWorkspace,
  resolveExplorerWorkspaceId,
} from "./workspaceRestore.js";

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
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const cls = pct >= 80 ? "bg-success" : pct >= 40 ? "bg-accent" : "bg-warning";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <span className="inline-block w-14 h-1.5 rounded-full bg-border overflow-hidden">
        <span className={`block h-full rounded-full ${cls}`} style={{ width: `${pct}%` }} />
      </span>
      <span>{pct}%</span>
    </span>
  );
}

function MetricCell({ label, value, warn = false }) {
  if (!value) return <span className="text-muted text-xs">—</span>;
  return (
    <span className={`text-xs font-medium ${warn && value > 0 ? "text-warning" : "text-muted"}`}>
      {value}
    </span>
  );
}

function SummaryPill({ label, value, tone = "default" }) {
  const toneClass = {
    default: "border-border bg-panelAlt/60 text-fg",
    muted: "border-border bg-bg text-muted",
    success: "border-emerald-300 bg-emerald-50 text-emerald-700",
    warning: "border-amber-300 bg-amber-50 text-amber-700",
  }[tone] || "border-border bg-panelAlt/60 text-fg";
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${toneClass}`}>
      <span className="uppercase tracking-[0.14em] text-[10px] opacity-60">{label}</span>
      <span className="font-medium whitespace-nowrap">{value}</span>
    </div>
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

function FolderRow({ folder, onClick, workspaceId, onReload, canEdit = false, canDelete = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const menuItems = [
    { label: "Открыть", icon: <IcoChevron right />, action: () => onClick(folder) },
    ...(canEdit ? [{ label: "Переименовать", icon: <IcoEdit />, action: () => setRenaming(true) }] : []),
    ...(canDelete ? [{ separator: true }, { label: "Удалить", icon: <IcoTrash />, danger: true, action: () => setDeleting(true) }] : []),
  ];

  return (
    <>
      <tr
        className="group hover:bg-accentSoft/30 transition-colors cursor-pointer"
        onClick={() => onClick(folder)}
      >
        <td className="px-3 py-2.5 w-5">
          <IcoFolder className="text-accent/80" />
        </td>
        <td className="px-2 py-2.5 text-sm font-medium text-fg">{folder.name}</td>
        <td className="px-2 py-2.5 text-xs text-muted">Папка</td>
        <td className="px-2 py-2.5 text-xs text-muted text-center">
          {folder.child_folder_count ?? 0}
        </td>
        <td className="px-2 py-2.5 text-xs text-muted text-center">
          {folder.child_project_count ?? 0}
        </td>
        <td className="px-2 py-2.5 text-xs text-muted">—</td>
        <td className="px-2 py-2.5 text-xs text-muted text-center">—</td>
        <td className="px-2 py-2.5 text-xs text-muted text-center">—</td>
        <td className="px-2 py-2.5 text-xs text-muted">—</td>
        <td className="px-2 py-2.5 text-xs text-muted text-right">{ts(folder.updated_at)}</td>
        <td className="px-2 py-2.5 w-8 text-right relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="opacity-0 group-hover:opacity-100 text-muted hover:text-fg px-1 py-0.5 rounded transition-all"
          >
            ···
          </button>
          {menuOpen && <ContextMenu items={menuItems} onClose={() => setMenuOpen(false)} />}
        </td>
      </tr>
      {renaming && canEdit && (
        <InputModal
          title="Переименовать папку"
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
          title="Удалить папку"
          message={`Удалить папку «${folder.name}»? Если папка непустая, нужно подтвердить удаление с каскадом.`}
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

function ProjectRow({ project, onClick, onReload, canRename = false, canDelete = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuItems = [
    { label: "Открыть", icon: <IcoChevron right />, action: () => onClick(project) },
    ...(canRename ? [{ label: "Переименовать", icon: <IcoEdit />, action: () => setRenaming(true) }] : []),
    ...(canDelete ? [{ separator: true }, { label: "Удалить", icon: <IcoTrash />, danger: true, action: () => setDeleting(true) }] : []),
  ];
  return (
    <>
      <tr className="group hover:bg-accentSoft/30 transition-colors cursor-pointer" onClick={() => onClick(project)}>
        <td className="px-3 py-2.5 w-5"><IcoProject className="text-accent" /></td>
        <td className="px-2 py-2.5 text-sm font-medium text-fg">{project.name}</td>
        <td className="px-2 py-2.5 text-xs text-muted">Проект</td>
        <td className="px-2 py-2.5 text-center">
          <span className="text-xs text-muted">{project.sessions_count ?? 0} сессий</span>
        </td>
        <td className="px-2 py-2.5">
          {project.owner
            ? <span className="text-xs text-muted truncate block max-w-[100px]">{project.owner.name || project.owner.id}</span>
            : <span className="text-xs text-muted">—</span>}
        </td>
        <td className="px-2 py-2.5"><DodBar percent={project.dod_percent} /></td>
        <td className="px-2 py-2.5 text-center"><MetricCell value={project.attention_count} warn /></td>
        <td className="px-2 py-2.5 text-center"><MetricCell value={project.reports_count} /></td>
        <td className="px-2 py-2.5"><StatusBadge status={project.status} /></td>
        <td className="px-2 py-2.5 text-xs text-muted text-right">{ts(project.updated_at)}</td>
        <td className="px-2 py-2.5 w-8 text-right relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="opacity-0 group-hover:opacity-100 text-muted hover:text-fg px-1 py-0.5 rounded transition-all"
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

// ─── Explorer Pane (folder contents) ─────────────────────────────────────────

function ExplorerPane({
  workspaceId,
  folderId,
  onNavigateToFolder,
  onNavigateToProject,
  onNavigateToBreadcrumb,
  permissions,
}) {
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
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
  }, [workspaceId, folderId]);

  useEffect(() => { load(); }, [load]);

  const folders = (page?.items || []).filter((i) => i.type === "folder");
  const projects = (page?.items || []).filter((i) => i.type === "project");
  const isEmpty = !loading && !error && folders.length === 0 && projects.length === 0;

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
      <div className="px-4 pt-3 pb-2 border-b border-border flex items-center justify-between gap-3 flex-shrink-0">
        <Breadcrumb
          crumbs={page?.breadcrumbs || []}
          onNavigate={(crumb) => {
            if (crumb.type === "workspace") onNavigateToBreadcrumb(workspaceId, "");
            else onNavigateToBreadcrumb(workspaceId, crumb.id);
          }}
        />
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {permissions?.canCreate ? (
            <button
              onClick={() => setCreatingFolder(true)}
              className="secondaryBtn h-7 px-2.5 text-xs flex items-center gap-1"
            >
              <IcoPlus className="opacity-70" /> Папка
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

      {/* Table */}
      {!isEmpty ? (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted border-b border-border">
                <th className="px-3 py-2 w-5" />
                <th className="px-2 py-2">Название</th>
                <th className="px-2 py-2">Тип</th>
                <th className="px-2 py-2 text-center">Папки / Сессии</th>
                <th className="px-2 py-2">Owner / Проекты</th>
                <th className="px-2 py-2">DoD</th>
                <th className="px-2 py-2 text-center">⚠</th>
                <th className="px-2 py-2 text-center">📋</th>
                <th className="px-2 py-2">Статус</th>
                <th className="px-2 py-2 text-right">Обновлён</th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {folders.map((f) => (
                <FolderRow
                  key={f.id}
                  folder={f}
                  workspaceId={workspaceId}
                  onClick={() => onNavigateToFolder(f.id)}
                  onReload={load}
                  canEdit={!!permissions?.canRenameFolder}
                  canDelete={!!permissions?.canDeleteFolder}
                />
              ))}
              {projects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  onClick={() => onNavigateToProject(p.id)}
                  onReload={load}
                  canRename={!!permissions?.canRenameProject}
                  canDelete={!!permissions?.canDeleteProject}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <IcoFolder className="w-12 h-12 text-muted/30" />
          <div className="text-center">
            <p className="text-base font-medium text-fg mb-1">
              {folderId ? "Папка пустая" : "Workspace пустой"}
            </p>
            <p className="text-sm text-muted">
              {folderId
                ? "Создайте вложенную папку или добавьте проект сюда"
                : "Создайте папку — проекты хранятся внутри папок"}
            </p>
          </div>
          <div className="flex gap-2">
            {permissions?.canCreate ? (
              <button
                onClick={() => setCreatingFolder(true)}
                className="secondaryBtn h-8 px-4 text-sm flex items-center gap-1"
              >
                <IcoPlus className="opacity-70" /> Создать папку
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
          title="Новая папка"
          placeholder="Название папки"
          onClose={() => setCreatingFolder(false)}
          onSubmit={async (name) => {
            const resp = await apiCreateFolder(workspaceId, { name, parent_id: folderId || "" });
            if (!resp?.ok) throw new Error(resp?.error || "Не удалось создать папку");
            load();
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
            load();
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Session Row ──────────────────────────────────────────────────────────────

function SessionRow({
  session,
  onOpen,
  onReload,
  onSessionPatched,
  canRename = false,
  canDelete = false,
  canChangeStatus = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(String(session.status || "draft"));
  const sessionStatusMeta = getManualSessionStatusMeta(pendingStatus);

  useEffect(() => {
    setPendingStatus(String(session.status || "draft"));
  }, [session.status]);

  function handleRowOpen(event) {
    const target = event?.target;
    if (target instanceof Element && target.closest("button,select,input,textarea,label,[data-stop-row-open='1']")) {
      return;
    }
    onOpen(session);
  }
  return (
    <>
      <tr className="group hover:bg-accentSoft/30 transition-colors cursor-pointer" onClick={handleRowOpen}>
        <td className="px-3 py-2.5 w-5"><IcoSession className="text-muted" /></td>
        <td className="px-2 py-2.5 text-sm font-medium text-fg">{session.name}</td>
        <td className="px-2 py-2.5">
          {canChangeStatus ? (
            <select
              className={`h-8 min-h-0 w-[150px] rounded-full border px-3 text-xs font-medium outline-none transition-colors ${sessionStatusMeta.selectClass}`}
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
                const resp = await apiPatchSession(session.id, { status: next });
                if (!resp?.ok) {
                  setPendingStatus(String(session.status || "draft"));
                  window.alert(String(resp?.error || "Не удалось сменить статус"));
                  return;
                }
                onSessionPatched?.(session.id, { status: next, updated_at: Math.floor(Date.now() / 1000) });
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
        <td className="px-2 py-2.5 text-xs text-muted">{session.stage || "—"}</td>
        <td className="px-2 py-2.5">
          {session.owner
            ? <span className="text-xs text-muted truncate block max-w-[100px]">{session.owner.name || session.owner.id}</span>
            : <span className="text-xs text-muted">—</span>}
        </td>
        <td className="px-2 py-2.5"><DodBar percent={session.dod_percent} /></td>
        <td className="px-2 py-2.5 text-center"><MetricCell value={session.attention_count} warn /></td>
        <td className="px-2 py-2.5 text-center"><MetricCell value={session.reports_count} /></td>
        <td className="px-2 py-2.5 text-xs text-muted text-right">{ts(session.updated_at)}</td>
        <td className="px-2 py-2.5 text-right">
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onOpen(session)}
              className="primaryBtn h-7 px-3 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Открыть →
            </button>
            {(canRename || canDelete) ? (
              <div className="relative">
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 text-muted hover:text-fg px-1 py-0.5 rounded transition-all"
                  onClick={() => setMenuOpen((v) => !v)}
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
  const isEmpty = !loading && !error && sessions.length === 0;

  const backCrumbs = breadcrumbBase || [];

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
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm text-muted mb-2">
          {backCrumbs.map((c, i) => (
            <React.Fragment key={`${c.type}-${c.id}`}>
              {i > 0 && <IcoChevron right className="text-muted/50 shrink-0" />}
              <button onClick={() => onBack(c)} className="hover:text-fg hover:underline truncate max-w-[140px]">{c.name}</button>
            </React.Fragment>
          ))}
        </nav>

        {/* Project info strip */}
        {proj && (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-semibold text-fg truncate">{proj.name}</h1>
                <StatusBadge status={proj.status} />
              </div>
              {proj.description ? (
                <p className="mt-1 text-sm text-muted truncate max-w-[420px]">{proj.description}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {proj.owner ? (
                <SummaryPill label="Owner" value={proj.owner.name || proj.owner.id} tone="muted" />
              ) : null}
              <SummaryPill label="DoD" value={<DodBar percent={proj.dod_percent} />} />
              <SummaryPill label="Сессии" value={String(proj.sessions_count || sessions.length || 0)} tone="muted" />
              <SummaryPill
                label="Активность"
                value={ts(proj.updated_at)}
                tone={proj.attention_count > 0 ? "warning" : "default"}
              />
            </div>
          </div>
        )}
      </div>

      {/* Sessions */}
      <div className="px-4 py-2 border-b border-border flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Сессии</span>
        {permissions?.canCreate ? (
          <button onClick={() => setCreating(true)} className="primaryBtn h-7 px-3 text-xs flex items-center gap-1">
            <IcoPlus /> Новая сессия
          </button>
        ) : null}
      </div>

      {isEmpty ? (
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
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted border-b border-border">
                <th className="px-3 py-2 w-5" />
                <th className="px-2 py-2">Название</th>
                <th className="px-2 py-2">Статус</th>
                <th className="px-2 py-2">Стадия</th>
                <th className="px-2 py-2">Owner</th>
                <th className="px-2 py-2">DoD</th>
                <th className="px-2 py-2 text-center">⚠</th>
                <th className="px-2 py-2 text-center">📋</th>
                <th className="px-2 py-2 text-right">Обновлена</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  onOpen={(sess) => onOpenSession({
                    ...sess,
                    project_id: projectId,
                    workspace_id: workspaceId,
                  })}
                  onReload={load}
                  onSessionPatched={handleSessionPatched}
                  canRename={!!permissions?.canRenameSession}
                  canDelete={!!permissions?.canDeleteSession}
                  canChangeStatus={!!permissions?.canChangeStatus}
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
  const [workspaces, setWorkspaces] = useState([]);
  const [wsLoading, setWsLoading] = useState(true);
  const [wsError, setWsError] = useState("");

  // Navigation state
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState("");
  const [currentProjectId, setCurrentProjectId] = useState(null); // null = explorer view, string = project view
  const [breadcrumbBase, setBreadcrumbBase] = useState([]);
  const [resolvedRequestWorkspaceId, setResolvedRequestWorkspaceId] = useState("");
  const [projectRestoreStatus, setProjectRestoreStatus] = useState("idle");
  const [ignoredRequestProjectId, setIgnoredRequestProjectId] = useState("");
  const resolvedWorkspaceCacheRef = useRef(new Map());
  const previousRequestProjectIdRef = useRef("");
  const currentOrg = (Array.isArray(orgs) ? orgs : []).find((item) => String(item?.org_id || item?.id || "") === String(activeOrgId || "")) || null;
  const currentOrgName = String(currentOrg?.name || currentOrg?.org_name || activeOrgId || "").trim();
  const activeWorkspace = workspaces.find((item) => String(item?.id || "") === String(activeWorkspaceId || "")) || null;
  const permissions = buildWorkspacePermissions(activeWorkspace?.role || "", Boolean(user?.is_admin));

  // Load workspaces for the selected organization. Keep this fetch scoped to
  // org changes only; workspace selection changes should not refetch the full
  // workspace list and remount the explorer.
  useEffect(() => {
    let cancelled = false;
    setWsLoading(true);
    setWsError("");
    apiListWorkspaces()
      .then((resp) => {
        if (cancelled) return;
        if (!resp?.ok) { setWsError(resp?.error || "Ошибка загрузки"); return; }
        const raw = resp?.data;
        const list = Array.isArray(raw) ? raw : [];
        setWorkspaces(list);
        if (!list.length) {
          setActiveWorkspaceId("");
          setCurrentFolderId("");
          setCurrentProjectId(null);
          return;
        }
      })
      .catch((e) => { if (!cancelled) setWsError(String(e?.message || "Ошибка")); })
      .finally(() => { if (!cancelled) setWsLoading(false); });
    return () => { cancelled = true; };
  }, [activeOrgId]);

  useEffect(() => {
    if (wsLoading) return;
    if (!workspaces.length) return;
    const nextWorkspaceId = resolveExplorerWorkspaceId({
      workspaces,
      activeWorkspaceId,
      requestProjectWorkspaceId,
    });
    if (nextWorkspaceId && nextWorkspaceId !== String(activeWorkspaceId || "").trim()) {
      setActiveWorkspaceId(nextWorkspaceId);
      setCurrentFolderId("");
    }
  }, [workspaces, wsLoading, activeWorkspaceId, requestProjectWorkspaceId]);

  // When activeOrgId prop changes, sync
  useEffect(() => {
    setActiveWorkspaceId("");
    setCurrentFolderId("");
    setCurrentProjectId(null);
    setBreadcrumbBase([]);
    setResolvedRequestWorkspaceId("");
    setProjectRestoreStatus("idle");
    setIgnoredRequestProjectId("");
  }, [activeOrgId]);

  useEffect(() => {
    const pid = String(requestProjectId || "").trim();
    const ignored = String(ignoredRequestProjectId || "").trim();
    if (!pid) {
      setResolvedRequestWorkspaceId("");
      setProjectRestoreStatus("idle");
      return;
    }
    if (ignored && pid === ignored) {
      setResolvedRequestWorkspaceId("");
      setProjectRestoreStatus("idle");
      return;
    }
    if (wsLoading) {
      setProjectRestoreStatus("resolving");
      return;
    }
    if (!workspaces.length) {
      setResolvedRequestWorkspaceId("");
      setProjectRestoreStatus("idle");
      return;
    }

    const workspaceIds = workspaces.map((item) => String(item?.id || "").trim()).filter(Boolean);
    const explicitWorkspaceId = String(requestProjectWorkspaceId || "").trim();
    const cachedWorkspaceId = String(resolvedWorkspaceCacheRef.current.get(pid) || "").trim();
    const immediateWorkspaceId = [explicitWorkspaceId, cachedWorkspaceId]
      .find((candidate) => candidate && workspaceIds.includes(candidate)) || "";

    if (immediateWorkspaceId) {
      setResolvedRequestWorkspaceId(immediateWorkspaceId);
      setProjectRestoreStatus("ready");
      if (immediateWorkspaceId !== String(activeWorkspaceId || "").trim()) {
        setActiveWorkspaceId(immediateWorkspaceId);
        setCurrentFolderId("");
      }
      return;
    }

    let cancelled = false;
    setProjectRestoreStatus("resolving");
    void (async () => {
      const foundWorkspaceId = await apiFindProjectWorkspace(workspaceIds, pid);
      if (cancelled) return;
      const fallbackWorkspaceId = resolveExplorerWorkspaceId({
        workspaces,
        activeWorkspaceId,
        requestProjectWorkspaceId: "",
      });
      const nextWorkspaceId = String(foundWorkspaceId || fallbackWorkspaceId || "").trim();
      if (foundWorkspaceId) {
        resolvedWorkspaceCacheRef.current.set(pid, foundWorkspaceId);
      }
      setResolvedRequestWorkspaceId(nextWorkspaceId);
      setProjectRestoreStatus("ready");
      if (nextWorkspaceId && nextWorkspaceId !== String(activeWorkspaceId || "").trim()) {
        setActiveWorkspaceId(nextWorkspaceId);
        setCurrentFolderId("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestProjectId, requestProjectWorkspaceId, workspaces, wsLoading, activeWorkspaceId, ignoredRequestProjectId]);

  // Restore the requested project only after the explorer resolved the matching
  // workspace. This avoids calling the project explorer route with org_id in
  // place of workspace_id during reload bootstrap.
  useEffect(() => {
    const pid = String(requestProjectId || "").trim();
    const ignored = String(ignoredRequestProjectId || "").trim();
    if (!ignored) return;
    if (!pid || pid !== ignored) {
      setIgnoredRequestProjectId("");
    }
  }, [requestProjectId, ignoredRequestProjectId]);

  const dismissRequestedProjectRestore = useCallback((options = {}) => {
    const pid = String(requestProjectId || "").trim();
    if (!pid) return;
    setIgnoredRequestProjectId(pid);
    if (options?.clearExternal) {
      onClearRequestedProject?.();
    }
  }, [requestProjectId, onClearRequestedProject]);

  useEffect(() => {
    const pid = String(requestProjectId || "").trim();
    const prevPid = String(previousRequestProjectIdRef.current || "").trim();
    previousRequestProjectIdRef.current = pid;
    if (!pid) {
      if (prevPid && currentProjectId === prevPid) {
        setCurrentProjectId(null);
      }
      return;
    }
    if (projectRestoreStatus === "resolving") {
      return;
    }
    if (pid === String(ignoredRequestProjectId || "").trim()) {
      return;
    }
    const effectiveRequestedWorkspaceId = normalizeRequestedProjectWorkspace({
      requestProjectId: pid,
      requestProjectWorkspaceId,
      resolvedWorkspaceId: resolvedRequestWorkspaceId,
      activeWorkspaceId,
    });
    if (!canRestoreRequestedProject({
      requestProjectId: pid,
      requestProjectWorkspaceId: effectiveRequestedWorkspaceId,
      activeWorkspaceId,
    })) {
      return;
    }
    if (pid !== currentProjectId) {
      setCurrentProjectId(pid);
    }
  }, [requestProjectId, requestProjectWorkspaceId, resolvedRequestWorkspaceId, activeWorkspaceId, currentProjectId, projectRestoreStatus, ignoredRequestProjectId]);

  const handleSelectWorkspace = (wsId) => {
    dismissRequestedProjectRestore({ clearExternal: true });
    setActiveWorkspaceId(wsId);
    setCurrentFolderId("");
    setCurrentProjectId(null);
    setBreadcrumbBase([]);
  };

  const handleCreateWorkspace = async (name) => {
    const resp = await apiCreateWorkspace(name);
    if (!resp?.ok) throw new Error(resp?.error || "Не удалось создать");
    const created = resp?.data || {};
    const newWs = {
      id: created.id,
      org_id: created.org_id || activeOrgId || "",
      name: created.name || name,
      role: created.role || activeWorkspace?.role || "member",
      created_at: created.created_at || 0,
    };
    setWorkspaces((prev) => [...prev, newWs]);
    setActiveWorkspaceId(created.id);
    setCurrentFolderId("");
    setCurrentProjectId(null);
  };

  const handleNavigateToFolder = (folderId) => {
    dismissRequestedProjectRestore({ clearExternal: true });
    setCurrentFolderId(folderId);
    setCurrentProjectId(null);
  };

  const handleNavigateToProject = (projectId) => {
    setCurrentProjectId(projectId);
  };

  const handleNavigateToBreadcrumb = (wsId, folderId) => {
    dismissRequestedProjectRestore({ clearExternal: true });
    if (wsId !== activeWorkspaceId) {
      setActiveWorkspaceId(wsId);
    }
    setCurrentFolderId(folderId || "");
    setCurrentProjectId(null);
  };

  const handleBackFromProject = (crumb) => {
    dismissRequestedProjectRestore({ clearExternal: true });
    setCurrentProjectId(null);
    if (crumb.type === "workspace") {
      setCurrentFolderId("");
    } else {
      setCurrentFolderId(crumb.id);
    }
  };

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
          onWorkspaceRenamed={async () => {
            const resp = await apiListWorkspaces();
            if (!resp?.ok) {
              throw new Error(resp?.error || "Не удалось обновить список workspaces");
            }
            const raw = resp?.data;
            const list = Array.isArray(raw) ? raw : [];
            setWorkspaces(list);
          }}
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
                workspaceId={activeWorkspaceId}
                folderId={currentFolderId}
                onNavigateToFolder={handleNavigateToFolder}
                onNavigateToProject={handleNavigateToProject}
                onNavigateToBreadcrumb={handleNavigateToBreadcrumb}
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
