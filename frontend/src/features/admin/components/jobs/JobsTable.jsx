import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatDurationSeconds, formatTs, toInt, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";
import { useMemo, useState } from "react";

// M9 — подписанные типы заданий (backend эмитит job_type="agent_analysis" из
// bpmn_meta.agent_analysis_v1; остальные типы — как есть).
const JOB_TYPE_LABELS = {
  agent_analysis: () => ru.admin.jobsPage.table.typeAgentAnalysis,
};

export default function JobsTable({
  items = [],
}) {
  const rows = asArray(items);
  const [typeFilter, setTypeFilter] = useState("all");
  const knownTypes = useMemo(
    () => [...new Set(rows.map((row) => toText(row?.job_type)).filter(Boolean))],
    [rows],
  );
  const visibleRows = typeFilter === "all" ? rows : rows.filter((row) => toText(row?.job_type) === typeFilter);
  const typeLabel = (jobType) => {
    const key = toText(jobType);
    return JOB_TYPE_LABELS[key]?.() || key;
  };
  return (
    <SectionCard title={ru.admin.jobsPage.table.title} subtitle={ru.admin.jobsPage.table.subtitle} eyebrow={ru.admin.common.listEyebrow}>
      {knownTypes.length > 1 ? (
        <label className="mb-2 flex items-center gap-2 text-xs text-slate-500" data-testid="admin-jobs-type-filter">
          <span>{ru.admin.jobsPage.table.filterLabel}</span>
          <select
            className="rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-700"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">{ru.admin.jobsPage.table.filterAll}</option>
            {knownTypes.map((jobType) => (
              <option key={jobType} value={jobType}>{typeLabel(jobType)}</option>
            ))}
          </select>
        </label>
      ) : null}
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
            {visibleRows.map((row) => (
              <tr key={toText(row?.job_id)} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-2 font-medium text-slate-950">{toText(row?.job_id)}</td>
                <td className="px-2 py-2 text-slate-600" data-testid="admin-jobs-type">{typeLabel(row?.job_type)}</td>
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
