import StatusPill from "../components/common/StatusPill";
import { toText } from "../adminUtils";

function ContextBadge({ label, value, tone = "default" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-950">{value}</div>
      {tone !== "default" ? <div className="mt-2"><StatusPill status={value} tone={tone} label={label} /></div> : null}
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
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <ContextBadge label="Org" value={currentOrgLabel} />
          <ContextBadge label="Redis" value={toText(redisMode) || "UNKNOWN"} tone={redisTone} />
          <ContextBadge label="User" value={userLabel} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500" htmlFor="admin-org-context">
            Org Context
          </label>
          <select
            id="admin-org-context"
            className="select h-11 min-h-0 rounded-2xl border-slate-200 bg-white px-3 text-sm"
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
                  {name}{role ? ` · ${role}` : ""}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            className="secondaryBtn h-11 min-h-0 rounded-2xl px-4 py-0 text-sm"
            onClick={() => onNavigate?.("/app")}
            data-testid="admin-back-workspace"
          >
            Open Workspace
          </button>
        </div>
      </div>
    </header>
  );
}
