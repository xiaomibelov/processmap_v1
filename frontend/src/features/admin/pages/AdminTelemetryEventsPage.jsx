import AdminPageContainer from "../layout/AdminPageContainer";
import ErrorState from "../components/common/ErrorState";
import KpiCard from "../components/common/KpiCard";
import LoadingBlock from "../components/common/LoadingBlock";
import TelemetryEventDetailPanel from "../components/telemetry/TelemetryEventDetailPanel";
import TelemetryEventsFilters from "../components/telemetry/TelemetryEventsFilters";
import TelemetryEventsTimeline from "../components/telemetry/TelemetryEventsTimeline";
import { asArray, asObject, toText } from "../utils/adminFormat";
import { ru } from "../../../shared/i18n/ru";

function TelemetrySummary({ payload = {}, filters = {} }) {
  const page = asObject(payload?.page);
  const rows = asArray(payload?.items);
  const timeline = asObject(payload?.timeline);
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard title={ru.admin.telemetryPage.summary.rows} value={String(rows.length)} hint={ru.admin.telemetryPage.summary.rowsHint} />
      <KpiCard title={ru.admin.telemetryPage.summary.total} value={String(page?.total ?? payload?.count ?? 0)} hint={ru.admin.telemetryPage.summary.totalHint} tone="accent" />
      <KpiCard title={ru.admin.telemetryPage.summary.order} value={toText(page?.order || timeline?.order || filters?.order || "asc")} hint={ru.admin.telemetryPage.summary.orderHint} />
      <KpiCard title={ru.admin.telemetryPage.summary.dedupe} value={timeline?.deduped === true ? "on" : "off"} hint={ru.admin.telemetryPage.summary.dedupeHint} />
    </div>
  );
}

export default function AdminTelemetryEventsPage({
  payload = {},
  filters = {},
  loading = false,
  error = "",
  detailPayload = null,
  detailLoading = false,
  detailError = "",
  selectedEventId = "",
  onFiltersChange,
  onFiltersReset,
  onOpenDetail,
  onPivotCorrelationId,
  onCloseDetail,
}) {
  const rows = asArray(payload?.items);
  const detailItem = toText(selectedEventId) ? asObject(detailPayload?.item) : {};
  return (
    <AdminPageContainer summary={<TelemetrySummary payload={payload} filters={filters} />}>
      <TelemetryEventsFilters filters={filters} onChange={onFiltersChange} onReset={onFiltersReset} />
      {loading ? <LoadingBlock label={ru.admin.telemetryPage.loading} /> : null}
      {!loading && error ? <ErrorState title={ru.admin.telemetryPage.errorTitle} message={error} /> : null}
      {!loading && !error ? (
        <TelemetryEventsTimeline
          items={rows}
          selectedEventId={selectedEventId}
          onOpenDetail={onOpenDetail}
        />
      ) : null}
      <TelemetryEventDetailPanel
        item={detailItem}
        selectedEventId={selectedEventId}
        loading={detailLoading}
        error={detailError}
        onPivotCorrelationId={onPivotCorrelationId}
        onClose={onCloseDetail}
      />
    </AdminPageContainer>
  );
}
