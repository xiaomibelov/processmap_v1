import { formatRoleWithScope } from "../adminRoles";
import { toText } from "../adminUtils";
import { ru } from "../../../shared/i18n/ru";

function ContextBadge({ label, value, tone = "default" }) {
  const toneClass = (
    tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "ok"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-950"
  );
  return (
    <div className={`inline-flex min-w-0 items-center gap-1.5 rounded-md border-0 px-2 py-1 text-xs ${toneClass}`}>
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}

export default function AdminTopbar({
  user,
  orgs = [],
  activeOrgId = "",
  onOrgChange,
  onNavigate,
  redisMode = "UNKNOWN",
}) {
  const currentOrg = (Array.isArray(orgs) ? orgs : []).find((item) => toText(item?.org_id || item?.id) === toText(activeOrgId));
  const currentOrgLabel = toText(currentOrg?.name || currentOrg?.org_name || activeOrgId) || "—";
  const userLabel = toText(user?.email || user?.name || user?.id) || "—";
  const redisNormalized = toText(redisMode).toLowerCase();
  const redisTone = (
    redisNormalized === "error" || redisNormalized === "incident" || redisNormalized === "misconfigured"
      ? "danger"
      : redisNormalized === "fallback" || redisNormalized === "off" || redisNormalized === "degraded"
        ? "warn"
        : "ok"
  );
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/95 px-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <ContextBadge label={ru.admin.topbar.org} value={currentOrgLabel} />
        <ContextBadge label="Система" value={`Redis ${toText(redisMode) || "UNKNOWN"}`} tone={redisTone} />
        <ContextBadge label={ru.admin.topbar.user} value={userLabel} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <select
          id="admin-org-context"
          className="select h-8 min-h-0 rounded-lg border-slate-200 bg-white px-2 text-xs"
          value={toText(activeOrgId)}
          onChange={(event) => onOrgChange?.(event.target.value)}
          data-testid="admin-org-select"
        >
          {(Array.isArray(orgs) ? orgs : []).map((row, idx) => {
            const id = toText(row?.org_id || row?.id);
            const name = toText(row?.name || row?.org_name || id) || id;
            const role = toText(row?.role);
            return (
              <option key={`${id}_${idx}`} value={id}>
                {name}{role ? ` · ${formatRoleWithScope(role, { isAdmin: role === "platform_admin" })}` : ""}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          className="secondaryBtn h-8 min-h-0 rounded-lg px-3 py-0 text-xs"
          onClick={() => onNavigate?.("/app")}
          data-testid="admin-back-workspace"
        >
          {ru.admin.topbar.openWorkspace}
        </button>
      </div>
    </header>
  );
}
