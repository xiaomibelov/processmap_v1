import AdminFiltersBar from "../filters/AdminFiltersBar";
import AdminSearchInput from "../filters/AdminSearchInput";
import AdminSelectFilter from "../filters/AdminSelectFilter";
import { telemetryFilterValidation } from "../../utils/adminTelemetryQuery";
import { toText } from "../../adminUtils";
import { ru } from "../../../../shared/i18n/ru";

const EVENT_TYPE_OPTIONS = [
  { value: "", label: ru.admin.telemetryPage.filters.anyEventType },
  { value: "api_failure", label: "api_failure" },
  { value: "save_reload_anomaly", label: "save_reload_anomaly" },
  { value: "domain_invariant_violation", label: "domain_invariant_violation" },
  { value: "backend_exception", label: "backend_exception" },
  { value: "frontend_fatal", label: "frontend_fatal" },
  { value: "frontend_unhandled_rejection", label: "frontend_unhandled_rejection" },
];

const SOURCE_OPTIONS = [
  { value: "", label: ru.admin.telemetryPage.filters.anySource },
  { value: "frontend", label: "frontend" },
  { value: "backend", label: "backend" },
];

const SEVERITY_OPTIONS = [
  { value: "", label: ru.admin.telemetryPage.filters.anySeverity },
  { value: "fatal", label: "fatal" },
  { value: "error", label: "error" },
  { value: "warn", label: "warn" },
  { value: "info", label: "info" },
];

const ORDER_OPTIONS = [
  { value: "asc", label: ru.admin.telemetryPage.filters.orderAsc },
  { value: "desc", label: ru.admin.telemetryPage.filters.orderDesc },
];

export default function TelemetryEventsFilters({
  filters = {},
  onChange,
  onReset,
}) {
  const errors = telemetryFilterValidation(filters);
  function setPatch(patch) {
    onChange?.({ ...(filters || {}), ...(patch || {}) });
  }
  return (
    <AdminFiltersBar
      title={ru.admin.telemetryPage.filtersTitle}
      subtitle={ru.admin.telemetryPage.filtersSubtitle}
      activeFilters={[
        { label: "session_id", value: filters?.session_id },
        { label: "request_id", value: filters?.request_id },
        { label: "correlation_id", value: filters?.correlation_id },
        { label: "user_id", value: filters?.user_id },
        { label: "org_id", value: filters?.org_id },
        { label: "runtime_id", value: filters?.runtime_id },
        { label: "event_type", value: filters?.event_type },
        { label: "source", value: filters?.source },
        { label: "severity", value: filters?.severity },
        { label: "occurred_from", value: filters?.occurred_from },
        { label: "occurred_to", value: filters?.occurred_to },
      ]}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <AdminSearchInput testId="telemetry-filter-session-id" value={toText(filters?.session_id)} onChange={(value) => setPatch({ session_id: value })} placeholder="session_id" />
        <AdminSearchInput testId="telemetry-filter-request-id" value={toText(filters?.request_id)} onChange={(value) => setPatch({ request_id: value })} placeholder="request_id" />
        <AdminSearchInput testId="telemetry-filter-correlation-id" value={toText(filters?.correlation_id)} onChange={(value) => setPatch({ correlation_id: value })} placeholder="correlation_id" />
        <AdminSearchInput testId="telemetry-filter-user-id" value={toText(filters?.user_id)} onChange={(value) => setPatch({ user_id: value })} placeholder="user_id" />
        <AdminSearchInput testId="telemetry-filter-org-id" value={toText(filters?.org_id)} onChange={(value) => setPatch({ org_id: value })} placeholder="org_id" />
        <AdminSearchInput testId="telemetry-filter-runtime-id" value={toText(filters?.runtime_id)} onChange={(value) => setPatch({ runtime_id: value })} placeholder="runtime_id" />
        <AdminSelectFilter testId="telemetry-filter-event-type" value={toText(filters?.event_type)} onChange={(value) => setPatch({ event_type: value })} options={EVENT_TYPE_OPTIONS} />
        <AdminSelectFilter testId="telemetry-filter-source" value={toText(filters?.source)} onChange={(value) => setPatch({ source: value })} options={SOURCE_OPTIONS} />
        <AdminSelectFilter testId="telemetry-filter-severity" value={toText(filters?.severity)} onChange={(value) => setPatch({ severity: value })} options={SEVERITY_OPTIONS} />
        <AdminSearchInput testId="telemetry-filter-occurred-from" value={toText(filters?.occurred_from)} onChange={(value) => setPatch({ occurred_from: value })} placeholder="occurred_from Unix seconds" />
        <AdminSearchInput testId="telemetry-filter-occurred-to" value={toText(filters?.occurred_to)} onChange={(value) => setPatch({ occurred_to: value })} placeholder="occurred_to Unix seconds" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex min-w-[160px] flex-col gap-1 text-xs font-medium text-slate-500">
          <span>{ru.admin.telemetryPage.filters.limit}</span>
          <input
            className="input h-11 rounded-2xl border-slate-200 bg-white"
            data-testid="telemetry-filter-limit"
            min="1"
            max="100"
            type="number"
            value={String(filters?.limit || 50)}
            onChange={(event) => setPatch({ limit: event.target.value })}
          />
        </label>
        <label className="flex min-w-[180px] flex-col gap-1 text-xs font-medium text-slate-500">
          <span>{ru.admin.telemetryPage.filters.order}</span>
          <AdminSelectFilter testId="telemetry-filter-order" value={toText(filters?.order) || "asc"} onChange={(value) => setPatch({ order: value })} options={ORDER_OPTIONS} />
        </label>
        <button
          type="button"
          className="secondaryBtn mt-5 h-11 min-h-0 rounded-2xl px-4 py-0 text-sm"
          onClick={() => onReset?.()}
          data-testid="telemetry-filters-reset"
        >
          {ru.admin.telemetryPage.filters.reset}
        </button>
      </div>
      {errors.length ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="telemetry-filter-validation">
          {errors.join("; ")}
        </div>
      ) : null}
    </AdminFiltersBar>
  );
}
