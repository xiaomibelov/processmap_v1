import { useEffect, useState } from "react";
import { apiPatchOrg } from "../../../../lib/api";
import StatusPill from "../common/StatusPill";
import { formatRoleWithScope } from "../../adminRoles";
import { toText } from "../../utils/adminFormat";

function CountItem({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-950">{Number(value || 0)}</div>
    </div>
  );
}

export default function AdminOrgDetailPanel({
  org = null,
  activeOrgId = "",
  activeOrgRole = "",
  isAdmin = false,
  onSaved,
}) {
  const orgId = toText(org?.org_id || org?.id);
  const isActive = orgId && orgId === toText(activeOrgId);
  const canEdit = isAdmin || ["org_owner", "org_admin"].includes(String(activeOrgRole || "").toLowerCase());

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setName(toText(org?.name || org?.org_name || org?.org_id || org?.id));
    setError("");
    setSuccess("");
  }, [org]);

  if (!org || !orgId) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
        Выберите организацию из таблицы, чтобы увидеть детали.
      </div>
    );
  }

  async function handleSave(event) {
    event?.preventDefault?.();
    const nextName = String(name || "").trim();
    if (!nextName) {
      setError("Введите название организации");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    const res = await apiPatchOrg(orgId, { name: nextName });
    setBusy(false);
    if (!res.ok) {
      setError(String(res.error || "Не удалось обновить организацию"));
      return;
    }
    setSuccess("Название организации обновлено.");
    onSaved?.();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Детали организации</div>
          <h3 className="mt-1 text-base font-semibold text-slate-950">{toText(org?.name || org?.org_name || orgId)}</h3>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={formatRoleWithScope(org?.role, { isAdmin: toText(org?.role) === "platform_admin" })} tone="default" compact />
          {isActive ? <StatusPill status="Текущая" tone="accent" compact /> : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <CountItem label="Участники" value={org?.members_count} />
        <CountItem label="Проекты" value={org?.projects_count} />
        <CountItem label="Активные сессии" value={org?.active_sessions_count} />
        <CountItem label="Инвайты" value={org?.pending_invites_count} />
      </div>

      <form className="mt-3 space-y-2" onSubmit={handleSave}>
        <label>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Название организации</div>
          <input
            className="input h-9 min-h-0 w-full py-1.5 text-sm"
            type="text"
            value={name}
            disabled={!canEdit || busy}
            onChange={(e) => { setName(e.target.value); setError(""); setSuccess(""); }}
            required
          />
        </label>
        <div className="text-[10px] text-slate-400">ID: {orgId}</div>
        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        {success ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
        {canEdit ? (
          <button type="submit" className="secondaryBtn h-9 min-h-0 px-3 py-0 text-sm" disabled={busy || !String(name || "").trim()}>
            {busy ? "Сохранение…" : "Сохранить название"}
          </button>
        ) : (
          <div className="text-xs text-slate-500">Недостаточно прав для изменения названия.</div>
        )}
      </form>
    </div>
  );
}
