import { useCallback, useEffect, useMemo, useState } from "react";

import Modal from "../../shared/ui/Modal";
import {
  apiAssignOrgMember,
  apiCreateOrgInvite,
  apiListOrgAudit,
  apiListOrgInvites,
  apiListOrgMembers,
  apiPatchOrg,
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

const MEMBER_ROLES = ["org_admin", "editor", "org_viewer"];

export default function OrgSettingsModal({
  open,
  onClose,
  initialTab = "members",
  activeOrgId,
  activeOrgRole,
  isAdmin = false,
  orgName,
  onRequestRefreshOrgs,
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
  const [copyState, setCopyState] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditStatus, setAuditStatus] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");

  const canManageMembers = useMemo(() => isAdmin || ["org_owner", "org_admin"].includes(toText(activeOrgRole).toLowerCase()), [activeOrgRole, isAdmin]);
  const canManageInvites = canManageMembers;
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRole, setAssignRole] = useState("org_viewer");
  const [assignMsg, setAssignMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    const nextTab = toText(initialTab).toLowerCase();
    if (nextTab === "members" || nextTab === "invites" || nextTab === "audit") {
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
    const oid = toText(activeOrgId);
    if (!oid) return;
    const res = await apiListOrgInvites(oid);
    if (!res.ok) {
      setError(toText(res.error || ru.org.invitesLoadFailed));
      return;
    }
    setInvites(Array.isArray(res.items) ? res.items : []);
  }, [activeOrgId]);

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

  useEffect(() => {
    if (!open) return;
    let canceled = false;
    setBusy(true);
    setError("");
    void (async () => {
      await Promise.all([loadMembers(), loadInvites(), loadAudit()]);
      if (!canceled) setBusy(false);
    })();
    return () => {
      canceled = true;
    };
  }, [open, loadMembers, loadInvites, loadAudit]);

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
    const oid = toText(activeOrgId);
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
      key: toText(res.invite_token || res.invite_key),
      link: toText(res.invite_link),
    });
    await loadInvites();
  }

  async function handleRevokeInvite(inviteId) {
    if (!canManageInvites) return;
    const oid = toText(activeOrgId);
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

  const oid = toText(activeOrgId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${ru.org.modalTitlePrefix}: ${toText(orgName) || oid || "-"}`}
      footer={(
        <div className="flex w-full items-center justify-between gap-2">
          <div className="text-xs text-muted">org_id: {shortId(oid)}</div>
          <button type="button" className="secondaryBtn h-9 px-3 text-sm" onClick={onClose}>{ru.common.close}</button>
        </div>
      )}
    >
      <div className="flex flex-col gap-3">
        {canManageMembers ? (
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
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={tabButtonClass("members")} onClick={() => setTab("members")}>{ru.org.membersTab}</button>
          <button type="button" className={tabButtonClass("invites")} onClick={() => setTab("invites")}>{ru.org.invitesTab}</button>
          <button type="button" className={tabButtonClass("audit")} onClick={() => setTab("audit")}>{ru.org.auditTab}</button>
        </div>

        {error ? <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div> : null}
        {busy ? <div className="text-xs text-muted">{ru.common.loading}</div> : null}

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
            {lastCreatedInvite && (toText(lastCreatedInvite.key) || toText(lastCreatedInvite.link)) ? (
              <div className="space-y-3 rounded-lg border border-border bg-panel2/40 px-3 py-3">
                {toText(lastCreatedInvite.key) ? (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{ru.org.inviteForm.inviteKeyLabel}</div>
                    <div className="flex flex-col gap-2 md:flex-row">
                      <input className="input flex-1" type="text" value={toText(lastCreatedInvite.key)} readOnly />
                      <button type="button" className="secondaryBtn h-9 px-3 text-sm" onClick={() => void handleCopy(lastCreatedInvite.key)}>
                        {copyState === "copied" ? ru.common.copied : ru.org.inviteForm.copyButton}
                      </button>
                    </div>
                  </div>
                ) : null}
                {toText(lastCreatedInvite.link) ? (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{ru.org.inviteForm.inviteLinkLabel}</div>
                    <div className="flex flex-col gap-2 md:flex-row">
                      <input className="input flex-1" type="text" value={toText(lastCreatedInvite.link)} readOnly />
                      <button type="button" className="secondaryBtn h-9 px-3 text-sm" onClick={() => void handleCopy(lastCreatedInvite.link)}>
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
                            <button type="button" className="secondaryBtn h-8 min-h-0 px-2 py-0 text-xs" onClick={() => void handleRevokeInvite(inviteId)}>
                              {ru.common.revoke}
                            </button>
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
      </div>
    </Modal>
  );
}
