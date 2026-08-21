import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiAdminGetInvitePermissions,
  apiAdminPatchInvitePermissions,
  apiCreateOrgInvite,
  apiListOrgInvites,
  apiRevokeOrgInvite,
} from "../../../../lib/api";
import { ru, trStatusInvite } from "../../../../shared/i18n/ru";
import { formatRoleWithScope, toUserFacingRoleLabel } from "../../adminRoles";
import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toText } from "../../utils/adminFormat";
import { INVITE_ROLE_OPTIONS } from "../../../../features/workspace/workspacePermissions";
import AdminInvitePermissionEditor, {
  AdminInvitePermissionSummary,
  invitePermissionDefaults,
} from "../permissions/AdminInvitePermissionEditor";
import { useAdminMutation } from "../../hooks/useAdminMutation";
import { useAdminQuery } from "../../hooks/useAdminQuery";

function inviteTone(statusRaw) {
  const status = toText(statusRaw).toLowerCase();
  if (status === "used") return "ok";
  if (status === "expired" || status === "revoked") return "warn";
  return "accent";
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
  return { orgId: toText(orgId), key, link };
}

async function fetchOrgInvites(orgId) {
  const res = await apiListOrgInvites(orgId);
  if (!res.ok) {
    throw new Error(res.error || ru.org.invitesLoadFailed);
  }
  return {
    items: Array.isArray(res.items) ? res.items : [],
    current_invite: res.current_invite || null,
  };
}

