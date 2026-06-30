import { useEffect, useState } from "react";
import { apiPatchOrg } from "../../../../lib/api";
import { apiAdminPatchOrgStatus } from "../../../../lib/apiModules/adminApi";
import AdminTabs from "../common/AdminTabs";
import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { formatRoleWithScope } from "../../adminRoles";
import { useAdminMutation } from "../../hooks/useAdminMutation";
import { toText } from "../../utils/adminFormat";
import OrgGitMirrorForm from "../gitMirror/OrgGitMirrorForm";
import OrgMembersTab from "./OrgMembersTab";

const DETAIL_TABS = [
  { id: "detail", label: "Detail" },
  { id: "members", label: "Members" },
  { id: "gitMirror", label: "Git mirror" },
  { id: "settings", label: "Settings" },
];

function CountItem({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-950">{Number(value || 0)}</div>
    </div>
  );
}

function DetailTab({ org, isAdmin, activeOrgRole, isActive, onSaved }) {
  const orgId = toText(org?.org_id || org?.id);
  const canEdit = isAdmin || ["org_owner", "org_admin"].includes(String(activeOrgRole || "").toLowerCase());
  const orgActive = org?.is_active !== false;

  const [name, setName] = useState("");
  useEffect(() => {
    setName(toText(org?.name || org?.org_name || orgId));
  }, [org, orgId]);

  const patchMutation = useAdminMutation({
    mutationFn: async (nextName) => {
      const res = await apiPatchOrg(orgId, { name: nextName });
      if (!res.ok) throw new Error(res.error || "Не удалось обновить организацию");
      return res;
    },
    invalidateKeys: [["adminOrgs"]],
    onSuccess: () => { onSaved?.(); },
  });

  const statusMutation = useAdminMutation({
    mutationFn: async (nextActive) => {
      const res = await apiAdminPatchOrgStatus(orgId, nextActive);
      if (!res.ok) throw new Error(res.error || "Не удалось изменить статус организации");
      return res;
    },
    invalidateKeys: [["adminOrgs"], ["authMe"], ["orgs"]],
    onSuccess: () => { onSaved?.(); },
  });

  async function handleSubmit(event) {
    event.preventDefault();
    const nextName = String(name || "").trim();
    if (!nextName) return;
    await patchMutation.mutateAsync(nextName);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Детали организации</div>
          <h3 className="mt-1 text-sm font-semibold text-slate-950">{toText(org?.name || org?.org_name || orgId)}</h3>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={formatRoleWithScope(org?.role, { isAdmin: toText(org?.role) === "platform_admin" })} tone="default" compact />
          {isActive ? <StatusPill status="Текущая" tone="accent" compact /> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <CountItem label="Участники" value={org?.members_count} />
        <CountItem label="Проекты" value={org?.projects_count} />
        <CountItem label="Активные сессии" value={org?.active_sessions_count} />
        <CountItem label="Инвайты" value={org?.pending_invites_count} />
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-xs font-medium text-slate-600">Статус организации</span>
        {isAdmin ? (
          <button
            type="button"
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${orgActive ? "bg-emerald-500" : "bg-slate-300"}`}
            onClick={() => statusMutation.mutate(!orgActive)}
            disabled={statusMutation.isPending}
            aria-pressed={orgActive}
          >
            <span
              className="inline-block h-3.5 w-3.5 rounded-full bg-white transition"
              style={{ transform: orgActive ? "translateX(16px)" : "translateX(2px)" }}
            />
          </button>
        ) : null}
        <span className={`text-xs font-medium ${orgActive ? "text-emerald-700" : "text-slate-500"}`}>
          {orgActive ? "Активна" : "Неактивна"}
        </span>
        {statusMutation.isPending ? <span className="text-xs text-slate-400">Сохранение…</span> : null}
      </div>
      <form className="space-y-2" onSubmit={handleSubmit}>
        <label>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Название организации</div>
          <input
            className="input h-8 min-h-0 w-full py-1 text-xs"
            type="text"
            value={name}
            disabled={!canEdit || patchMutation.isPending}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        {canEdit ? (
          <button type="submit" className="secondaryBtn h-7 min-h-0 rounded-lg px-3 py-0 text-xs" disabled={patchMutation.isPending || !String(name || "").trim()}>
            {patchMutation.isPending ? "Сохранение…" : "Сохранить название"}
          </button>
        ) : (
          <div className="text-xs text-slate-500">Недостаточно прав для изменения названия.</div>
        )}
      </form>
    </div>
  );
}

function SettingsTab({ org }) {
  const orgId = toText(org?.org_id || org?.id);
  return (
    <SectionCard eyebrow="Settings" title="Организация" subtitle="Служебная информация.">
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-2"><span className="text-slate-500">ID</span><span className="font-medium text-slate-950">{orgId}</span></div>
        <div className="flex justify-between gap-2"><span className="text-slate-500">Название</span><span className="font-medium text-slate-950">{toText(org?.name || org?.org_name) || "—"}</span></div>
        <div className="flex justify-between gap-2"><span className="text-slate-500">Роль</span><span className="font-medium text-slate-950">{formatRoleWithScope(org?.role)}</span></div>
        <div className="flex justify-between gap-2"><span className="text-slate-500">Текущий контекст</span><span className="font-medium text-slate-950">{org?.is_active_context ? "Да" : "Нет"}</span></div>
      </div>
    </SectionCard>
  );
}

export default function OrgDetailTabs({ org, activeOrgId, activeOrgRole, isAdmin, onSaved }) {
  const [activeTab, setActiveTab] = useState("detail");
  const orgId = toText(org?.org_id || org?.id);
  const isActive = orgId && orgId === toText(activeOrgId);
  const canManage = isAdmin || ["org_owner", "org_admin"].includes(String(activeOrgRole || "").toLowerCase());

  return (
    <div className="space-y-2">
      <AdminTabs tabs={DETAIL_TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === "detail" ? <DetailTab org={org} isAdmin={isAdmin} activeOrgRole={activeOrgRole} isActive={isActive} onSaved={onSaved} /> : null}
      {activeTab === "members" ? <OrgMembersTab orgId={orgId} canManage={canManage} /> : null}
      {activeTab === "gitMirror" ? <OrgGitMirrorForm orgId={orgId} canManage={canManage} onSaved={onSaved} /> : null}
      {activeTab === "settings" ? <SettingsTab org={org} /> : null}
    </div>
  );
}
