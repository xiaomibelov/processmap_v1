import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

function shortText(value, fallback = "—") {
  const text = toText(value);
  if (!text) return fallback;
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

export default function TelemetryEventsTimeline({
  items = [],
  selectedEventId = "",
  onOpenDetail,
}) {
  const rows = asArray(items);
  return (
    <SectionCard
      title={ru.admin.telemetryPage.timeline.title}
      subtitle={ru.admin.telemetryPage.timeline.subtitle}
      eyebrow={ru.admin.common.listEyebrow}
    >
      {rows.length ? (
        <div className="overflow-auto" data-testid="telemetry-events-timeline">
          <table className="w-full min-w-[1280px] border-collapse text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
              <tr>
                <th className="px-3 py-3">{ru.admin.telemetryPage.timeline.occurredAt}</th>
                <th className="px-3 py-3">{ru.admin.telemetryPage.timeline.source}</th>
                <th className="px-3 py-3">{ru.admin.telemetryPage.timeline.eventType}</th>
                <th className="px-3 py-3">{ru.admin.telemetryPage.timeline.severity}</th>
                <th className="px-3 py-3">request_id</th>
                <th className="px-3 py-3">session_id</th>
                <th className="px-3 py-3">runtime_id</th>
                <th className="px-3 py-3">{ru.admin.telemetryPage.timeline.route}</th>
                <th className="px-3 py-3">{ru.admin.telemetryPage.timeline.message}</th>
                <th className="px-3 py-3">{ru.admin.telemetryPage.timeline.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const id = toText(row?.id);
                const active = id && id === toText(selectedEventId);
                const severity = toText(row?.severity || "error").toLowerCase();
                const tone = severity === "fatal" || severity === "error" ? "danger" : severity === "warn" ? "warn" : "default";
                return (
                  <tr
                    key={`${id}_${idx}`}
                    className={`border-t border-slate-100 ${active ? "bg-emerald-50/60" : ""}`}
                    data-testid={`telemetry-event-row-${id || idx}`}
                  >
                    <td className="whitespace-nowrap px-3 py-3 text-slate-500">{formatTs(row?.occurred_at)}</td>
                    <td className="px-3 py-3 font-medium text-slate-700">{toText(row?.source || "—")}</td>
                    <td className="px-3 py-3 font-medium text-slate-950">{toText(row?.event_type || "—")}</td>
                    <td className="px-3 py-3"><StatusPill status={severity || "unknown"} tone={tone} /></td>
                    <td className="max-w-[180px] truncate px-3 py-3 font-mono text-xs text-slate-600">{toText(row?.request_id || "—")}</td>
                    <td className="max-w-[180px] truncate px-3 py-3 font-mono text-xs text-slate-600">{toText(row?.session_id || "—")}</td>
                    <td className="max-w-[180px] truncate px-3 py-3 font-mono text-xs text-slate-600">{toText(row?.runtime_id || "—")}</td>
                    <td className="max-w-[220px] truncate px-3 py-3 font-mono text-xs text-slate-600">{toText(row?.route || "—")}</td>
                    <td className="max-w-[320px] px-3 py-3 text-slate-700">{shortText(row?.message)}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="secondaryBtn h-9 min-h-0 rounded-xl px-3 py-0 text-xs"
                        onClick={() => onOpenDetail?.(id)}
                        data-testid={`telemetry-open-detail-${id || idx}`}
                      >
                        {ru.admin.telemetryPage.timeline.openDetail}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500" data-testid="telemetry-empty-state">
          {ru.admin.telemetryPage.timeline.empty}
        </div>
      )}
    </SectionCard>
  );
}
