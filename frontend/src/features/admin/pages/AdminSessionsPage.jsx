import { useMemo } from "react";
import AdminPageContainer from "../layout/AdminPageContainer";
import AdminTablePagination from "../components/common/AdminTablePagination";
import AdminDateRangeFilter from "../components/filters/AdminDateRangeFilter";
import AdminFiltersBar from "../components/filters/AdminFiltersBar";
import AdminSearchInput from "../components/filters/AdminSearchInput";
import AdminSelectFilter from "../components/filters/AdminSelectFilter";
import AdminToggleFilter from "../components/filters/AdminToggleFilter";
import ReportsHealthWidget from "../components/dashboard/ReportsHealthWidget";
import RedisHealthWidget from "../components/dashboard/RedisHealthWidget";
import SessionsSummaryRow from "../components/sessions/SessionsSummaryRow";
import SessionsTable from "../components/sessions/SessionsTable";
import useAdminDashboardSnapshot from "../hooks/useAdminDashboardSnapshot";
import { asArray, toText } from "../utils/adminFormat";
import { updateFilterState } from "../utils/adminQuery";
import { ru } from "../../../shared/i18n/ru";

export default function AdminSessionsPage({
  payload = {},
  filters = {},
  onFiltersChange,
  paging = {},
  onPagingChange,
  onOpenSession,
}) {
  const rows = asArray(payload?.items);
  const dashboard = useAdminDashboardSnapshot();
  const dashboardWidgets = useMemo(() => {
    if (!dashboard.data) return null;
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <ReportsHealthWidget payload={dashboard.data?.charts?.report_doc_health || {}} />
        <RedisHealthWidget payload={dashboard.data?.redis_health || {}} />
      </div>
    );
  }, [dashboard.data]);
  const filterItems = [
    { label: ru.admin.filters.query, value: filters?.q },
    { label: ru.admin.filters.status, value: filters?.status },
    { label: ru.admin.filters.owners, value: filters?.ownerIds },
    { label: ru.admin.filters.attention, value: filters?.attentionOnly ? ru.common.yes : "" },
    { label: ru.admin.filters.range, value: filters?.updatedRange },
  ];
  function setPatch(patch) {
    onFiltersChange?.(updateFilterState(filters, patch));
  }
  return (
    <AdminPageContainer
      summary={<SessionsSummaryRow items={rows} />}
      secondary={dashboardWidgets}
    >
      <AdminFiltersBar title={ru.admin.sessionsPage.filtersTitle} subtitle={ru.admin.sessionsPage.filtersSubtitle} activeFilters={filterItems}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <AdminSearchInput value={toText(filters?.q)} onChange={(value) => setPatch({ q: value })} placeholder={ru.admin.sessionsPage.searchPlaceholder} testId="admin-sessions-q" />
          <AdminSelectFilter
            value={toText(filters?.status)}
            onChange={(value) => setPatch({ status: value })}
            testId="admin-sessions-status"
            options={[
              { value: "", label: ru.admin.filters.anyStatus },
              { value: "draft", label: ru.admin.statuses.draft },
              { value: "in_progress", label: ru.admin.statuses.inProgress },
              { value: "ready", label: ru.admin.statuses.ready },
            ]}
          />
          <AdminSearchInput value={toText(filters?.ownerIds)} onChange={(value) => setPatch({ ownerIds: value })} placeholder={ru.admin.sessionsPage.ownerIdsPlaceholder} />
          <AdminDateRangeFilter value={toText(filters?.updatedRange)} onChange={(value) => setPatch({ updatedRange: value })} />
          <AdminToggleFilter checked={Boolean(filters?.attentionOnly)} onChange={(value) => setPatch({ attentionOnly: value })} label={ru.admin.sessionsPage.attentionOnly} />
        </div>
      </AdminFiltersBar>
      <SessionsTable items={rows} onOpenSession={onOpenSession} />
      <AdminTablePagination
        total={paging?.total ?? payload?.count ?? 0}
        page={paging?.page ?? 1}
        pageSize={paging?.pageSize ?? 20}
        onPageChange={(value) => onPagingChange?.({ page: value })}
        onPageSizeChange={(value) => onPagingChange?.({ pageSize: value })}
        testIdPrefix="admin-sessions-pagination"
      />
    </AdminPageContainer>
  );
}
