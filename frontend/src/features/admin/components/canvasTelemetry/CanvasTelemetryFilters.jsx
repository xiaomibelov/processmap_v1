import SectionCard from "../common/SectionCard";
import { CANVAS_TELEMETRY_ERROR_CLASSES } from "../../utils/adminCanvasTelemetryQuery";
import { toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

function toDateTimeLocalValue(tsRaw) {
  const ts = Number(tsRaw || 0);
  if (!ts) return "";
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocalValue(valueRaw) {
  const value = toText(valueRaw);
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return String(Math.floor(d.getTime() / 1000));
}

export default function CanvasTelemetryFilters({ filters = {}, onChange, onReset }) {
  const patch = (key, value) => onChange?.({ ...filters, [key]: value });
  return (
    <SectionCard
      title={ru.admin.canvasTelemetryPage.filters.title}
      subtitle={ru.admin.canvasTelemetryPage.filters.subtitle}
      eyebrow={ru.admin.common.listEyebrow}
    >
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <label className="text-xs text-slate-500">
          {ru.admin.canvasTelemetryPage.filters.sessionId}
          <input
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            value={toText(filters.session_id)}
            onChange={(e) => patch("session_id", e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500">
          {ru.admin.canvasTelemetryPage.filters.userId}
          <input
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            value={toText(filters.user_id)}
            onChange={(e) => patch("user_id", e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500">
          {ru.admin.canvasTelemetryPage.filters.errorClass}
          <select
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            value={toText(filters.error_class)}
            onChange={(e) => patch("error_class", e.target.value)}
          >
            <option value="">{ru.admin.canvasTelemetryPage.filters.anyClass}</option>
            {CANVAS_TELEMETRY_ERROR_CLASSES.map((cls) => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          {ru.admin.canvasTelemetryPage.filters.converged}
          <select
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            value={toText(filters.converged)}
            onChange={(e) => patch("converged", e.target.value)}
          >
            <option value="">{ru.admin.canvasTelemetryPage.filters.anyConverged}</option>
            <option value="1">{ru.admin.canvasTelemetryPage.list.convergedYes}</option>
            <option value="0">{ru.admin.canvasTelemetryPage.list.convergedNo}</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          {ru.admin.canvasTelemetryPage.filters.from}
          <input
            type="datetime-local"
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            value={toDateTimeLocalValue(filters.last_seen_from)}
            onChange={(e) => patch("last_seen_from", fromDateTimeLocalValue(e.target.value))}
          />
        </label>
        <label className="text-xs text-slate-500">
          {ru.admin.canvasTelemetryPage.filters.to}
          <input
            type="datetime-local"
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            value={toDateTimeLocalValue(filters.last_seen_to)}
            onChange={(e) => patch("last_seen_to", fromDateTimeLocalValue(e.target.value))}
          />
        </label>
      </div>
      <button
        type="button"
        className="mt-3 rounded border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
        onClick={() => onReset?.()}
      >
        {ru.admin.canvasTelemetryPage.filters.reset}
      </button>
    </SectionCard>
  );
}
