import { useCallback, useEffect, useMemo, useState } from "react";
import { apiCreateOrgInvite, apiListOrgInvites, apiRevokeOrgInvite } from "../../../../lib/api";
import { ru, trStatusInvite } from "../../../../shared/i18n/ru";
import { formatRoleWithScope, toUserFacingRoleLabel } from "../../adminRoles";
import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toText } from "../../utils/adminFormat";
import { INVITE_ROLE_OPTIONS } from "../../../../features/workspace/workspacePermissions";

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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invites, setInvites] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteJobTitle, setInviteJobTitle] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviteTtl, setInviteTtl] = useState("7");
  const [lastInviteNotice, setLastInviteNotice] = useState("");
  const [lastCreatedInvite, setLastCreatedInvite] = useState(null);
  const [copyState, setCopyState] = useState("");
  const visibleCreatedInvite = useMemo(() => {
    const localInvite = lastCreatedInvite && toText(lastCreatedInvite.orgId) === oid ? lastCreatedInvite : null;
    if (localInvite) return localInvite;
    const sharedInvite = recentInvite && toText(recentInvite.orgId) === oid ? recentInvite : null;
    return sharedInvite;
  }, [lastCreatedInvite, recentInvite, oid]);

  const loadInvites = useCallback(async () => {
    if (!oid) {
      setInvites([]);
      return;
    }
    setBusy(true);
    setError("");
    const res = await apiListOrgInvites(oid);
    if (!res.ok) {
      setInvites([]);
      setError(toText(res.error || ru.org.invitesLoadFailed));
      setBusy(false);
      return;
    }
    setInvites(Array.isArray(res.items) ? res.items : []);
    setBusy(false);
  }, [oid]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  async function handleCreateInvite(event) {
    event.preventDefault();
    if (!canManageInvites || !oid) return;
    setError("");
    setCopyState("");
    setLastInviteNotice("");
    setLastCreatedInvite(null);
    const res = await apiCreateOrgInvite(oid, {
      email: inviteEmail,
      full_name: inviteFullName,
      job_title: inviteJobTitle,
      role: inviteRole,
      ttl_days: Number(inviteTtl || 7),
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
    const createdInvite = {
      orgId: oid,
      key: toText(res.invite_token || res.invite_key),
      link: toText(res.invite_link),
    };
    setLastCreatedInvite(createdInvite);
    onInviteCreated?.(createdInvite);
    await loadInvites();
    onChanged?.();
  }

  async function handleRevokeInvite(inviteId) {
    if (!canManageInvites || !oid) return;
    const iid = toText(inviteId);
    if (!iid) return;
    if (typeof window !== "undefined" && !window.confirm(ru.org.revokeConfirm)) return;
    setError("");
    const res = await apiRevokeOrgInvite(oid, iid);
    if (!res.ok) {
      setError(toText(res.error || ru.org.revokeInviteFailed));
      return;
    }
    await loadInvites();
    onChanged?.();
  }

  async function handleCopy(value) {
    const ok = await copyInviteValue(value);
    setCopyState(ok ? "copied" : "");
  }

  return (
    <SectionCard
      eyebrow={ru.admin.orgsPage.invites.eyebrow}
      title={ru.admin.orgsPage.invites.title}
      subtitle={ru.admin.orgsPage.invites.subtitle}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-950">{ru.admin.orgsPage.invites.activeOrgLabel}:</span>
          <span>{activeOrgLabel || ru.admin.orgsPage.invites.emptyOrg}</span>
          {activeOrgLabel ? <StatusPill status={formatRoleWithScope(effectiveRole, { isAdmin })} tone="default" /> : null}
        </div>

        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        {busy ? <div className="text-sm text-slate-500">{ru.common.loading}</div> : null}

        {!oid ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            {ru.admin.orgsPage.invites.emptyOrg}
          </div>
        ) : null}

        {oid && canManageInvites ? (
          <form className="grid grid-cols-1 gap-3 rounded-[22px] border border-slate-200 bg-slate-50 p-4 md:grid-cols-12" onSubmit={handleCreateInvite}>
            <label className="md:col-span-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Организация</div>
              <input className="input w-full" type="text" value={activeOrgLabel} disabled />
            </label>
            <label className="md:col-span-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Email</div>
              <input
                className="input w-full"
                type="email"
                placeholder={ru.org.inviteForm.emailPlaceholder}
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                required
              />
            </label>
            <label className="md:col-span-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Имя</div>
              <input
                className="input w-full"
                type="text"
                placeholder={ru.org.inviteForm.fullNamePlaceholder}
                value={inviteFullName}
                onChange={(event) => setInviteFullName(event.target.value)}
              />
            </label>
            <label className="md:col-span-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Должность</div>
              <input
                className="input w-full"
                type="text"
                placeholder={ru.org.inviteForm.jobTitlePlaceholder}
                value={inviteJobTitle}
                onChange={(event) => setInviteJobTitle(event.target.value)}
              />
            </label>
            <label className="md:col-span-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Роль</div>
              <select
                className="input w-full"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value)}
              >
                {INVITE_ROLE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Срок действия, дней</div>
              <input
                className="input w-full"
                type="number"
                min="1"
                max="60"
                placeholder={ru.org.inviteForm.expiresPlaceholder}
                value={inviteTtl}
                onChange={(event) => setInviteTtl(event.target.value)}
              />
            </label>
            <div className="md:col-span-2 flex items-end">
              <button type="submit" className="primaryBtn w-full">{ru.org.inviteForm.createButton}</button>
            </div>
            <div className="md:col-span-12 text-xs text-slate-500">
              {ru.org.noInviteCreateHint}
            </div>
          </form>
        ) : null}

        {oid && !canManageInvites ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            {ru.admin.orgsPage.invites.noRights}
          </div>
        ) : null}

        {lastInviteNotice ? (
          <div className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
            {lastInviteNotice}
          </div>
        ) : null}

        {visibleCreatedInvite && (toText(visibleCreatedInvite.key) || toText(visibleCreatedInvite.link)) ? (
          <div className="space-y-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
            {toText(visibleCreatedInvite.key) ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ru.org.inviteForm.inviteKeyLabel}</div>
                <div className="flex flex-col gap-2 md:flex-row">
                  <input className="input w-full" type="text" value={toText(visibleCreatedInvite.key)} readOnly />
                  <button type="button" className="secondaryBtn whitespace-nowrap" onClick={() => void handleCopy(visibleCreatedInvite.key)}>
                    {copyState === "copied" ? ru.common.copied : ru.org.inviteForm.copyButton}
                  </button>
                </div>
              </div>
            ) : null}

            {toText(visibleCreatedInvite.link) ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ru.org.inviteForm.inviteLinkLabel}</div>
                <div className="flex flex-col gap-2 md:flex-row">
                  <input className="input w-full" type="text" value={toText(visibleCreatedInvite.link)} readOnly />
                  <button type="button" className="secondaryBtn whitespace-nowrap" onClick={() => void handleCopy(visibleCreatedInvite.link)}>
                    {copyState === "copied" ? ru.common.copied : ru.org.inviteForm.copyLinkButton}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="overflow-auto rounded-[22px] border border-slate-200">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
              <tr>
                <th className="px-3 py-3">{ru.org.inviteTable.email}</th>
                <th className="px-3 py-3">{ru.org.inviteTable.fullName}</th>
                <th className="px-3 py-3">{ru.org.inviteTable.jobTitle}</th>
                <th className="px-3 py-3">Роль</th>
                <th className="px-3 py-3">{ru.org.inviteTable.status}</th>
                <th className="px-3 py-3">{ru.org.inviteTable.createdAt}</th>
                <th className="px-3 py-3">{ru.org.inviteTable.expiresAt}</th>
                <th className="px-3 py-3">{ru.org.inviteTable.usedAt}</th>
                <th className="px-3 py-3">{ru.org.inviteTable.action}</th>
              </tr>
            </thead>
            <tbody>
              {invites.length === 0 ? (
                <tr>
                  <td className="px-3 py-5 text-sm text-slate-500" colSpan={9}>{ru.org.inviteTable.empty}</td>
                </tr>
              ) : null}
              {invites.map((row) => {
                const inviteId = toText(row?.id);
                const status = toText(row?.status);
                const isPending = status === "pending";
                return (
                  <tr key={inviteId} className="border-t border-slate-100">
                    <td className="px-3 py-3 text-slate-950">{toText(row?.email) || ru.common.unknown}</td>
                    <td className="px-3 py-3 text-slate-600">{toText(row?.full_name) || ru.common.unknown}</td>
                    <td className="px-3 py-3 text-slate-600">{toText(row?.job_title) || ru.common.unknown}</td>
                    <td className="px-3 py-3 text-slate-600">{toUserFacingRoleLabel(row?.role)}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={trStatusInvite(status)} tone={inviteTone(status)} />
                    </td>
                    <td className="px-3 py-3 text-slate-500">{formatTs(row?.created_at)}</td>
                    <td className="px-3 py-3 text-slate-500">{formatTs(row?.expires_at)}</td>
                    <td className="px-3 py-3 text-slate-500">{formatTs(row?.used_at || row?.accepted_at)}</td>
                    <td className="px-3 py-3">
                      {canManageInvites && isPending ? (
                        <button type="button" className="secondaryBtn h-8 min-h-0 px-3 py-0 text-xs" onClick={() => void handleRevokeInvite(inviteId)}>
                          {ru.common.revoke}
                        </button>
                      ) : (
                        <span className="text-slate-400">{ru.common.notAvailable}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}
