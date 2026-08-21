import { useCallback, useEffect, useMemo, useState } from "react";

import Modal from "../../shared/ui/Modal";
import OrgPropertyDictionaryPanel from "./OrgPropertyDictionaryPanel";
import {
  apiAssignOrgMember,
  apiCreateOrgInvite,
  apiGetOrgGitMirrorConfig,
  apiListOrgAudit,
  apiListOrgInvites,
  apiListOrgMembers,
  apiPatchOrg,
  apiPatchOrgGitMirrorConfig,
  apiPatchOrgMember,
  apiRevokeOrgInvite,
} from "../../lib/api";
import { ru, trStatusInvite } from "../../shared/i18n/ru";
import { INVITE_ROLE_OPTIONS } from "../../features/workspace/workspacePermissions";
import { formatRoleWithScope, toUserFacingRoleLabel } from "../../features/admin/adminRoles";

function toText(value) {
  return String(value || "").trim();
}

function formatTs(ts) {
  const n = Number(ts || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  try {
    return new Date(n * 1000).toLocaleString();
  } catch {
    return "-";
  }
}

function shortId(value) {
  const text = toText(value);
  if (!text) return "-";
  if (text.length <= 14) return text;
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

async function copyInviteValue(value) {
  const text = toText(value);
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function inviteTtlDaysFromRow(rowRaw) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
  const createdAt = Number(row.created_at || 0);
  const expiresAt = Number(row.expires_at || 0);
  const deltaSeconds = Math.max(0, expiresAt - createdAt);
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 7;
  return Math.min(60, Math.max(1, Math.round(deltaSeconds / 86400)));
}

function normalizeCurrentInvite(rowRaw, orgId) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
  const key = toText(row.invite_key);
  const link = toText(row.invite_link);
  if (!key && !link) return null;
  return {
    orgId: toText(orgId),
    key,
    link,
  };
}

const MEMBER_ROLES = ["org_admin", "editor", "org_viewer"];

export function isGitMirrorSubmitLocked({
  canManageMembers,
  gitBusy,
  busy,
  gitConfigLoaded,
}) {
  return !canManageMembers || gitBusy || busy || !gitConfigLoaded;
}

export default function OrgSettingsModal({
  open,
  onClose,
  initialTab = "members",
  dictionaryOnly = false,
  activeOrgId,
  activeOrgRole,
  isAdmin = false,
  orgName,
  onRequestRefreshOrgs,
  initialOperationKey = "",
  onDictionaryChanged,
}) {
  const [tab, setTab] = useState("members");
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [auditRows, setAuditRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteJobTitle, setInviteJobTitle] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviteTtl, setInviteTtl] = useState("7");
  const [lastInviteNotice, setLastInviteNotice] = useState("");
  const [lastCreatedInvite, setLastCreatedInvite] = useState(null);
  const [currentInvite, setCurrentInvite] = useState(null);
  const [copyState, setCopyState] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditStatus, setAuditStatus] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [gitMirrorEnabled, setGitMirrorEnabled] = useState(false);
  const [gitProvider, setGitProvider] = useState("");
  const [gitRepository, setGitRepository] = useState("");
  const [gitBranch, setGitBranch] = useState("");
  const [gitBasePath, setGitBasePath] = useState("");
  const [gitHealthStatus, setGitHealthStatus] = useState("unknown");
  const [gitHealthMessage, setGitHealthMessage] = useState("");
  const [gitUpdatedAt, setGitUpdatedAt] = useState(0);
  const [gitUpdatedBy, setGitUpdatedBy] = useState("");
  const [gitBusy, setGitBusy] = useState(false);
  const [gitConfigLoaded, setGitConfigLoaded] = useState(false);
  const [gitNotice, setGitNotice] = useState("");

  const canManageMembers = useMemo(() => isAdmin || ["org_owner", "org_admin"].includes(toText(activeOrgRole).toLowerCase()), [activeOrgRole, isAdmin]);
  const canManageInvites = canManageMembers;
  const oid = toText(activeOrgId);
  const visibleCreatedInvite = useMemo(() => {
    const localInvite = lastCreatedInvite && toText(lastCreatedInvite.orgId) === oid ? lastCreatedInvite : null;
    if (localInvite) return localInvite;
    return currentInvite && toText(currentInvite.orgId) === oid ? currentInvite : null;
  }, [lastCreatedInvite, currentInvite, oid]);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRole, setAssignRole] = useState("org_viewer");
  const [assignMsg, setAssignMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    if (dictionaryOnly) {
      setTab("dictionary");
      return;
    }
    const nextTab = toText(initialTab).toLowerCase();
    if (nextTab === "members" || nextTab === "invites" || nextTab === "audit" || nextTab === "git" || nextTab === "dictionary") {
      setTab(nextTab);
    } else {
      setTab("members");
    }
  }, [initialTab, open]);

  useEffect(() => {
    if (!open) return;
    setWorkspaceName(toText(orgName));
  }, [open, orgName]);

  const loadMembers = useCallback(async () => {
    const oid = toText(activeOrgId);
    if (!oid) return;
    const res = await apiListOrgMembers(oid);
    if (!res.ok) {
      setError(toText(res.error || ru.org.membersLoadFailed));
      return;
    }
    setMembers(Array.isArray(res.items) ? res.items : []);
  }, [activeOrgId]);

  const loadInvites = useCallback(async () => {
    if (!oid) {
      setInvites([]);
      setCurrentInvite(null);
      return;
    }
    const res = await apiListOrgInvites(oid);
    if (!res.ok) {
      setError(toText(res.error || ru.org.invitesLoadFailed));
      setCurrentInvite(null);
      return;
    }
    setInvites(Array.isArray(res.items) ? res.items : []);
    setCurrentInvite(normalizeCurrentInvite(res.current_invite || null, oid));
  }, [oid]);

  const loadAudit = useCallback(async () => {
    const oid = toText(activeOrgId);
    if (!oid) return;
    const res = await apiListOrgAudit(oid, { limit: 100, action: auditAction, status: auditStatus });
    if (!res.ok) {
      setError(toText(res.error || ru.org.auditLoadFailed));
      return;
    }
    setAuditRows(Array.isArray(res.items) ? res.items : []);
  }, [activeOrgId, auditAction, auditStatus]);

  const loadGitMirror = useCallback(async () => {
    const oid = toText(activeOrgId);
    if (!oid) return;
    const res = await apiGetOrgGitMirrorConfig(oid);
    if (!res.ok) {
      setGitConfigLoaded(false);
      setError(toText(res.error || "Не удалось загрузить настройки Git mirror."));
      return;
    }
    const cfg = res.config || {};
    setGitMirrorEnabled(cfg.git_mirror_enabled === true);
    setGitProvider(toText(cfg.git_provider));
    setGitRepository(toText(cfg.git_repository));
    setGitBranch(toText(cfg.git_branch));
    setGitBasePath(toText(cfg.git_base_path));
    setGitHealthStatus(toText(cfg.git_health_status || "unknown") || "unknown");
    setGitHealthMessage(toText(cfg.git_health_message));
    setGitUpdatedAt(Number(cfg.git_updated_at || 0));
    setGitUpdatedBy(toText(cfg.git_updated_by));
    setGitConfigLoaded(true);
  }, [activeOrgId]);

  useEffect(() => {
    if (!open) return;
    if (dictionaryOnly) {
      setBusy(false);
      return;
    }
    let canceled = false;
    setBusy(true);
    setGitConfigLoaded(false);
    setError("");
    void (async () => {
      await Promise.all([loadMembers(), loadInvites(), loadAudit(), loadGitMirror()]);
      if (!canceled) setBusy(false);
    })();
    return () => {
      canceled = true;
    };
  }, [open, dictionaryOnly, loadMembers, loadInvites, loadAudit, loadGitMirror]);

  async function handlePatchMemberRole(userId, role) {
    if (!canManageMembers) return;
    const oid = toText(activeOrgId);
    if (!oid || !toText(userId) || !toText(role)) return;
    setError("");
    const res = await apiPatchOrgMember(oid, userId, role);
    if (!res.ok) {
      setError(toText(res.error || ru.org.patchRoleFailed));
      return;
    }
    await loadMembers();
    onRequestRefreshOrgs?.();
  }

  async function handleCreateInvite(event) {
    event.preventDefault();
    if (!canManageInvites) return;
    if (!oid) return;
    setError("");
    setCopyState("");
    setLastInviteNotice("");
    setLastCreatedInvite(null);
    const ttlDays = Number(inviteTtl || 7);
    const res = await apiCreateOrgInvite(oid, {
      email: inviteEmail,
      full_name: inviteFullName,
      job_title: inviteJobTitle,
      role: inviteRole,
      ttl_days: ttlDays,
      regenerate: false,
    });
    if (!res.ok) {
      setError(toText(res.error || ru.org.createInviteFailed));
      return;
    }
    setInviteEmail("");
    setInviteFullName("");
    setInviteJobTitle("");
    setInviteRole("editor");
    setInviteTtl("7");
    if (toText(res.delivery) === "email") {
      setLastInviteNotice(ru.org.inviteForm.inviteSent);
    } else {
      setLastInviteNotice(ru.org.inviteForm.inviteCreated);
    }
    setLastCreatedInvite({
      orgId: oid,
      key: toText(res.invite_token || res.invite_key),
      link: toText(res.invite_link),
    });
    await loadInvites();
  }

  async function handleRegenerateInvite(row) {
    if (!canManageInvites || !oid) return;
    const email = toText(row?.email).toLowerCase();
    if (!email) return;
    const ok = typeof window === "undefined" || window.confirm("Перевыпустить текущий инвайт для этого email?");
    if (!ok) return;
    setError("");
    setCopyState("");
    const res = await apiCreateOrgInvite(oid, {
      email,
      full_name: toText(row?.full_name),
      job_title: toText(row?.job_title),
      role: toText(row?.role) || "viewer",
      ttl_days: inviteTtlDaysFromRow(row),
      regenerate: true,
    });
    if (!res.ok) {
      setError(toText(res.error || ru.org.createInviteFailed));
      return;
    }
    setLastInviteNotice("Инвайт перевыпущен.");
    setLastCreatedInvite({
      orgId: oid,
      key: toText(res.invite_token || res.invite_key),
      link: toText(res.invite_link),
    });
    await loadInvites();
  }

  async function handleRevokeInvite(inviteId) {
    if (!canManageInvites) return;
    const iid = toText(inviteId);
    if (!oid || !iid) return;
    setError("");
    const ok = typeof window === "undefined" || window.confirm(ru.org.revokeConfirm);
    if (!ok) return;
    const res = await apiRevokeOrgInvite(oid, iid);
    if (!res.ok) {
      setError(toText(res.error || ru.org.revokeInviteFailed));
      return;
    }
    await loadInvites();
  }

  async function handleCopy(value) {
    const ok = await copyInviteValue(value);
    setCopyState(ok ? "copied" : "");
  }

  async function handleRenameWorkspace(event) {
    event.preventDefault();
    if (!canManageMembers) return;
    const oid = toText(activeOrgId);
    const nextName = toText(workspaceName);
    if (!oid || !nextName) return;
    setError("");
    const res = await apiPatchOrg(oid, { name: nextName });
    if (!res.ok) {
      setError(toText(res.error || "Не удалось переименовать workspace."));
      return;
    }
    onRequestRefreshOrgs?.();
  }

  async function handleSaveGitMirror(event) {
    event.preventDefault();
    if (isGitMirrorSubmitLocked({ canManageMembers, gitBusy, busy, gitConfigLoaded })) {
      if (canManageMembers && !gitConfigLoaded) {
        setError("Дождитесь загрузки настроек Git mirror перед сохранением.");
      }
      return;
    }
    const oid = toText(activeOrgId);
    if (!oid) return;
    setGitBusy(true);
    setGitNotice("");
    setError("");
    const res = await apiPatchOrgGitMirrorConfig(oid, {
      git_mirror_enabled: gitMirrorEnabled,
      git_provider: gitProvider || null,
      git_repository: gitRepository || null,
      git_branch: gitBranch || null,
      git_base_path: gitBasePath || null,
    });
    setGitBusy(false);
    if (!res.ok) {
      setError(toText(res.error || "Не удалось сохранить настройки Git mirror."));
      return;
    }
    const cfg = res.config || {};
    setGitMirrorEnabled(cfg.git_mirror_enabled === true);
    setGitProvider(toText(cfg.git_provider));
    setGitRepository(toText(cfg.git_repository));
    setGitBranch(toText(cfg.git_branch));
    setGitBasePath(toText(cfg.git_base_path));
    setGitHealthStatus(toText(cfg.git_health_status || "unknown") || "unknown");
    setGitHealthMessage(toText(cfg.git_health_message));
    setGitUpdatedAt(Number(cfg.git_updated_at || 0));
    setGitUpdatedBy(toText(cfg.git_updated_by));
    setGitNotice("Настройки Git mirror сохранены.");
    onRequestRefreshOrgs?.();
  }

  async function handleAssignUser(event) {
    event.preventDefault();
    if (!canManageMembers) return;
    const oid = toText(activeOrgId);
    const uid = toText(assignUserId);
    if (!oid || !uid) { setAssignMsg("Введите User ID"); return; }
    setAssignMsg("");
    const res = await apiAssignOrgMember(oid, uid, assignRole);
    if (!res.ok) { setAssignMsg(toText(res.error || "Ошибка назначения")); return; }
    setAssignUserId("");
    setAssignMsg(`Пользователь ${uid} добавлен с ролью ${assignRole}`);
    await loadMembers();
  }

  const tabButtonClass = (key) => [
    "secondaryBtn h-8 min-h-0 px-3 py-0 text-xs",
    key === tab ? "border-accent/55 bg-accentSoft/30 text-fg" : "",
  ].join(" ").trim();
  const dictionaryTabActive = tab === "dictionary";
  const dictionaryVisualMode = dictionaryOnly || dictionaryTabActive;
  const gitFormLocked = isGitMirrorSubmitLocked({ canManageMembers, gitBusy, busy, gitConfigLoaded });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={dictionaryOnly || dictionaryTabActive
        ? "Справочник свойств операций"
        : `${ru.org.modalTitlePrefix}: ${toText(orgName) || oid || "-"}`}
      overlayClassName={dictionaryVisualMode ? "orgDictionaryModalOverlay" : ""}
      cardClassName={dictionaryVisualMode ? "orgDictionaryModalCard" : ""}
      headerClassName={dictionaryVisualMode ? "orgDictionaryModalHeader" : ""}
      bodyClassName={dictionaryVisualMode ? "orgDictionaryModalBody" : ""}
      footerClassName={dictionaryVisualMode ? "orgDictionaryModalFooter" : ""}
      footer={(
        <div className="flex w-full items-center justify-end gap-2">
          {!dictionaryOnly && !dictionaryTabActive ? (
            <div className="text-xs text-muted mr-auto">org_id: {shortId(oid)}</div>
          ) : null}
          <button type="button" className="secondaryBtn h-9 px-3 text-sm" onClick={onClose}>{ru.common.close}</button>
        </div>
      )}
    >
      <div className={`flex flex-col gap-3 ${dictionaryVisualMode ? "orgDictionaryModalContent" : ""}`}>
        {!dictionaryOnly && canManageMembers && !dictionaryTabActive ? (
          <form className="rounded-lg border border-border p-3" onSubmit={handleRenameWorkspace}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Workspace</div>
            <div className="flex flex-col gap-2 md:flex-row">
              <input
                className="input flex-1"
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Название workspace"
              />
              <button type="submit" className="secondaryBtn h-9 px-3 text-sm">{ru.common.save}</button>
            </div>
          </form>
        ) : null}
        {!dictionaryOnly ? (
          dictionaryTabActive ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={tabButtonClass("dictionary")} onClick={() => setTab("dictionary")}>Справочник</button>
              <button type="button" className="secondaryBtn h-8 min-h-0 px-3 py-0 text-xs" onClick={() => setTab("members")}>
                Другие разделы
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={tabButtonClass("members")} onClick={() => setTab("members")}>{ru.org.membersTab}</button>
              <button type="button" className={tabButtonClass("invites")} onClick={() => setTab("invites")}>{ru.org.invitesTab}</button>
              <button type="button" className={tabButtonClass("audit")} onClick={() => setTab("audit")}>{ru.org.auditTab}</button>
              <button type="button" className={tabButtonClass("git")} onClick={() => setTab("git")}>Git mirror</button>
              <button type="button" className={tabButtonClass("dictionary")} onClick={() => setTab("dictionary")}>Справочник</button>
            </div>
          )
        ) : null}

        {!dictionaryTabActive && error ? <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div> : null}
        {!dictionaryTabActive && busy ? <div className="text-xs text-muted">{ru.common.loading}</div> : null}

        {tab === "members" ? (
          <div className="space-y-2">
            <div className="text-xs text-muted">{ru.org.membersCount}: {members.length}</div>
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="min-w-full text-xs">
                <thead className="bg-panel2/70 text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">{ru.org.memberTable.user}</th>
                    <th className="px-2 py-1 text-left">{ru.org.memberTable.email}</th>
                    <th className="px-2 py-1 text-left">{ru.org.memberTable.role}</th>
                    <th className="px-2 py-1 text-left">{ru.org.memberTable.created}</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((row) => {
                    const uid = toText(row?.user_id);
                    const role = toText(row?.role);
                    return (
                      <tr key={uid} className="border-t border-border/60">
                        <td className="px-2 py-1" title={uid}>{shortId(uid)}</td>
                        <td className="px-2 py-1" title={toText(row?.email)}>{toText(row?.email) || "-"}</td>
                        <td className="px-2 py-1">
                          {canManageMembers ? (
                            <select
                              className="select h-8 min-h-0 w-full"
                              value={role || "org_viewer"}
                              onChange={(e) => {
                                void handlePatchMemberRole(uid, e.target.value);
                              }}
                            >
                              {MEMBER_ROLES.map((item) => (
                                <option key={item} value={item}>{toUserFacingRoleLabel(item)}</option>
                              ))}
                            </select>
                          ) : (
                            formatRoleWithScope(role)
                          )}
                        </td>
                        <td className="px-2 py-1">{formatTs(row?.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          {canManageMembers ? (
            <form className="rounded-lg border border-border p-2 space-y-2" onSubmit={handleAssignUser}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Добавить / изменить участника</div>
              <div className="flex flex-wrap gap-2 items-end">
                <input
                  className="input flex-1 min-w-[160px]"
                  type="text"
                  placeholder="User ID или email"
                  value={assignUserId}
                  onChange={(e) => { setAssignUserId(e.target.value); setAssignMsg(""); }}
                />
                <select
                  className="select h-9 min-h-0"
                  value={assignRole}
                  onChange={(e) => setAssignRole(e.target.value)}
                >
                  {MEMBER_ROLES.map((r) => <option key={r} value={r}>{toUserFacingRoleLabel(r)}</option>)}
                </select>
                <button type="submit" className="primaryBtn h-9 px-3 text-sm" disabled={!assignUserId.trim()}>
                  Назначить
                </button>
              </div>
              {assignMsg ? (
                <div className={`text-xs px-2 py-1 rounded ${assignMsg.includes("добавлен") ? "text-success bg-success/10" : "text-danger bg-danger/10"}`}>
                  {assignMsg}
                </div>
              ) : null}
            </form>
          ) : null}
          </div>
        ) : null}

        {tab === "invites" ? (
          <div className="space-y-2">
            {canManageInvites ? (
              <form className="grid grid-cols-1 gap-2 rounded-lg border border-border p-2 md:grid-cols-12" onSubmit={handleCreateInvite}>
                <input
                  className="input md:col-span-4"
                  type="email"
                  placeholder={ru.org.inviteForm.emailPlaceholder}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
                <input
                  className="input md:col-span-2"
                  type="text"
                  placeholder={ru.org.inviteForm.fullNamePlaceholder}
                  value={inviteFullName}
                  onChange={(e) => setInviteFullName(e.target.value)}
                />
                <input
                  className="input md:col-span-2"
                  type="text"
                  placeholder={ru.org.inviteForm.jobTitlePlaceholder}
                  value={inviteJobTitle}
                  onChange={(e) => setInviteJobTitle(e.target.value)}
                />
                <select
                  className="input md:col-span-2"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  {INVITE_ROLE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <label className="md:col-span-1">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Срок, дней</div>
                  <input
                    className="input w-full"
                    type="number"
                    min="1"
                    max="60"
                    placeholder={ru.org.inviteForm.expiresPlaceholder}
                    value={inviteTtl}
                    onChange={(e) => setInviteTtl(e.target.value)}
                  />
                </label>
                <button type="submit" className="primaryBtn md:col-span-1">{ru.org.inviteForm.createButton}</button>
                <div className="md:col-span-12 text-[11px] text-muted">
                  {ru.org.noInviteCreateHint}
                </div>
              </form>
            ) : (
              <div className="text-xs text-muted">{ru.org.noInviteRights}</div>
            )}
            {lastInviteNotice ? (
              <div className="rounded-lg border border-border px-3 py-2 text-xs text-muted">
                {lastInviteNotice}
              </div>
            ) : null}
            {visibleCreatedInvite && (toText(visibleCreatedInvite.key) || toText(visibleCreatedInvite.link)) ? (
              <div className="space-y-3 rounded-lg border border-border bg-panel2/40 px-3 py-3">
                {toText(visibleCreatedInvite.key) ? (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{ru.org.inviteForm.inviteKeyLabel}</div>
                    <div className="flex flex-col gap-2 md:flex-row">
                      <input className="input flex-1" type="text" value={toText(visibleCreatedInvite.key)} readOnly />
                      <button type="button" className="secondaryBtn h-9 px-3 text-sm" onClick={() => void handleCopy(visibleCreatedInvite.key)}>
                        {copyState === "copied" ? ru.common.copied : ru.org.inviteForm.copyButton}
                      </button>
                    </div>
                  </div>
                ) : null}
                {toText(visibleCreatedInvite.link) ? (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{ru.org.inviteForm.inviteLinkLabel}</div>
                    <div className="flex flex-col gap-2 md:flex-row">
                      <input className="input flex-1" type="text" value={toText(visibleCreatedInvite.link)} readOnly />
                      <button type="button" className="secondaryBtn h-9 px-3 text-sm" onClick={() => void handleCopy(visibleCreatedInvite.link)}>
                        {copyState === "copied" ? ru.common.copied : ru.org.inviteForm.copyLinkButton}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="min-w-full text-xs">
                <thead className="bg-panel2/70 text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">{ru.org.inviteTable.email}</th>
                    <th className="px-2 py-1 text-left">{ru.org.inviteTable.fullName}</th>
                    <th className="px-2 py-1 text-left">{ru.org.inviteTable.jobTitle}</th>
                    <th className="px-2 py-1 text-left">Роль</th>
                    <th className="px-2 py-1 text-left">{ru.org.inviteTable.status}</th>
                    <th className="px-2 py-1 text-left">{ru.org.inviteTable.createdAt}</th>
                    <th className="px-2 py-1 text-left">{ru.org.inviteTable.expiresAt}</th>
                    <th className="px-2 py-1 text-left">{ru.org.inviteTable.usedAt}</th>
                    <th className="px-2 py-1 text-left">{ru.org.inviteTable.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.length === 0 ? (
                    <tr>
                      <td className="px-2 py-3 text-muted" colSpan={9}>{ru.org.inviteTable.empty}</td>
                    </tr>
                  ) : null}
                  {invites.map((row) => {
                    const inviteId = toText(row?.id);
                    const status = toText(row?.status);
                    const isActive = status === "pending";
                    return (
                      <tr key={inviteId} className="border-t border-border/60">
                        <td className="px-2 py-1">{toText(row?.email) || "-"}</td>
                        <td className="px-2 py-1">{toText(row?.full_name) || "-"}</td>
                        <td className="px-2 py-1">{toText(row?.job_title) || "-"}</td>
                        <td className="px-2 py-1">{toUserFacingRoleLabel(row?.role)}</td>
                        <td className="px-2 py-1">{trStatusInvite(status)}</td>
                        <td className="px-2 py-1">{formatTs(row?.created_at)}</td>
                        <td className="px-2 py-1">{formatTs(row?.expires_at)}</td>
                        <td className="px-2 py-1">{formatTs(row?.used_at || row?.accepted_at)}</td>
                        <td className="px-2 py-1">
                          {canManageInvites && isActive ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <button type="button" className="secondaryBtn h-8 min-h-0 px-2 py-0 text-xs" onClick={() => void handleRegenerateInvite(row)}>
                                Перевыпустить
                              </button>
                              <button type="button" className="secondaryBtn h-8 min-h-0 px-2 py-0 text-xs" onClick={() => void handleRevokeInvite(inviteId)}>
                                {ru.common.revoke}
                              </button>
                            </div>
                          ) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "git" ? (
          <form className="space-y-3 rounded-lg border border-border p-3" onSubmit={handleSaveGitMirror}>
            <div className="text-xs text-muted">
              Publish-only mirror на уровне организации. Draft/autosave не синхронизируются в Git.
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={gitMirrorEnabled}
                disabled={gitFormLocked}
                onChange={(e) => setGitMirrorEnabled(e.target.checked)}
              />
              Enable Git mirror
            </label>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Provider</div>
                <select
                  className="input w-full"
                  value={gitProvider}
                  disabled={gitFormLocked}
                  onChange={(e) => setGitProvider(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="github">GitHub</option>
                  <option value="gitlab">GitLab</option>
                </select>
              </label>
              <label>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Repository / Project</div>
                <input
                  className="input w-full"
                  type="text"
                  placeholder="owner/repo или group/subgroup/project"
                  value={gitRepository}
                  disabled={gitFormLocked}
                  onChange={(e) => setGitRepository(e.target.value)}
                />
              </label>
              <label>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Branch</div>
                <input
                  className="input w-full"
                  type="text"
                  placeholder="main"
                  value={gitBranch}
                  disabled={gitFormLocked}
                  onChange={(e) => setGitBranch(e.target.value)}
                />
              </label>
              <label>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Base path</div>
                <input
                  className="input w-full"
                  type="text"
                  placeholder="processmap/published"
                  value={gitBasePath}
                  disabled={gitFormLocked}
                  onChange={(e) => setGitBasePath(e.target.value)}
                />
              </label>
            </div>
            <div className={`rounded-lg border px-3 py-2 text-xs ${
              gitHealthStatus === "valid"
                ? "border-success/40 bg-success/10 text-success"
                : gitHealthStatus === "invalid"
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-border bg-panel2/50 text-muted"
            }`}>
              <div className="font-semibold">Health: {gitHealthStatus || "unknown"}</div>
              <div className="mt-1">{gitHealthMessage || "Нет диагностического сообщения."}</div>
            </div>
            <div className="rounded-lg border border-border bg-panel2/40 px-3 py-2 text-xs text-muted">
              Effective target: {gitProvider || "provider: —"} · {gitRepository || "repo/project: —"} · {gitBranch ? `branch: ${gitBranch}` : "branch: —"} · {gitBasePath ? `base path: ${gitBasePath}` : "base path: —"}
              {gitUpdatedAt > 0 ? ` · updated: ${formatTs(gitUpdatedAt)}` : ""}
              {gitUpdatedBy ? ` · by: ${gitUpdatedBy}` : ""}
            </div>
            {gitNotice ? <div className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">{gitNotice}</div> : null}
            {canManageMembers ? (
              <button type="submit" className="secondaryBtn h-9 px-3 text-sm" disabled={gitFormLocked}>
                {gitBusy ? "Сохранение…" : "Сохранить Git mirror"}
              </button>
            ) : (
              <div className="text-xs text-muted">Недостаточно прав для изменения конфигурации.</div>
            )}
          </form>
        ) : null}

        {tab === "audit" ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
              <input
                className="input md:col-span-4"
                placeholder={ru.org.auditTable.actionFilter}
                value={auditAction}
                onChange={(e) => setAuditAction(e.target.value)}
              />
              <select className="select md:col-span-3" value={auditStatus} onChange={(e) => setAuditStatus(e.target.value)}>
                <option value="">{ru.org.auditTable.statusAll}</option>
                <option value="ok">ok</option>
                <option value="fail">fail</option>
              </select>
              <button type="button" className="secondaryBtn md:col-span-2" onClick={() => void loadAudit()}>{ru.common.refresh}</button>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="min-w-full text-xs">
                <thead className="bg-panel2/70 text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">{ru.org.auditTable.time}</th>
                    <th className="px-2 py-1 text-left">{ru.org.auditTable.actor}</th>
                    <th className="px-2 py-1 text-left">{ru.org.auditTable.action}</th>
                    <th className="px-2 py-1 text-left">{ru.org.auditTable.entity}</th>
                    <th className="px-2 py-1 text-left">{ru.org.auditTable.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row) => {
                    const id = toText(row?.id);
                    return (
                      <tr key={id} className="border-t border-border/60">
                        <td className="px-2 py-1">{formatTs(row?.ts)}</td>
                        <td className="px-2 py-1" title={toText(row?.actor_user_id)}>
                          {toText(row?.actor_email) || shortId(row?.actor_user_id)}
                        </td>
                        <td className="px-2 py-1">{toText(row?.action) || "-"}</td>
                        <td className="px-2 py-1" title={toText(row?.entity_id)}>
                          {toText(row?.entity_type) || "-"} {shortId(row?.entity_id)}
                        </td>
                        <td className="px-2 py-1">{toText(row?.status) || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "dictionary" ? (
          <div className="orgDictionaryPanelRoot">
            <OrgPropertyDictionaryPanel
              activeOrgId={activeOrgId}
              initialOperationKey={initialOperationKey}
              onDictionaryChanged={onDictionaryChanged}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
