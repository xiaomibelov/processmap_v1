import ErrorState from "../common/ErrorState";
import KeyValueGrid from "../common/KeyValueGrid";
import LoadingBlock from "../common/LoadingBlock";
import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asObject, formatTs, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

function jsonPreview(value) {
  try {
    return JSON.stringify(asObject(value), null, 2);
  } catch {
    return "{}";
  }
}

export default function TelemetryEventDetailPanel({
  item = null,
  selectedEventId = "",
  loading = false,
  error = "",
  onClose,
}) {
  const event = asObject(item);
  const id = toText(event?.id || selectedEventId);
  if (!id) {
    return (
      <SectionCard title={ru.admin.telemetryPage.detail.title} subtitle={ru.admin.telemetryPage.detail.pickRow}>
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500" data-testid="telemetry-detail-empty">
          {ru.admin.telemetryPage.detail.noSelection}
        </div>
      </SectionCard>
    );
  }
  if (loading) return <LoadingBlock label={ru.admin.telemetryPage.detail.loading} />;
  if (error) return <ErrorState title={ru.admin.telemetryPage.detail.errorTitle} message={error} />;

  const severity = toText(event?.severity || "error").toLowerCase();
  const tone = severity === "fatal" || severity === "error" ? "danger" : severity === "warn" ? "warn" : "default";
  return (
    <SectionCard
      title={ru.admin.telemetryPage.detail.title}
      subtitle={id}
      eyebrow={ru.admin.telemetryPage.detail.eyebrow}
      action={(
        <button
          type="button"
          className="secondaryBtn h-9 min-h-0 rounded-xl px-3 py-0 text-xs"
          onClick={() => onClose?.()}
          data-testid="telemetry-close-detail"
        >
          {ru.admin.telemetryPage.detail.close}
        </button>
      )}
    >
      <div className="space-y-4" data-testid="telemetry-event-detail">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={toText(event?.event_type || "unknown")} />
          <StatusPill status={severity || "unknown"} tone={tone} label="severity" />
          <StatusPill status={toText(event?.source || "unknown")} label="source" />
        </div>
        <KeyValueGrid
          columnsClassName="md:grid-cols-2 xl:grid-cols-4"
          items={[
            { label: "id", value: id },
            { label: "schema_version", value: event?.schema_version ?? "—" },
            { label: "occurred_at", value: formatTs(event?.occurred_at), hint: String(event?.occurred_at || "") },
            { label: "ingested_at", value: formatTs(event?.ingested_at), hint: String(event?.ingested_at || "") },
            { label: "event_type", value: toText(event?.event_type || "—") },
            { label: "source", value: toText(event?.source || "—") },
            { label: "severity", value: toText(event?.severity || "—") },
            { label: "message", value: toText(event?.message || "—") },
          ]}
        />
        <KeyValueGrid
          columnsClassName="md:grid-cols-2 xl:grid-cols-4"
          items={[
            { label: "request_id", value: toText(event?.request_id || "—") },
            { label: "correlation_id", value: toText(event?.correlation_id || "—") },
            { label: "session_id", value: toText(event?.session_id || "—") },
            { label: "runtime_id", value: toText(event?.runtime_id || "—") },
            { label: "tab_id", value: toText(event?.tab_id || "—") },
            { label: "user_id", value: toText(event?.user_id || "—") },
            { label: "org_id", value: toText(event?.org_id || "—") },
            { label: "project_id", value: toText(event?.project_id || "—") },
          ]}
        />
        <KeyValueGrid
          columnsClassName="md:grid-cols-2 xl:grid-cols-4"
          items={[
            { label: "route", value: toText(event?.route || "—") },
            { label: "fingerprint", value: toText(event?.fingerprint || "—") },
            { label: "app_version", value: toText(event?.app_version || "—") },
            { label: "git_sha", value: toText(event?.git_sha || "—") },
          ]}
        />
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-400">{ru.admin.telemetryPage.detail.context}</div>
          <pre className="max-h-[420px] overflow-auto rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs leading-5 text-slate-100" data-testid="telemetry-context-json">
            {jsonPreview(event?.context_json)}
          </pre>
        </div>
      </div>
    </SectionCard>
  );
}
