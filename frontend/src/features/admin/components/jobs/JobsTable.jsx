import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatDurationSeconds, formatTs, toInt, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

export default function JobsTable({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <SectionCard title={ru.admin.jobsPage.table.title} subtitle={ru.admin.jobsPage.table.subtitle} eyebrow={ru.admin.common.listEyebrow}>
      <div className="overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-2 py-1.5 font-medium">{ru.admin.jobsPage.table.job}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.jobsPage.table.type}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.jobsPage.table.session}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.jobsPage.table.status}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.jobsPage.table.runId}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.jobsPage.table.retries}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.jobsPage.table.lockBusy}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.jobsPage.table.duration}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.jobsPage.table.lastError}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.jobsPage.table.updated}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={toText(row?.job_id)} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-2 font-medium text-slate-950">{toText(row?.job_id)}</td>
                <td className="px-2 py-2 text-slate-600">{toText(row?.job_type)}</td>
                <td className="px-2 py-2 text-slate-600">{toText(row?.session_id || "—")}</td>
                <td className="px-2 py-2"><StatusPill status={row?.status} compact /></td>
                <td className="px-2 py-2 text-slate-500">{toText(row?.run_id || "—")}</td>
                <td className="px-2 py-2 text-slate-500">{toInt(row?.retries, 0)}</td>
                <td className="px-2 py-2 text-slate-500">{toInt(row?.lock_busy, 0)}</td>
                <td className="px-2 py-2 text-slate-500">{formatDurationSeconds(row?.duration_s)}</td>
                <td className="px-2 py-2 text-[11px] text-slate-500">{toText(row?.last_error || "—")}</td>
                <td className="px-2 py-2 text-slate-500">{formatTs(row?.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
