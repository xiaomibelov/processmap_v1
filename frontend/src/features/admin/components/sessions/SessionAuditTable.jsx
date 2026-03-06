import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toText } from "../../utils/adminFormat";

export default function SessionAuditTable({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <SectionCard title="Session Audit" subtitle="Per-session event history" eyebrow="Trace">
      <div className="space-y-3">
        {rows.length ? rows.map((row, idx) => (
          <div key={`${toText(row?.id)}_${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-slate-950">{toText(row?.action || "action")}</div>
              <StatusPill status={row?.status || "ok"} />
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {toText(row?.actor_user_id || "unknown")} · {formatTs(row?.ts)}
            </div>
          </div>
        )) : (
          <div className="text-sm text-slate-500">No session audit rows.</div>
        )}
      </div>
    </SectionCard>
  );
}

