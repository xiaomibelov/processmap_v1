import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toInt, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

export default function SessionsTable({
  items = [],
  onOpenSession,
}) {
  const rows = asArray(items);
  return (
    <SectionCard title={ru.admin.sessionsPage.table.title} subtitle={ru.admin.sessionsPage.table.subtitle} eyebrow={ru.admin.common.listEyebrow}>
      <div className="overflow-auto">
        <table className="w-full min-w-[1180px] border-collapse text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <tr>
              <th className="px-3 py-3">{ru.admin.sessionsPage.table.sessionId}</th>
              <th className="px-3 py-3">{ru.admin.sessionsPage.table.org}</th>
              <th className="px-3 py-3">{ru.admin.sessionsPage.table.project}</th>
              <th className="px-3 py-3">{ru.admin.sessionsPage.table.updated}</th>
              <th className="px-3 py-3">BPMN</th>
              <th className="px-3 py-3">{ru.admin.sessionsPage.table.interview}</th>
              <th className="px-3 py-3">{ru.admin.sessionsPage.table.paths}</th>
              <th className="px-3 py-3">AutoPass</th>
              <th className="px-3 py-3">{ru.admin.sessionsPage.table.reportsDoc}</th>
              <th className="px-3 py-3">Redis</th>
              <th className="px-3 py-3">{ru.admin.sessionsPage.table.warnings}</th>
              <th className="px-3 py-3">{ru.admin.sessionsPage.table.errors}</th>
              <th className="px-3 py-3">{ru.admin.sessionsPage.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={toText(row?.session_id)} className="border-t border-slate-100 align-top">
                <td className="px-3 py-3 font-medium text-slate-950">{toText(row?.session_id)}</td>
                <td className="px-3 py-3 text-slate-600">{toText(row?.org_name || row?.org_id || "—")}</td>
                <td className="px-3 py-3 text-slate-600">{toText(row?.project_name || row?.project_id || "—")}</td>
                <td className="px-3 py-3 text-slate-500">{formatTs(row?.updated_at)}</td>
                <td className="px-3 py-3"><StatusPill status={row?.bpmn_status} tone={toText(row?.bpmn_status) === "ok" ? "ok" : "warn"} /></td>
                <td className="px-3 py-3"><StatusPill status={row?.interview_status} tone={toText(row?.interview_status) === "ok" ? "ok" : "warn"} /></td>
                <td className="px-3 py-3"><StatusPill status={row?.paths_status} tone={toText(row?.paths_status) === "ok" ? "ok" : "warn"} /></td>
                <td className="px-3 py-3"><StatusPill status={row?.autopass_status} /></td>
                <td className="px-3 py-3"><StatusPill status={row?.reports_doc_status} tone={toText(row?.reports_doc_status) === "ok" ? "ok" : "warn"} /></td>
                <td className="px-3 py-3">
                  <StatusPill
                    status={row?.redis_mode}
                    tone={(
                      toText(row?.redis_mode).toLowerCase() === "error"
                        ? "danger"
                        : toText(row?.redis_mode).toLowerCase() === "fallback"
                          ? "warn"
                          : "ok"
                    )}
                  />
                </td>
                <td className="px-3 py-3"><StatusPill status={String(toInt(row?.warnings_count, 0))} tone={toInt(row?.warnings_count, 0) > 0 ? "warn" : "default"} /></td>
                <td className="px-3 py-3"><StatusPill status={String(toInt(row?.errors_count, 0))} tone={toInt(row?.errors_count, 0) > 0 ? "danger" : "default"} /></td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    className="secondaryBtn h-9 min-h-0 rounded-2xl px-3 py-0 text-xs"
                    onClick={() => onOpenSession?.(toText(row?.session_id))}
                  >
                    {ru.admin.sessionsPage.table.openDetail}
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={13} className="px-3 py-10 text-center text-sm text-slate-500">
                  {ru.admin.sessionsPage.table.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
