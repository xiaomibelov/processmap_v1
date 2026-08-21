import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toInt, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";
import { extractPublishGitMirrorSnapshot, getPublishGitMirrorMeta } from "../../../../shared/publishGitMirrorStatus";

function HealthGroup({ row }) {
  const items = [
    { key: "bpmn", label: "BPMN", status: row?.bpmn_status },
    { key: "interview", label: "Int", status: row?.interview_status },
    { key: "paths", label: "Paths", status: row?.paths_status },
    { key: "autopass", label: "Auto", status: row?.autopass_status },
    { key: "reports", label: "Rep", status: row?.reports_doc_status },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => {
        const status = toText(item.status);
        const tone = status === "ok" ? "ok" : status === "error" ? "danger" : "warn";
        return (
          <span
            key={item.key}
            title={`${item.label}: ${status || "—"}`}
            className={`inline-flex items-center rounded border-0 px-1.5 py-0.5 text-[10px] font-medium ${
              tone === "ok"
                ? "bg-emerald-50 text-emerald-700"
                : tone === "danger"
                  ? "bg-rose-50 text-rose-700"
                  : "bg-amber-50 text-amber-700"
            }`}
          >
            {item.label}
          </span>
        );
      })}
    </div>
  );
}

export default function SessionsTable({
  items = [],
  onOpenSession,
}) {
  const rows = asArray(items);
  return (
    <SectionCard title={ru.admin.sessionsPage.table.title} subtitle={ru.admin.sessionsPage.table.subtitle} eyebrow={ru.admin.common.listEyebrow}>
      <div className="overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-2 py-1.5 font-medium">{ru.admin.sessionsPage.table.sessionId}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.sessionsPage.table.org}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.sessionsPage.table.project}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.sessionsPage.table.updated}</th>
              <th className="px-2 py-1.5 font-medium">Git mirror</th>
              <th className="px-2 py-1.5 font-medium">Health</th>
              <th className="px-2 py-1.5 font-medium">Redis</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.sessionsPage.table.warnings}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.sessionsPage.table.errors}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.sessionsPage.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const mirrorSnapshot = extractPublishGitMirrorSnapshot(row);
              const mirrorMeta = getPublishGitMirrorMeta(mirrorSnapshot.state);
              const sessionId = toText(row?.session_id);
              return (
                <tr
                  key={sessionId}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => onOpenSession?.(sessionId)}
                >
                  <td className="px-2 py-2 font-medium text-slate-950">{sessionId}</td>
                  <td className="px-2 py-2 text-slate-600">{toText(row?.org_name || row?.org_id || "—")}</td>
                  <td className="px-2 py-2 text-slate-600">{toText(row?.project_name || row?.project_id || "—")}</td>
                  <td className="px-2 py-2 text-slate-500">{formatTs(row?.updated_at)}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1">
                      <StatusPill status={mirrorMeta.label} tone={mirrorMeta.adminTone} compact />
                      {mirrorSnapshot.versionNumber > 0 ? (
                        <span className="text-[10px] text-slate-500">v{String(mirrorSnapshot.versionNumber)}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-2 py-2"><HealthGroup row={row} /></td>
                  <td className="px-2 py-2">
                    <StatusPill
                      status={row?.redis_mode}
                      tone={(
                        toText(row?.redis_mode).toLowerCase() === "error"
                          ? "danger"
                          : toText(row?.redis_mode).toLowerCase() === "fallback"
                            ? "warn"
                            : "ok"
                      )}
                      compact
                    />
                  </td>
                  <td className="px-2 py-2"><StatusPill status={String(toInt(row?.warnings_count, 0))} tone={toInt(row?.warnings_count, 0) > 0 ? "warn" : "default"} compact /></td>
                  <td className="px-2 py-2"><StatusPill status={String(toInt(row?.errors_count, 0))} tone={toInt(row?.errors_count, 0) > 0 ? "danger" : "default"} compact /></td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      className="secondaryBtn h-7 min-h-0 rounded-lg px-2 py-0 text-[10px]"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenSession?.(sessionId);
                      }}
                    >
                      {ru.admin.sessionsPage.table.openDetail}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={10} className="px-2 py-6 text-center text-xs text-slate-500">
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
