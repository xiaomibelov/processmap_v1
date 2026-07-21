import AdminPageContainer from "../layout/AdminPageContainer";
import ErrorState from "../components/common/ErrorState";
import LoadingBlock from "../components/common/LoadingBlock";
import SectionCard from "../components/common/SectionCard";
import LifetimeDistributionChart from "../components/analytics/LifetimeDistributionChart";
import SessionAnalyticsKpiCards from "../components/analytics/SessionAnalyticsKpiCards";
import VersionDistributionChart from "../components/analytics/VersionDistributionChart";

// Session analytics page: thin client over /api/admin/analytics/sessions/*.
// All aggregation is server-side; this page only maps payloads to sections.
export default function AdminSessionAnalyticsPage({
  analytics = {},
  filters = {},
  paging = {},
  onFiltersChange,
  onPagingChange,
  onRefresh,
}) {
  const { summaryQ = {}, topQ = {}, caseStudiesQ = {} } = analytics;

  if (summaryQ.loading) {
    return <LoadingBlock label="Загрузка аналитики сессий…" />;
  }
  if (summaryQ.error) {
    return <ErrorState title="Ошибка загрузки аналитики" message={summaryQ.error} />;
  }

  const payload = summaryQ.data || {};
  const summary = payload.summary || {};
  const lifetimeBins = Array.isArray(payload.lifetime_distribution) ? payload.lifetime_distribution : [];
  const versionBins = Array.isArray(payload.version_distribution) ? payload.version_distribution : [];
  const dataQuality = payload.data_quality || {};
  const topPayload = topQ.data || {};
  const casePayload = caseStudiesQ.data || {};

  return (
    <AdminPageContainer
      summary={<SessionAnalyticsKpiCards summary={summary} />}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <LifetimeDistributionChart bins={lifetimeBins} />
        <VersionDistributionChart bins={versionBins} />
      </div>
      <SectionCard title="Топ сессий" data-testid="analytics-top-section">
        <div className="text-xs text-slate-500" data-testid="analytics-top-placeholder">
          {topQ.loading ? "Загрузка…" : `Записей: ${topPayload.total ?? 0}`}
        </div>
      </SectionCard>
      <SectionCard title="Кейсы" data-testid="analytics-cases-section">
        <div className="text-xs text-slate-500" data-testid="analytics-cases-placeholder">
          {caseStudiesQ.loading ? "Загрузка…" : `Кейсов: ${(casePayload.items || []).length}`}
        </div>
      </SectionCard>
      <SectionCard
        title="Качество данных"
        action={(
          <button
            type="button"
            className="secondaryBtn h-7 min-h-0 rounded-lg px-3 py-0 text-xs"
            onClick={() => onRefresh?.()}
            data-testid="analytics-refresh"
          >
            Обновить данные
          </button>
        )}
      >
        <div className="text-xs text-slate-500" data-testid="analytics-quality-placeholder">
          {`Пустой XML: ${dataQuality.empty_xml ?? 0} · Без версий: ${dataQuality.no_versions ?? 0}`}
        </div>
      </SectionCard>
    </AdminPageContainer>
  );
}
