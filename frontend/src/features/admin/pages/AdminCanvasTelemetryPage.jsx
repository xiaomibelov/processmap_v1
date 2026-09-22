import AdminPageContainer from "../layout/AdminPageContainer";
import ErrorState from "../components/common/ErrorState";
import KpiCard from "../components/common/KpiCard";
import LoadingBlock from "../components/common/LoadingBlock";
import CanvasTelemetryErrorList from "../components/canvasTelemetry/CanvasTelemetryErrorList";
import CanvasTelemetryFilters from "../components/canvasTelemetry/CanvasTelemetryFilters";
import CanvasTelemetryTimeline from "../components/canvasTelemetry/CanvasTelemetryTimeline";
import { asArray, asObject, toText } from "../utils/adminFormat";
import { ru } from "../../../shared/i18n/ru";

function CanvasTelemetrySummary({ payload = {} }) {
  const rows = asArray(payload?.items);
  const page = asObject(payload?.page);
  const diverged = rows.filter((row) => Number(row?.converged || 0) !== 1).length;
  const sessions = new Set(rows.map((row) => toText(row?.session_id)).filter(Boolean)).size;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard title={ru.admin.canvasTelemetryPage.summary.rows} value={String(rows.length)} hint={ru.admin.canvasTelemetryPage.summary.rowsHint} />
      <KpiCard title={ru.admin.canvasTelemetryPage.summary.total} value={String(page?.total ?? 0)} hint={ru.admin.canvasTelemetryPage.summary.totalHint} tone="accent" />
      <KpiCard title={ru.admin.canvasTelemetryPage.summary.diverged} value={String(diverged)} hint={ru.admin.canvasTelemetryPage.summary.divergedHint} tone={diverged ? "danger" : "ok"} />
      <KpiCard title={ru.admin.canvasTelemetryPage.summary.sessions} value={String(sessions)} hint={ru.admin.canvasTelemetryPage.summary.sessionsHint} />
    </div>
  );
}

export default function AdminCanvasTelemetryPage({
  payload = {},
  filters = {},
  loading = false,
  error = "",
  contextPayload = null,
  contextLoading = false,
  contextError = "",
  selectedGroupId = "",
  onFiltersChange,
  onFiltersReset,
  onOpenContext,
  onCloseContext,
}) {
  const rows = asArray(payload?.items);
  return (
    <AdminPageContainer summary={<CanvasTelemetrySummary payload={payload} />}>
      <CanvasTelemetryFilters filters={filters} onChange={onFiltersChange} onReset={onFiltersReset} />
      {loading ? <LoadingBlock label={ru.admin.canvasTelemetryPage.loading} /> : null}
      {!loading && error ? <ErrorState title={ru.admin.canvasTelemetryPage.errorTitle} message={error} /> : null}
      {!loading && !error ? (
        <CanvasTelemetryErrorList
          items={rows}
          selectedGroupId={selectedGroupId}
          onOpenContext={onOpenContext}
        />
      ) : null}
      {toText(selectedGroupId) ? (
        <div className="mt-3">
          {contextLoading ? <LoadingBlock label={ru.admin.canvasTelemetryPage.loading} /> : null}
          {!contextLoading && contextError ? (
            <ErrorState title={ru.admin.canvasTelemetryPage.errorTitle} message={contextError} />
          ) : null}
          {!contextLoading && !contextError && contextPayload ? (
            <CanvasTelemetryTimeline
              timeline={contextPayload?.timeline}
              sessionUrl={contextPayload?.session_url}
            />
          ) : null}
          <button
            type="button"
            className="mt-2 rounded border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => onCloseContext?.()}
          >
            {ru.admin.canvasTelemetryPage.closeContext}
          </button>
        </div>
      ) : null}
    </AdminPageContainer>
  );
}
