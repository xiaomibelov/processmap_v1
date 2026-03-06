import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatDurationSeconds, formatTs, toInt, toText } from "../../utils/adminFormat";

export default function JobsTable({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <SectionCard title="Jobs Table" subtitle="Retries, lock busy, duration, and last error" eyebrow="List">
      <div className="overflow-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <tr>
              <th className="px-3 py-3">Job</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Session</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Run ID</th>
              <th className="px-3 py-3">Retries</th>
              <th className="px-3 py-3">Lock Busy</th>
              <th className="px-3 py-3">Duration</th>
              <th className="px-3 py-3">Last Error</th>
              <th className="px-3 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={toText(row?.job_id)} className="border-t border-slate-100">
                <td className="px-3 py-3 font-medium text-slate-950">{toText(row?.job_id)}</td>
                <td className="px-3 py-3 text-slate-600">{toText(row?.job_type)}</td>
                <td className="px-3 py-3 text-slate-600">{toText(row?.session_id || "—")}</td>
                <td className="px-3 py-3"><StatusPill status={row?.status} /></td>
                <td className="px-3 py-3 text-slate-500">{toText(row?.run_id || "—")}</td>
                <td className="px-3 py-3 text-slate-500">{toInt(row?.retries, 0)}</td>
                <td className="px-3 py-3 text-slate-500">{toInt(row?.lock_busy, 0)}</td>
                <td className="px-3 py-3 text-slate-500">{formatDurationSeconds(row?.duration_s)}</td>
                <td className="px-3 py-3 text-xs text-slate-500">{toText(row?.last_error || "—")}</td>
                <td className="px-3 py-3 text-slate-500">{formatTs(row?.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

