import SectionCard from "../common/SectionCard";
import { asArray, formatTs, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

function shortText(value, fallback = "—") {
  const text = toText(value);
  if (!text) return fallback;
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function describeEvent(event) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const command = payload.command && typeof payload.command === "object" ? payload.command : {};
  const op = payload.op && typeof payload.op === "object" ? payload.op : {};
  const http = payload.http && typeof payload.http === "object" ? payload.http : {};
  const error = payload.error && typeof payload.error === "object" ? payload.error : {};
  const versions = payload.versions && typeof payload.versions === "object" ? payload.versions : {};
  const ux = payload.ux && typeof payload.ux === "object" ? payload.ux : {};

  switch (event?.kind) {
    case "command":
      return {
        label: `${shortText(command.type, "command")} · ${shortText(command.action, "execute")}`,
        detail: [
          asArray(command.elementIds).join(", "),
          asArray(command.connectionIds).join(", "),
        ].filter(Boolean).join(" · "),
      };
    case "op":
    case "ack":
      return {
        label: `${event.kind === "ack" ? "ack" : "op"} · ${shortText(op.opTypes?.[0], "batch")} n=${Number(op.count || 0)}`,
        detail: [
          http.status ? `HTTP ${http.status} ${Number(http.latencyMs || 0)}ms` : "",
          versions.serverAck != null ? `server=${versions.serverAck}` : "",
        ].filter(Boolean).join(" · "),
      };
    case "error":
      return {
        label: `error · ${shortText(error.code, "unknown")}`,
        detail: [
          http.status ? `HTTP ${http.status} ${Number(http.latencyMs || 0)}ms` : "",
          shortText(error.reason || error.message),
        ].filter(Boolean).join(" · "),
      };
    case "save_status":
      return {
        label: `save_status · ${shortText(ux.opsStage || ux.state, "—")}`,
        detail: shortText(error.reason),
      };
    case "pageerror":
      return {
        label: `pageerror · ${shortText(error.message)}`,
        detail: shortText(error.filename),
      };
    default:
      return { label: shortText(event?.kind, "event"), detail: "" };
  }
}

export default function CanvasTelemetryTimeline({ timeline = [], sessionUrl = "" }) {
  const rows = asArray(timeline);
  return (
    <SectionCard
      title={ru.admin.canvasTelemetryPage.timeline.title}
      subtitle={ru.admin.canvasTelemetryPage.timeline.subtitle}
      eyebrow={ru.admin.common.listEyebrow}
    >
      {sessionUrl ? (
        <a href={sessionUrl} target="_blank" rel="noreferrer" className="mb-3 inline-block text-sm text-sky-700 hover:underline">
          {ru.admin.canvasTelemetryPage.timeline.openSession}
        </a>
      ) : null}
      <ol className="space-y-1" data-testid="canvas-telemetry-timeline">
        {rows.map((event, index) => {
          const { label, detail } = describeEvent(event);
          const isError = event?.kind === "error" || event?.kind === "pageerror";
          return (
            <li
              key={`${event?.event_id || index}-${index}`}
              className={`flex flex-wrap items-baseline gap-x-3 rounded px-2 py-1 text-sm ${isError ? "bg-rose-50 text-rose-900" : "text-slate-700"}`}
            >
              <span className="whitespace-nowrap font-mono text-xs text-slate-400">{formatTs(event?.ts)}</span>
              <span className="whitespace-nowrap font-semibold">{label}</span>
              {detail ? <span className="break-all text-slate-500">{detail}</span> : null}
            </li>
          );
        })}
      </ol>
      {!rows.length ? (
        <p className="text-sm text-slate-500">{ru.admin.canvasTelemetryPage.timeline.empty}</p>
      ) : null}
    </SectionCard>
  );
}
