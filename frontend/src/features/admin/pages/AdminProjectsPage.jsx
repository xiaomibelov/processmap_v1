import AdminPageContainer from "../layout/AdminPageContainer";
import SectionCard from "../components/common/SectionCard";
import AdminTablePagination from "../components/common/AdminTablePagination";
import AdminFiltersBar from "../components/filters/AdminFiltersBar";
import AdminSearchInput from "../components/filters/AdminSearchInput";
import ProjectsSummaryRow from "../components/projects/ProjectsSummaryRow";
import ProjectsTable from "../components/projects/ProjectsTable";
import { toText } from "../utils/adminFormat";
import { updateFilterState } from "../utils/adminQuery";
import { ru } from "../../../shared/i18n/ru";

export default function AdminProjectsPage({
  payload = {},
  filters = {},
  onFiltersChange,
  paging = {},
  onPagingChange,
}) {
  function setPatch(patch) {
    onFiltersChange?.(updateFilterState(filters, patch));
  }
  return (
    <AdminPageContainer
      summary={<ProjectsSummaryRow items={payload?.items || []} />}
      secondary={(
        <SectionCard title={ru.admin.projectsPage.notesTitle} subtitle={ru.admin.projectsPage.notesSubtitle} eyebrow={ru.admin.projectsPage.notesEyebrow}>
          <div className="text-sm text-slate-500">
            {ru.admin.projectsPage.notesBody}
          </div>
        </SectionCard>
      )}
    >
      <AdminFiltersBar
        title={ru.admin.projectsPage.filtersTitle}
        subtitle={ru.admin.projectsPage.filtersSubtitle}
        activeFilters={[{ label: ru.admin.filters.query, value: filters?.q }]}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AdminSearchInput
            value={toText(filters?.q)}
            onChange={(value) => setPatch({ q: value })}
            placeholder={ru.admin.projectsPage.searchPlaceholder || ru.admin.sessionsPage.searchPlaceholder}
            testId="admin-projects-q"
          />
        </div>
      </AdminFiltersBar>
      <ProjectsTable items={payload?.items || []} />
      <AdminTablePagination
        total={paging?.total ?? payload?.count ?? 0}
        page={paging?.page ?? 1}
        pageSize={paging?.pageSize ?? 20}
        onPageChange={(value) => onPagingChange?.({ page: value })}
        onPageSizeChange={(value) => onPagingChange?.({ pageSize: value })}
        testIdPrefix="admin-projects-pagination"
      />
    </AdminPageContainer>
  );
}
