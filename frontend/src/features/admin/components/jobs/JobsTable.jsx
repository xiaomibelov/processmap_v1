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
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <tr>
              <th className="px-3 py-3">{ru.admin.jobsPage.table.job}</th>
              <th className="px-3 py-3">{ru.admin.jobsPage.table.type}</th>
              <th className="px-3 py-3">{ru.admin.jobsPage.table.session}</th>
              <th className="px-3 py-3">{ru.admin.jobsPage.table.status}</th>
              <th className="px-3 py-3">{ru.admin.jobsPage.table.runId}</th>
              <th className="px-3 py-3">{ru.admin.jobsPage.table.retries}</th>
              <th className="px-3 py-3">{ru.admin.jobsPage.table.lockBusy}</th>
              <th className="px-3 py-3">{ru.admin.jobsPage.table.duration}</th>
              <th className="px-3 py-3">{ru.admin.jobsPage.table.lastError}</th>
              <th className="px-3 py-3">{ru.admin.jobsPage.table.updated}</th>
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
