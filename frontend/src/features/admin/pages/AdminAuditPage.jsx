import AdminPageContainer from "../layout/AdminPageContainer";
import AuditSummaryRow from "../components/audit/AuditSummaryRow";
import AuditTable from "../components/audit/AuditTable";
import AdminTablePagination from "../components/common/AdminTablePagination";
import AdminDateRangeFilter from "../components/filters/AdminDateRangeFilter";
import AdminFiltersBar from "../components/filters/AdminFiltersBar";
import AdminSearchInput from "../components/filters/AdminSearchInput";
import AdminSelectFilter from "../components/filters/AdminSelectFilter";
import { toText } from "../utils/adminFormat";
import { updateFilterState } from "../utils/adminQuery";
import { ru } from "../../../shared/i18n/ru";

export default function AdminAuditPage({
  payload = {},
  filters = {},
  onFiltersChange,
  paging = {},
  onPagingChange,
}) {
  const rows = payload?.items || [];
  function setPatch(patch) {
    onFiltersChange?.(updateFilterState(filters, patch));
  }
  return (
    <AdminPageContainer
      summary={<AuditSummaryRow summary={{ ...(payload?.summary || {}), total: paging?.total ?? payload?.count ?? 0 }} />}
      secondary={null}
    >
      <AdminFiltersBar
        title={ru.admin.auditPage.filtersTitle}
        subtitle={ru.admin.auditPage.filtersSubtitle}
        activeFilters={[
          { label: ru.admin.filters.query, value: filters?.q },
          { label: ru.admin.filters.status, value: filters?.status },
          { label: ru.admin.auditPage.table.action, value: filters?.action },
          { label: ru.admin.auditPage.table.project, value: filters?.projectId },
          { label: ru.admin.auditPage.table.session, value: filters?.sessionId },
          { label: ru.admin.filters.range, value: filters?.dateRange },
        ]}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <AdminSearchInput value={toText(filters?.q)} onChange={(value) => setPatch({ q: value })} placeholder={ru.admin.auditPage.searchPlaceholder} />
          <AdminSelectFilter
            value={toText(filters?.status)}
            onChange={(value) => setPatch({ status: value })}
            options={[
              { value: "", label: ru.admin.filters.anyStatus },
              { value: "ok", label: "ok" },
              { value: "fail", label: ru.admin.statuses.fail },
            ]}
          />
          <AdminSearchInput value={toText(filters?.action)} onChange={(value) => setPatch({ action: value })} placeholder={ru.admin.auditPage.actionPlaceholder} />
          <AdminSearchInput value={toText(filters?.projectId)} onChange={(value) => setPatch({ projectId: value })} placeholder={ru.admin.auditPage.projectPlaceholder} />
          <AdminSearchInput value={toText(filters?.sessionId)} onChange={(value) => setPatch({ sessionId: value })} placeholder={ru.admin.auditPage.sessionPlaceholder} />
          <AdminDateRangeFilter value={toText(filters?.dateRange)} onChange={(value) => setPatch({ dateRange: value })} />
        </div>
      </AdminFiltersBar>
      <AuditTable items={rows} />
      <AdminTablePagination
        total={paging?.total ?? payload?.count ?? 0}
        page={paging?.page ?? 1}
        pageSize={paging?.pageSize ?? 20}
        onPageChange={(value) => onPagingChange?.({ page: value })}
        onPageSizeChange={(value) => onPagingChange?.({ pageSize: value })}
        testIdPrefix="admin-audit-pagination"
      />
    </AdminPageContainer>
  );
}
