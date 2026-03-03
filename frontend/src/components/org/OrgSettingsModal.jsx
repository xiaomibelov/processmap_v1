import { useCallback, useEffect, useMemo, useState } from "react";

import Modal from "../../shared/ui/Modal";
import {
  apiCreateOrgInvite,
  apiListOrgAudit,
  apiListOrgInvites,
  apiListOrgMembers,
  apiPatchOrgMember,
  apiRevokeOrgInvite,
} from "../../lib/api";

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

const MEMBER_ROLES = ["org_admin", "project_manager", "editor", "viewer", "auditor"];
const INVITE_ROLES = ["org_admin", "editor", "viewer", "auditor"];

export default function OrgSettingsModal({
  open,
  onClose,
  activeOrgId,
  activeOrgRole,
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
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteTtl, setInviteTtl] = useState("7");
  const [lastInviteToken, setLastInviteToken] = useState("");
  const [lastInviteNotice, setLastInviteNotice] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditStatus, setAuditStatus] = useState("");

  const canManageMembers = useMemo(() => ["org_owner", "org_admin"].includes(toText(activeOrgRole).toLowerCase()), [activeOrgRole]);
  const canManageInvites = canManageMembers;

  const loadMembers = useCallback(async () => {
    const oid = toText(activeOrgId);
    if (!oid) return;
    const res = await apiListOrgMembers(oid);
    if (!res.ok) {
      setError(toText(res.error || "Не удалось загрузить участников"));
      return;
    }
    setMembers(Array.isArray(res.items) ? res.items : []);
  }, [activeOrgId]);

  const loadInvites = useCallback(async () => {
    const oid = toText(activeOrgId);
    if (!oid) return;
    const res = await apiListOrgInvites(oid);
    if (!res.ok) {
      setError(toText(res.error || "Не удалось загрузить инвайты"));
      return;
    }
    setInvites(Array.isArray(res.items) ? res.items : []);
  }, [activeOrgId]);

  const loadAudit = useCallback(async () => {
    const oid = toText(activeOrgId);
    if (!oid) return;
    const res = await apiListOrgAudit(oid, { limit: 100, action: auditAction, status: auditStatus });
    if (!res.ok) {
      setError(toText(res.error || "Не удалось загрузить аудит"));
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
      setError(toText(res.error || "Не удалось обновить роль"));
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
    const ttlDays = Number(inviteTtl || 7);
    const res = await apiCreateOrgInvite(oid, { email: inviteEmail, role: inviteRole, ttl_days: ttlDays });
    if (!res.ok) {
      setError(toText(res.error || "Не удалось создать инвайт"));
      return;
    }
    setInviteEmail("");
    setInviteRole("viewer");
    setInviteTtl("7");
    const token = toText(res.invite_token);
    setLastInviteToken(token);
    if (token) {
      setLastInviteNotice("Инвайт создан. Токен доступен в dev-режиме.");
    } else if (toText(res.delivery) === "email") {
      setLastInviteNotice("Инвайт отправлен по email.");
    } else {
      setLastInviteNotice("Инвайт создан.");
    }
    await loadInvites();
  }

  async function handleRevokeInvite(inviteId) {
    if (!canManageInvites) return;
    const oid = toText(activeOrgId);
    const iid = toText(inviteId);
    if (!oid || !iid) return;
    setError("");
    const ok = typeof window === "undefined" || window.confirm("Отозвать инвайт?");
    if (!ok) return;
    const res = await apiRevokeOrgInvite(oid, iid);
    if (!res.ok) {
      setError(toText(res.error || "Не удалось отозвать инвайт"));
      return;
    }
    await loadInvites();
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
      title={`Организация: ${toText(orgName) || oid || "-"}`}
      footer={(
        <div className="flex w-full items-center justify-between gap-2">
          <div className="text-xs text-muted">org_id: {shortId(oid)}</div>
          <button type="button" className="secondaryBtn h-9 px-3 text-sm" onClick={onClose}>Закрыть</button>
        </div>
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={tabButtonClass("members")} onClick={() => setTab("members")}>Members</button>
          <button type="button" className={tabButtonClass("invites")} onClick={() => setTab("invites")}>Invites</button>
          <button type="button" className={tabButtonClass("audit")} onClick={() => setTab("audit")}>Audit</button>
        </div>

        {error ? <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div> : null}
        {busy ? <div className="text-xs text-muted">Загрузка…</div> : null}

        {tab === "members" ? (
          <div className="space-y-2">
            <div className="text-xs text-muted">Участники организации: {members.length}</div>
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="min-w-full text-xs">
                <thead className="bg-panel2/70 text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">User</th>
                    <th className="px-2 py-1 text-left">Email</th>
                    <th className="px-2 py-1 text-left">Role</th>
                    <th className="px-2 py-1 text-left">Created</th>
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
                              value={role || "viewer"}
                              onChange={(e) => {
                                void handlePatchMemberRole(uid, e.target.value);
                              }}
                            >
                              {MEMBER_ROLES.map((item) => (
                                <option key={item} value={item}>{item}</option>
                              ))}
                            </select>
                          ) : (
                            role || "viewer"
                          )}
                        </td>
                        <td className="px-2 py-1">{formatTs(row?.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "invites" ? (
          <div className="space-y-2">
            {canManageInvites ? (
              <form className="grid grid-cols-1 gap-2 rounded-lg border border-border p-2 md:grid-cols-12" onSubmit={handleCreateInvite}>
                <input
                  className="input md:col-span-5"
                  type="email"
                  placeholder="email@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
                <select className="select md:col-span-3" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  {INVITE_ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <input
                  className="input md:col-span-2"
                  type="number"
                  min="1"
                  max="60"
                  placeholder="TTL"
                  value={inviteTtl}
                  onChange={(e) => setInviteTtl(e.target.value)}
                />
                <button type="submit" className="primaryBtn md:col-span-2">Создать</button>
              </form>
            ) : (
              <div className="text-xs text-muted">Нет прав на управление инвайтами.</div>
            )}
            {lastInviteToken ? (
              <div className="rounded-lg border border-accent/40 bg-accentSoft/15 px-3 py-2 text-xs">
                Invite token: <code>{lastInviteToken}</code>
              </div>
            ) : null}
            {!lastInviteToken && lastInviteNotice ? (
              <div className="rounded-lg border border-border px-3 py-2 text-xs text-muted">
                {lastInviteNotice}
              </div>
            ) : null}
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="min-w-full text-xs">
                <thead className="bg-panel2/70 text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">Email</th>
                    <th className="px-2 py-1 text-left">Role</th>
                    <th className="px-2 py-1 text-left">Status</th>
                    <th className="px-2 py-1 text-left">Expires</th>
                    <th className="px-2 py-1 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((row) => {
                    const inviteId = toText(row?.id);
                    const status = toText(row?.status);
                    const isActive = status === "active";
                    return (
                      <tr key={inviteId} className="border-t border-border/60">
                        <td className="px-2 py-1">{toText(row?.email) || "-"}</td>
                        <td className="px-2 py-1">{toText(row?.role) || "viewer"}</td>
                        <td className="px-2 py-1">{status || "-"}</td>
                        <td className="px-2 py-1">{formatTs(row?.expires_at)}</td>
                        <td className="px-2 py-1">
                          {canManageInvites && isActive ? (
                            <button type="button" className="secondaryBtn h-8 min-h-0 px-2 py-0 text-xs" onClick={() => void handleRevokeInvite(inviteId)}>
                              Revoke
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
                placeholder="action filter"
                value={auditAction}
                onChange={(e) => setAuditAction(e.target.value)}
              />
              <select className="select md:col-span-3" value={auditStatus} onChange={(e) => setAuditStatus(e.target.value)}>
                <option value="">status: all</option>
                <option value="ok">ok</option>
                <option value="fail">fail</option>
              </select>
              <button type="button" className="secondaryBtn md:col-span-2" onClick={() => void loadAudit()}>Обновить</button>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="min-w-full text-xs">
                <thead className="bg-panel2/70 text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">TS</th>
                    <th className="px-2 py-1 text-left">Actor</th>
                    <th className="px-2 py-1 text-left">Action</th>
                    <th className="px-2 py-1 text-left">Entity</th>
                    <th className="px-2 py-1 text-left">Status</th>
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
