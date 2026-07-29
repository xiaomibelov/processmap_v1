import AdminPageContainer from "../layout/AdminPageContainer";
import ErrorState from "../components/common/ErrorState";
import LoadingBlock from "../components/common/LoadingBlock";
import AuthorAnalytics from "../components/analytics/AuthorAnalytics";
import CaseStudyCards from "../components/analytics/CaseStudyCards";
import DataQualityPanel from "../components/analytics/DataQualityPanel";
import LifetimeDistributionChart from "../components/analytics/LifetimeDistributionChart";
import SessionAnalyticsKpiCards from "../components/analytics/SessionAnalyticsKpiCards";
import TopSessionsTable from "../components/analytics/TopSessionsTable";
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
      <TopSessionsTable
        payload={topPayload}
        loading={topQ.loading}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onPagingChange={onPagingChange}
      />
      <AuthorAnalytics
        authorStats={Array.isArray(payload.author_stats) ? payload.author_stats : []}
        excludeTest={!!filters.excludeTest}
        onExcludeTestChange={(checked) => onFiltersChange?.({ excludeTest: !!checked })}
      />
      <CaseStudyCards payload={casePayload} loading={caseStudiesQ.loading} />
      <DataQualityPanel
        dataQuality={dataQuality}
        generatedAt={payload.generated_at}
        onRefresh={onRefresh}
      />
    </AdminPageContainer>
  );
}
