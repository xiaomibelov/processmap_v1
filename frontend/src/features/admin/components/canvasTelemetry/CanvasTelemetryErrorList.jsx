import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

const ERROR_CLASS_TONE = {
  ops_422: "danger",
  ops_409: "warn",
  network: "default",
  timeout: "warn",
  non_finite_di: "warn",
  unknown: "default",
};

function shortText(value, fallback = "—") {
  const text = toText(value);
  if (!text) return fallback;
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

export default function CanvasTelemetryErrorList({
  items = [],
  selectedGroupId = "",
  onOpenContext,
}) {
  const rows = asArray(items);
  return (
    <SectionCard
      title={ru.admin.canvasTelemetryPage.list.title}
      subtitle={ru.admin.canvasTelemetryPage.list.subtitle}
      eyebrow={ru.admin.common.listEyebrow}
    >
      {rows.length ? (
        <div className="overflow-auto" data-testid="canvas-telemetry-error-list">
          <table className="w-full min-w-[1180px] border-collapse text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
              <tr>
                <th className="px-3 py-3">{ru.admin.canvasTelemetryPage.list.lastSeen}</th>
                <th className="px-3 py-3">{ru.admin.canvasTelemetryPage.list.session}</th>
                <th className="px-3 py-3">{ru.admin.canvasTelemetryPage.list.user}</th>
                <th className="px-3 py-3">{ru.admin.canvasTelemetryPage.list.errorClass}</th>
                <th className="px-3 py-3">{ru.admin.canvasTelemetryPage.list.errorCode}</th>
                <th className="px-3 py-3">{ru.admin.canvasTelemetryPage.list.opType}</th>
                <th className="px-3 py-3">{ru.admin.canvasTelemetryPage.list.count}</th>
                <th className="px-3 py-3">{ru.admin.canvasTelemetryPage.list.converged}</th>
                <th className="px-3 py-3">{ru.admin.canvasTelemetryPage.list.message}</th>
                <th className="px-3 py-3">{ru.admin.canvasTelemetryPage.list.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const groupId = toText(row?.id);
                const sessionId = toText(row?.session_id);
                const projectId = toText(row?.project_id);
                const converged = Number(row?.converged || 0) === 1;
                const sessionUrl = `/?session=${encodeURIComponent(sessionId)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`;
                return (
                  <tr
                    key={groupId || `${sessionId}-${formatTs(row?.last_seen)}`}
                    className={`border-t border-slate-100 ${selectedGroupId === groupId ? "bg-slate-50" : ""}`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{formatTs(row?.last_seen)}</td>
                    <td className="px-3 py-2">
                      <a
                        href={sessionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-700 hover:underline"
                        title={ru.admin.canvasTelemetryPage.list.openSession}
                      >
                        {shortText(sessionId, "—")}
                      </a>
                    </td>
                    <td className="px-3 py-2">{shortText(row?.user_id)}</td>
                    <td className="px-3 py-2">
                      <StatusPill
                        compact
                        status={toText(row?.error_class) || "unknown"}
                        tone={ERROR_CLASS_TONE[toText(row?.error_class)] || "default"}
                      />
                    </td>
                    <td className="px-3 py-2">{shortText(row?.error_code)}</td>
                    <td className="px-3 py-2">{shortText(row?.op_type)}</td>
                    <td className="px-3 py-2">{Number(row?.count || 0)}</td>
                    <td className="px-3 py-2">
                      <StatusPill
                        compact
                        status={converged
                          ? ru.admin.canvasTelemetryPage.list.convergedYes
                          : ru.admin.canvasTelemetryPage.list.convergedNo}
                        tone={converged ? "ok" : "danger"}
                      />
                    </td>
                    <td className="px-3 py-2">{shortText(row?.message)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-sky-700 hover:underline"
                        onClick={() => onOpenContext?.(groupId)}
                      >
                        {ru.admin.canvasTelemetryPage.list.openContext}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{ru.admin.canvasTelemetryPage.list.empty}</p>
      )}
    </SectionCard>
  );
}
