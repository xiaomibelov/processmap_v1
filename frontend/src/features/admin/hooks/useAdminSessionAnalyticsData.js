import useAdminDataQuery from "./useAdminDataQuery";
import {
  getSessionAnalyticsCaseStudies,
  getSessionAnalyticsSummary,
  getSessionAnalyticsTop,
} from "../api/adminSessionAnalyticsApi";

// Thin client: every query-param change re-fetches; all aggregation happens
// server-side. `refreshNonce` changes on each «Обновить данные» click so the
// summary/case-studies endpoints are re-queried with refresh=true.
export default function useAdminSessionAnalyticsData({
  enabled = true,
  refresh = "",
  refreshNonce = "",
  excludeTest = "",
  sortBy = "version_count",
  sortOrder = "desc",
  filterAuthor = "",
  page = 1,
  pageSize = 20,
  caseLimit = 3,
}) {
  const summaryQ = useAdminDataQuery({
    enabled,
    fetcher: () => getSessionAnalyticsSummary({ refresh, exclude_test: excludeTest }),
    deps: [refresh, refreshNonce, excludeTest],
  });
  const topQ = useAdminDataQuery({
    enabled,
    fetcher: () => getSessionAnalyticsTop({
      sort_by: sortBy,
      sort_order: sortOrder,
      filter_author: filterAuthor,
      page,
      page_size: pageSize,
    }),
    deps: [sortBy, sortOrder, filterAuthor, page, pageSize],
  });
  const caseStudiesQ = useAdminDataQuery({
    enabled,
    fetcher: () => getSessionAnalyticsCaseStudies({ limit: caseLimit, refresh }),
    deps: [caseLimit, refresh, refreshNonce],
  });
  return { summaryQ, topQ, caseStudiesQ };
}