function InviteInlineForm({
  activeOrgLabel,
  canManage,
  email,
  setEmail,
  fullName,
  setFullName,
  jobTitle,
  setJobTitle,
  role,
  setRole,
  ttl,
  setTtl,
  permissions,
  setPermissions,
  onSubmit,
  isPending,
}) {
  return (
    <form className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 md:grid-cols-12" onSubmit={onSubmit}>
      <label className="md:col-span-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Организация</div>
        <input className="input h-8 min-h-0 w-full py-1 text-xs" type="text" value={activeOrgLabel} disabled />
      </label>
      <label className="md:col-span-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Email</div>
        <input
          className="input h-8 min-h-0 w-full py-1 text-xs"
          type="email"
          placeholder={ru.org.inviteForm.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label className="md:col-span-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Имя</div>
        <input
          className="input h-8 min-h-0 w-full py-1 text-xs"
          type="text"
          placeholder={ru.org.inviteForm.fullNamePlaceholder}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </label>
      <label className="md:col-span-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Должность</div>
        <input
          className="input h-8 min-h-0 w-full py-1 text-xs"
          type="text"
          placeholder={ru.org.inviteForm.jobTitlePlaceholder}
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
        />
      </label>
      <label className="md:col-span-1">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Роль</div>
        <select className="input h-8 min-h-0 w-full py-1 text-xs" value={role} onChange={(e) => setRole(e.target.value)}>
          {INVITE_ROLE_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </label>
      <label className="md:col-span-1">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">TTL, дн</div>
        <input
          className="input h-8 min-h-0 w-full py-1 text-xs"
          type="number"
          min="1"
          max="60"
          placeholder={ru.org.inviteForm.expiresPlaceholder}
          value={ttl}
          onChange={(e) => setTtl(e.target.value)}
        />
      </label>
      <div className="md:col-span-12">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Права доступа</div>
        <AdminInvitePermissionEditor role={role} value={permissions} onChange={setPermissions} compact />
      </div>
      <div className="md:col-span-12 flex items-center gap-2">
        <button type="submit" className="primaryBtn h-8 min-h-0 rounded-lg px-3 py-0 text-xs" disabled={isPending || !email.trim()}>
          {isPending ? "Создание…" : ru.org.inviteForm.createButton}
        </button>
        <span className="text-xs text-slate-500">{ru.org.noInviteCreateHint}</span>
      </div>
    </form>
  );
}

function InvitesTable({
  items,
  canManage,
  onRegenerate,
  onRevoke,
  expandedInviteId,
  setExpandedInviteId,
  editingInviteId,
  editingPermissions,
  savingPermissions,
  onStartEditPermissions,
  onSavePermissions,
  onCancelPermissions,
  onChangeEditingPermissions,
  revokePending,
  regeneratePending,
  patchPending,
}) {
  const invites = asArray(items);
  return (
    <div className="overflow-auto rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
          <tr>
            <th className="px-2 py-1.5 font-medium"></th>
            <th className="px-2 py-1.5 font-medium">{ru.org.inviteTable.email}</th>
            <th className="px-2 py-1.5 font-medium">{ru.org.inviteTable.fullName}</th>
            <th className="px-2 py-1.5 font-medium">{ru.org.inviteTable.jobTitle}</th>
            <th className="px-2 py-1.5 font-medium">Роль</th>
            <th className="px-2 py-1.5 font-medium">Права</th>
            <th className="px-2 py-1.5 font-medium">{ru.org.inviteTable.status}</th>
            <th className="px-2 py-1.5 font-medium">{ru.org.inviteTable.createdAt}</th>
            <th className="px-2 py-1.5 font-medium">{ru.org.inviteTable.expiresAt}</th>
            <th className="px-2 py-1.5 font-medium">{ru.org.inviteTable.usedAt}</th>
            <th className="px-2 py-1.5 font-medium">{ru.org.inviteTable.action}</th>
          </tr>
        </thead>
        <tbody>
          {invites.length === 0 ? (
            <tr>
              <td className="px-2 py-4 text-slate-500" colSpan={11}>{ru.org.inviteTable.empty}</td>
            </tr>
          ) : null}
          {invites.map((row) => {
            const inviteId = toText(row?.id);
            const status = toText(row?.status);
            const isPendingStatus = status === "pending";
            const isExpanded = expandedInviteId === inviteId;
            const isEditing = editingInviteId === inviteId;
            return (
              <>
                <tr key={inviteId} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      className="secondaryBtn h-6 min-h-0 rounded-lg px-1.5 py-0 text-[10px]"
                      onClick={() => setExpandedInviteId(isExpanded ? "" : inviteId)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? "−" : "+"}
                    </button>
                  </td>
                  <td className="break-all px-2 py-2 font-medium text-slate-950">{toText(row?.email) || ru.common.unknown}</td>
                  <td className="px-2 py-2 text-slate-600">{toText(row?.full_name) || ru.common.unknown}</td>
                  <td className="px-2 py-2 text-slate-600">{toText(row?.job_title) || ru.common.unknown}</td>
                  <td className="px-2 py-2 text-slate-600">{toUserFacingRoleLabel(row?.role)}</td>
                  <td className="px-2 py-2"><AdminInvitePermissionSummary permissions={row?.permissions} role={row?.role} /></td>
                  <td className="px-2 py-2"><StatusPill status={trStatusInvite(status)} tone={inviteTone(status)} compact /></td>
                  <td className="px-2 py-2 text-slate-500">{formatTs(row?.created_at)}</td>
                  <td className="px-2 py-2 text-slate-500">{formatTs(row?.expires_at)}</td>
                  <td className="px-2 py-2 text-slate-500">{formatTs(row?.used_at || row?.accepted_at)}</td>
                  <td className="px-2 py-2">
                    {canManage && isPendingStatus ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <button type="button" className="secondaryBtn h-6 min-h-0 rounded-lg px-2 py-0 text-[10px]" onClick={() => onRegenerate(row)} disabled={regeneratePending}>
                          Перевыпустить
                        </button>
                        <button type="button" className="secondaryBtn h-6 min-h-0 rounded-lg px-2 py-0 text-[10px]" onClick={() => onStartEditPermissions(row)} disabled={savingPermissions}>
                          Права
                        </button>
                        <button type="button" className="secondaryBtn h-6 min-h-0 rounded-lg px-2 py-0 text-[10px]" onClick={() => onRevoke(inviteId)} disabled={revokePending}>
                          {ru.common.revoke}
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-400">{ru.common.notAvailable}</span>
                    )}
                  </td>
                </tr>
                {isExpanded || isEditing ? (
                  <tr className="border-t border-slate-100 bg-slate-50/70">
                    <td colSpan={11} className="px-2 py-2">
                      <div className="space-y-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {isEditing ? "Редактирование прав инвайта" : "Права доступа"}
                        </div>
                        <AdminInvitePermissionEditor
                          role={row?.role}
                          value={isEditing ? editingPermissions : (row?.permissions || {})}
                          onChange={isEditing ? onChangeEditingPermissions : () => {}}
                          disabled={!isEditing || savingPermissions || patchPending}
                          compact
                        />
                        {isEditing ? (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="primaryBtn h-7 min-h-0 rounded-lg px-3 py-0 text-xs" disabled={savingPermissions || patchPending} onClick={onSavePermissions}>
                              {patchPending ? "Сохранение…" : "Сохранить права"}
                            </button>
                            <button type="button" className="secondaryBtn h-7 min-h-0 rounded-lg px-3 py-0 text-xs" disabled={patchPending} onClick={onCancelPermissions}>
                              Отмена
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminOrgInvitesPanel({
  activeOrgId = "",
  activeOrgName = "",
  activeOrgRole = "",
  isAdmin = false,
  items = [],
  onChanged,
  onInviteCreated,
  recentInvite = null,
}) {
  const rows = asArray(items);
  const oid = toText(activeOrgId);
  const activeOrg = useMemo(
    () => rows.find((row) => toText(row?.org_id || row?.id) === oid) || null,
    [rows, oid],
  );
  const activeOrgLabel = toText(activeOrgName || activeOrg?.name || activeOrg?.org_name || oid);
  const effectiveRole = toText(activeOrgRole || activeOrg?.role).toLowerCase();
  const canManageInvites = isAdmin || ["org_owner", "org_admin"].includes(effectiveRole);

  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteJobTitle, setInviteJobTitle] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviteTtl, setInviteTtl] = useState("7");
  const [invitePermissions, setInvitePermissions] = useState({});
  const [lastInviteNotice, setLastInviteNotice] = useState("");
  const [lastCreatedInvite, setLastCreatedInvite] = useState(null);
  const [copyState, setCopyState] = useState("");
  const [expandedInviteId, setExpandedInviteId] = useState("");
  const [editingInviteId, setEditingInviteId] = useState("");
  const [editingPermissions, setEditingPermissions] = useState({});
  const [savingPermissions, setSavingPermissions] = useState(false);

  const previousRoleRef = useRef(inviteRole);
  useEffect(() => {
    if (previousRoleRef.current !== inviteRole) {
      setInvitePermissions({});
      previousRoleRef.current = inviteRole;
    }
  }, [inviteRole]);

  const {
    data: invitesData,
    isLoading: busy,
    error: queryError,
  } = useAdminQuery({
    queryKey: ["orgInvites", oid],
    fetcher: () => fetchOrgInvites(oid),
    enabled: Boolean(oid),
  });

  const invites = invitesData?.items || [];
  const currentInvite = normalizeCurrentInvite(invitesData?.current_invite || null, oid);

  const visibleCreatedInvite = useMemo(() => {
    const localInvite = lastCreatedInvite && toText(lastCreatedInvite.orgId) === oid ? lastCreatedInvite : null;
    if (localInvite) return localInvite;
    const sharedInvite = recentInvite && toText(recentInvite.orgId) === oid ? recentInvite : null;
    if (sharedInvite) return sharedInvite;
    return currentInvite && toText(currentInvite.orgId) === oid ? currentInvite : null;
  }, [lastCreatedInvite, recentInvite, currentInvite, oid]);

  const createInviteMutation = useAdminMutation({
    mutationFn: async (payload) => {
      const res = await apiCreateOrgInvite(oid, payload);
      if (!res.ok) throw new Error(res.error || ru.org.createInviteFailed);
      return res;
    },
    invalidateKeys: [["orgInvites", oid]],
    onSuccess: (res) => {
      setInviteEmail("");
      setInviteFullName("");
      setInviteJobTitle("");
      setInviteRole("editor");
      setInviteTtl("7");
      setInvitePermissions({});
      setLastInviteNotice(toText(res.delivery) === "email" ? ru.org.inviteForm.inviteSent : ru.org.inviteForm.inviteCreated);
      const createdInvite = {
        orgId: oid,
        key: toText(res.invite_token || res.invite_key),
        link: toText(res.invite_link),
      };
      setLastCreatedInvite(createdInvite);
      onInviteCreated?.(createdInvite);
      onChanged?.();
    },
    onError: (err) => setError(toText(err.message || ru.org.createInviteFailed)),
  });

  const regenerateInviteMutation = useAdminMutation({
    mutationFn: async (row) => {
      const email = toText(row?.email).toLowerCase();
      if (!email) throw new Error("missing email");
      const res = await apiCreateOrgInvite(oid, {
        email,
        full_name: toText(row?.full_name),
        job_title: toText(row?.job_title),
        role: toText(row?.role) || "viewer",
        ttl_days: inviteTtlDaysFromRow(row),
        regenerate: true,
      });
      if (!res.ok) throw new Error(res.error || ru.org.createInviteFailed);
      return res;
    },
    invalidateKeys: [["orgInvites", oid]],
    onSuccess: (res) => {
      setLastInviteNotice("Инвайт перевыпущен.");
      const createdInvite = {
        orgId: oid,
        key: toText(res.invite_token || res.invite_key),
        link: toText(res.invite_link),
      };
      setLastCreatedInvite(createdInvite);
      onInviteCreated?.(createdInvite);
      onChanged?.();
    },
    onError: (err) => setError(toText(err.message || ru.org.createInviteFailed)),
  });

  const revokeInviteMutation = useAdminMutation({
    mutationFn: async (inviteId) => {
      const iid = toText(inviteId);
      if (!iid) throw new Error("missing invite_id");
      const res = await apiRevokeOrgInvite(oid, iid);
      if (!res.ok) throw new Error(res.error || ru.org.revokeInviteFailed);
      return res;
    },
    invalidateKeys: [["orgInvites", oid]],
    onSuccess: () => {
      setEditingInviteId("");
      onChanged?.();
    },
    onError: (err) => setError(toText(err.message || ru.org.revokeInviteFailed)),
  });

  const patchInvitePermissionsMutation = useAdminMutation({
    mutationFn: async ({ inviteId, permissions }) => {
      const res = await apiAdminPatchInvitePermissions(inviteId, permissions);
      if (!res.ok) throw new Error(res.error || "Не удалось сохранить права инвайта");
      return res;
    },
    invalidateKeys: [["orgInvites", oid]],
    onSuccess: () => {
      setEditingInviteId("");
      setEditingPermissions({});
    },
    onError: (err) => setError(toText(err.message || "Не удалось сохранить права инвайта")),
  });

  async function handleCreateInvite(event) {
    event.preventDefault();
    if (!canManageInvites || !oid) return;
    setError("");
    setCopyState("");
    setLastInviteNotice("");
    setLastCreatedInvite(null);

    const payload = {
      email: inviteEmail,
      full_name: inviteFullName,
      job_title: inviteJobTitle,
      role: inviteRole,
      ttl_days: Number(inviteTtl || 7),
      regenerate: false,
    };
    const effectiveDefaults = invitePermissionDefaults(inviteRole);
    const overrides = Object.entries(invitePermissions || {}).reduce((acc, [key, value]) => {
      if (value !== effectiveDefaults[key]) acc[key] = value === true;
      return acc;
    }, {});
    if (Object.keys(overrides).length > 0) {
      payload.permissions = overrides;
    }

    await createInviteMutation.mutateAsync(payload);
  }

  async function handleRegenerateInvite(row) {
    if (!canManageInvites || !oid) return;
    if (typeof window !== "undefined" && !window.confirm("Перевыпустить текущий инвайт для этого email?")) return;
    setError("");
    setCopyState("");
    await regenerateInviteMutation.mutateAsync(row);
  }

  async function handleRevokeInvite(inviteId) {
    if (!canManageInvites || !oid) return;
    if (typeof window !== "undefined" && !window.confirm(ru.org.revokeConfirm)) return;
    setError("");
    await revokeInviteMutation.mutateAsync(inviteId);
  }

  async function handleCopy(value) {
    const ok = await copyInviteValue(value);
    setCopyState(ok ? "copied" : "");
  }

  async function startEditingPermissions(invite) {
    const iid = toText(invite?.id);
    if (!iid) return;
    setExpandedInviteId(iid);
    setEditingInviteId(iid);
    setEditingPermissions({});
    setSavingPermissions(true);
    const res = await apiAdminGetInvitePermissions(iid);
    setSavingPermissions(false);
    if (res.ok && res.data?.permissions) {
      setEditingPermissions(res.data.permissions);
    } else if (invite?.permissions && typeof invite.permissions === "object") {
      setEditingPermissions(invite.permissions);
    } else {
      setEditingPermissions(invitePermissionDefaults(invite?.role));
    }
  }

  async function saveEditingPermissions() {
    await patchInvitePermissionsMutation.mutateAsync({
      inviteId: editingInviteId,
      permissions: editingPermissions,
    });
    setSavingPermissions(false);
  }

  function cancelEditingPermissions() {
    setEditingInviteId("");
    setEditingPermissions({});
  }

  return (
    <SectionCard
      eyebrow={ru.admin.orgsPage.invites.eyebrow}
      title={ru.admin.orgsPage.invites.title}
      subtitle={ru.admin.orgsPage.invites.subtitle}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-medium text-slate-950">{ru.admin.orgsPage.invites.activeOrgLabel}:</span>
          <span>{activeOrgLabel || ru.admin.orgsPage.invites.emptyOrg}</span>
          {activeOrgLabel ? <StatusPill status={formatRoleWithScope(effectiveRole, { isAdmin })} tone="default" compact /> : null}
        </div>

        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
        {queryError ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{queryError.message}</div> : null}
        {busy ? <div className="text-xs text-slate-500">{ru.common.loading}</div> : null}

        {!oid ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-xs text-slate-500">
            {ru.admin.orgsPage.invites.emptyOrg}
          </div>
        ) : null}

        {oid && canManageInvites ? (
          <InviteInlineForm
            activeOrgLabel={activeOrgLabel}
            canManage={canManageInvites}
            email={inviteEmail}
            setEmail={setInviteEmail}
            fullName={inviteFullName}
            setFullName={setInviteFullName}
            jobTitle={inviteJobTitle}
            setJobTitle={setInviteJobTitle}
            role={inviteRole}
            setRole={setInviteRole}
            ttl={inviteTtl}
            setTtl={setInviteTtl}
            permissions={invitePermissions}
            setPermissions={setInvitePermissions}
            onSubmit={handleCreateInvite}
            isPending={createInviteMutation.isPending}
          />
        ) : null}

        {oid && !canManageInvites ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            {ru.admin.orgsPage.invites.noRights}
          </div>
        ) : null}

        {lastInviteNotice ? (
          <div className="rounded-lg border border-slate-200 px-4 py-3 text-xs text-slate-600">{lastInviteNotice}</div>
        ) : null}

        {visibleCreatedInvite && (toText(visibleCreatedInvite.key) || toText(visibleCreatedInvite.link)) ? (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            {toText(visibleCreatedInvite.key) ? (
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{ru.org.inviteForm.inviteKeyLabel}</div>
                <div className="flex flex-col gap-2 md:flex-row">
                  <input className="input h-8 min-h-0 w-full py-1 text-xs" type="text" value={toText(visibleCreatedInvite.key)} readOnly />
                  <button type="button" className="secondaryBtn h-8 min-h-0 whitespace-nowrap rounded-lg px-3 py-0 text-xs" onClick={() => void handleCopy(visibleCreatedInvite.key)}>
                    {copyState === "copied" ? ru.common.copied : ru.org.inviteForm.copyButton}
                  </button>
                </div>
              </div>
            ) : null}
            {toText(visibleCreatedInvite.link) ? (
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{ru.org.inviteForm.inviteLinkLabel}</div>
                <div className="flex flex-col gap-2 md:flex-row">
                  <input className="input h-8 min-h-0 w-full py-1 text-xs" type="text" value={toText(visibleCreatedInvite.link)} readOnly />
                  <button type="button" className="secondaryBtn h-8 min-h-0 whitespace-nowrap rounded-lg px-3 py-0 text-xs" onClick={() => void handleCopy(visibleCreatedInvite.link)}>
                    {copyState === "copied" ? ru.common.copied : ru.org.inviteForm.copyLinkButton}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <InvitesTable
          items={invites}
          canManage={canManageInvites}
          onRegenerate={handleRegenerateInvite}
          onRevoke={handleRevokeInvite}
          expandedInviteId={expandedInviteId}
          setExpandedInviteId={setExpandedInviteId}
          editingInviteId={editingInviteId}
          editingPermissions={editingPermissions}
          savingPermissions={savingPermissions}
          onStartEditPermissions={startEditingPermissions}
          onSavePermissions={saveEditingPermissions}
          onCancelPermissions={cancelEditingPermissions}
          onChangeEditingPermissions={setEditingPermissions}
          revokePending={revokeInviteMutation.isPending}
          regeneratePending={regenerateInviteMutation.isPending}
          patchPending={patchInvitePermissionsMutation.isPending}
        />
      </div>
    </SectionCard>
  );
}
