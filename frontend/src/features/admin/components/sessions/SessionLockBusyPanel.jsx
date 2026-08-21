import SectionCard from "../common/SectionCard";
import { asArray } from "../../utils/adminFormat";

export default function SessionLockBusyPanel({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <SectionCard title="Lock Busy History" subtitle="409/423 contention diagnostics" eyebrow="Contention">
      <div className="space-y-2">
        {rows.length ? rows.map((row, idx) => (
          <div key={`lock_${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            {typeof row === "object" ? JSON.stringify(row) : String(row)}
          </div>
        )) : <div className="text-sm text-slate-500">No lock-busy history rows.</div>}
      </div>
    </SectionCard>
  );
}

